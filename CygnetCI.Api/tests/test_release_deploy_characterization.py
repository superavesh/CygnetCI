"""Characterization tests for the release-deploy business logic, now living in
release_service.py (extracted from routers/releases.py — logic unchanged).
These tests were originally written against the router functions to lock in
behavior BEFORE the extraction; they were updated to call the service directly
once the extraction was verified to preserve identical behavior.

All DB writes happen inside the db_session fixture's rolled-back transaction
(see conftest.py) — nothing here is ever committed to the real database.
"""
import uuid

import pytest
from fastapi import HTTPException

import models
from release_service import deploy, deploy_release_pipelines, DeployReleaseRequest


def _deploy_release(release_id, request, db):
    """Mirrors what the router's deploy_release endpoint does before delegating
    to release_service.deploy(): fetch + 404 check. (The router's
    require_customer_access check is a separate, already-tested concern in
    deps.py — not re-tested here.)"""
    release = db.query(models.Release).filter(models.Release.id == release_id).first()
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")
    return deploy(release, request, db)


def _make_customer(db):
    customer = models.Customer(
        name=f"test-customer-{uuid.uuid4().hex[:8]}",
        display_name="Test Customer",
    )
    db.add(customer)
    db.flush()
    return customer.id


def _make_agent(db, customer_id):
    agent = models.Agent(
        name=f"test-agent-{uuid.uuid4().hex[:8]}",
        uuid=str(uuid.uuid4()),
        location="test",
        status="online",
        customer_id=customer_id,
    )
    db.add(agent)
    db.flush()
    return agent


def _make_pipeline(db, customer_id, name="test-pipeline"):
    pipeline = models.Pipeline(
        name=f"{name}-{uuid.uuid4().hex[:8]}",
        status="pending",
        branch="main",
        customer_id=customer_id,
    )
    db.add(pipeline)
    db.flush()
    return pipeline


def _make_release(db, customer_id):
    release = models.Release(
        name=f"test-release-{uuid.uuid4().hex[:8]}",
        customer_id=customer_id,
        status="active",
    )
    db.add(release)
    db.flush()
    return release


def _make_environment(db, requires_approval=False):
    env = models.Environment(
        name=f"test-env-{uuid.uuid4().hex[:8]}",
        requires_approval=requires_approval,
    )
    db.add(env)
    db.flush()
    return env


# ---------------------------------------------------------------------------
# Pipeline-based deploy (DAG)
# ---------------------------------------------------------------------------

def test_deploy_pipeline_based_dag_root_and_downstream(db_session):
    db = db_session
    customer_id = _make_customer(db)
    agent = _make_agent(db, customer_id)
    pipeline_a = _make_pipeline(db, customer_id, "pipeline-a")
    pipeline_b = _make_pipeline(db, customer_id, "pipeline-b")
    release = _make_release(db, customer_id)

    rp_a = models.ReleasePipeline(
        release_id=release.id, pipeline_id=pipeline_a.id, order_index=0, execution_mode="sequential"
    )
    db.add(rp_a)
    db.flush()
    rp_b = models.ReleasePipeline(
        release_id=release.id, pipeline_id=pipeline_b.id, order_index=1,
        execution_mode="sequential", depends_on=rp_a.id,
    )
    db.add(rp_b)
    db.flush()

    request = DeployReleaseRequest(triggered_by="tester", agent_id=agent.id)

    result = deploy_release_pipelines(release, [rp_a, rp_b], request, db)

    assert result["success"] is True
    assert result["release_number"] == "Release-1"

    execs = (
        db.query(models.PipelineExecution)
        .filter(models.PipelineExecution.release_execution_id == result["release_execution_id"])
        .all()
    )
    by_pipeline = {e.pipeline_id: e for e in execs}
    assert by_pipeline[pipeline_a.id].status == "running"
    assert by_pipeline[pipeline_b.id].status == "pending"

    root_pickups = (
        db.query(models.PipelinePickup)
        .filter(models.PipelinePickup.pipeline_execution_id == by_pipeline[pipeline_a.id].id)
        .all()
    )
    assert len(root_pickups) == 1

    downstream_pickups = (
        db.query(models.PipelinePickup)
        .filter(models.PipelinePickup.pipeline_execution_id == by_pipeline[pipeline_b.id].id)
        .all()
    )
    assert len(downstream_pickups) == 0


def test_deploy_pipeline_based_with_parameters_does_not_crash(db_session):
    """Regression test: deploy_release_pipelines used to raise AttributeError
    (models.PipelineExecutionParameter doesn't exist — only PipelineExecutionParam,
    with different field names) whenever request.parameters was non-empty. This is
    the pipeline-based-release parameters path, distinct from the top-level
    ReleaseExecutionParameter storage tested elsewhere."""
    db = db_session
    customer_id = _make_customer(db)
    agent = _make_agent(db, customer_id)
    pipeline = _make_pipeline(db, customer_id)
    release = _make_release(db, customer_id)
    rp = models.ReleasePipeline(release_id=release.id, pipeline_id=pipeline.id, order_index=0)
    db.add(rp)
    db.flush()

    request = DeployReleaseRequest(triggered_by="tester", agent_id=agent.id, parameters={"env": "prod"})
    result = deploy_release_pipelines(release, [rp], request, db)

    assert result["success"] is True
    execution = db.query(models.PipelineExecution).filter(
        models.PipelineExecution.release_execution_id == result["release_execution_id"]
    ).first()
    stored = db.query(models.PipelineExecutionParam).filter(
        models.PipelineExecutionParam.execution_id == execution.id
    ).first()
    assert stored is not None
    assert stored.param_name == "env"
    assert stored.param_value == "prod"


def test_deploy_pipeline_based_second_execution_increments_release_number(db_session):
    db = db_session
    customer_id = _make_customer(db)
    agent = _make_agent(db, customer_id)
    pipeline = _make_pipeline(db, customer_id)
    release = _make_release(db, customer_id)
    rp = models.ReleasePipeline(release_id=release.id, pipeline_id=pipeline.id, order_index=0)
    db.add(rp)
    db.flush()

    request = DeployReleaseRequest(triggered_by="tester", agent_id=agent.id)
    first = deploy_release_pipelines(release, [rp], request, db)
    second = deploy_release_pipelines(release, [rp], request, db)

    assert first["release_number"] == "Release-1"
    assert second["release_number"] == "Release-2"


def test_deploy_pipeline_based_requires_agent_id(db_session):
    db = db_session
    customer_id = _make_customer(db)
    pipeline = _make_pipeline(db, customer_id)
    release = _make_release(db, customer_id)
    rp = models.ReleasePipeline(release_id=release.id, pipeline_id=pipeline.id, order_index=0)
    db.add(rp)
    db.flush()

    request = DeployReleaseRequest(triggered_by="tester")  # no agent_id

    with pytest.raises(HTTPException) as exc_info:
        deploy_release_pipelines(release, [rp], request, db)
    assert exc_info.value.status_code == 400


def test_deploy_pipeline_based_agent_not_found(db_session):
    db = db_session
    customer_id = _make_customer(db)
    pipeline = _make_pipeline(db, customer_id)
    release = _make_release(db, customer_id)
    rp = models.ReleasePipeline(release_id=release.id, pipeline_id=pipeline.id, order_index=0)
    db.add(rp)
    db.flush()

    request = DeployReleaseRequest(triggered_by="tester", agent_id=999999999)

    with pytest.raises(HTTPException) as exc_info:
        deploy_release_pipelines(release, [rp], request, db)
    assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# Legacy stage-based deploy
# ---------------------------------------------------------------------------

def test_deploy_stage_based_no_approval_creates_pickup(db_session):
    db = db_session
    customer_id = _make_customer(db)
    agent = _make_agent(db, customer_id)
    release = _make_release(db, customer_id)
    env = _make_environment(db, requires_approval=False)
    stage = models.ReleaseStage(
        release_id=release.id, environment_id=env.id, order_index=0, pre_deployment_approval=False
    )
    db.add(stage)
    db.flush()

    request = DeployReleaseRequest(triggered_by="tester", agent_id=agent.id)
    result = _deploy_release(release.id, request, db)

    assert result["success"] is True
    stage_exec = (
        db.query(models.StageExecution)
        .filter(models.StageExecution.release_execution_id == result["executionId"])
        .first()
    )
    assert stage_exec.status == "pending"
    assert stage_exec.approval_status == "not_required"
    pickup = (
        db.query(models.ReleasePickup)
        .filter(models.ReleasePickup.stage_execution_id == stage_exec.id)
        .first()
    )
    assert pickup is not None


def test_deploy_stage_based_requires_approval_no_pickup(db_session):
    db = db_session
    customer_id = _make_customer(db)
    agent = _make_agent(db, customer_id)
    release = _make_release(db, customer_id)
    env = _make_environment(db, requires_approval=True)
    stage = models.ReleaseStage(release_id=release.id, environment_id=env.id, order_index=0)
    db.add(stage)
    db.flush()

    request = DeployReleaseRequest(triggered_by="tester", agent_id=agent.id)
    result = _deploy_release(release.id, request, db)

    stage_exec = (
        db.query(models.StageExecution)
        .filter(models.StageExecution.release_execution_id == result["executionId"])
        .first()
    )
    assert stage_exec.status == "awaiting_approval"
    assert stage_exec.approval_status == "pending"
    pickup = (
        db.query(models.ReleasePickup)
        .filter(models.ReleasePickup.stage_execution_id == stage_exec.id)
        .first()
    )
    assert pickup is None


def test_deploy_no_stages_or_pipelines_rejected(db_session):
    db = db_session
    customer_id = _make_customer(db)
    release = _make_release(db, customer_id)

    request = DeployReleaseRequest(triggered_by="tester")
    with pytest.raises(HTTPException) as exc_info:
        _deploy_release(release.id, request, db)
    assert exc_info.value.status_code == 400


def test_deploy_release_not_found(db_session):
    db = db_session
    request = DeployReleaseRequest(triggered_by="tester")
    with pytest.raises(HTTPException) as exc_info:
        _deploy_release(999999999, request, db)
    assert exc_info.value.status_code == 404
