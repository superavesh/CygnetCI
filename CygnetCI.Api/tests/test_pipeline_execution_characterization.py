"""Characterization tests for the pipeline-execution business logic, now living
in pipeline_service.py (extracted from routers/pipelines.py — logic unchanged).
These tests were originally written against the router functions to lock in
behavior BEFORE the extraction (including the DAG-advancement logic that
unlocks downstream release pipelines and detects overall release completion);
they were updated to call the service directly once the extraction was
verified to preserve identical behavior.

All DB writes happen inside the db_session fixture's rolled-back transaction
(see conftest.py) — nothing here is ever committed to the real database.
"""
import uuid

import pytest
from fastapi import HTTPException

import models
from pipeline_service import run, complete_pickup, RunPipelineRequest
from release_service import deploy_release_pipelines, DeployReleaseRequest


def _run_pipeline(pipeline_id, request, db):
    """Mirrors what the router's run_pipeline endpoint does before delegating
    to pipeline_service.run(): fetch + 404 check."""
    pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return run(pipeline, request, db)


def _complete_pickup(pickup_id, completion_data, db):
    """Mirrors what the router's complete_pipeline_pickup endpoint does before
    delegating to pipeline_service.complete_pickup(): fetch + 404 check."""
    pickup = db.query(models.PipelinePickup).filter(models.PipelinePickup.id == pickup_id).first()
    if not pickup:
        raise HTTPException(status_code=404, detail="Pickup not found")
    return complete_pickup(pickup, completion_data, db)


def _make_customer(db):
    customer = models.Customer(name=f"test-customer-{uuid.uuid4().hex[:8]}", display_name="Test Customer")
    db.add(customer)
    db.flush()
    return customer.id


def _make_agent(db, customer_id):
    agent = models.Agent(
        name=f"test-agent-{uuid.uuid4().hex[:8]}", uuid=str(uuid.uuid4()),
        location="test", status="online", customer_id=customer_id,
    )
    db.add(agent)
    db.flush()
    return agent


def _make_pipeline(db, customer_id, name="test-pipeline", agent_id=None):
    pipeline = models.Pipeline(
        name=f"{name}-{uuid.uuid4().hex[:8]}", status="pending", branch="main",
        customer_id=customer_id, agent_id=agent_id,
    )
    db.add(pipeline)
    db.flush()
    return pipeline


# ---------------------------------------------------------------------------
# run_pipeline
# ---------------------------------------------------------------------------

def test_run_pipeline_creates_execution_and_pickup(db_session):
    db = db_session
    customer_id = _make_customer(db)
    agent = _make_agent(db, customer_id)
    pipeline = _make_pipeline(db, customer_id)

    request = RunPipelineRequest(agent_id=agent.id, parameters={"foo": "bar"})
    result = _run_pipeline(pipeline.id, request, db)

    assert result["success"] is True
    execution = db.query(models.PipelineExecution).filter(models.PipelineExecution.id == result["executionId"]).first()
    assert execution.status == "running"
    pickup = db.query(models.PipelinePickup).filter(models.PipelinePickup.pipeline_execution_id == execution.id).first()
    assert pickup is not None
    assert pickup.agent_id == agent.id
    param = db.query(models.PipelineExecutionParam).filter(models.PipelineExecutionParam.execution_id == execution.id).first()
    assert param.param_name == "foo" and param.param_value == "bar"


def test_run_pipeline_uses_default_agent_when_not_specified(db_session):
    db = db_session
    customer_id = _make_customer(db)
    agent = _make_agent(db, customer_id)
    pipeline = _make_pipeline(db, customer_id, agent_id=agent.id)

    request = RunPipelineRequest()  # no agent_id -> falls back to pipeline.agent_id
    result = _run_pipeline(pipeline.id, request, db)

    execution = db.query(models.PipelineExecution).filter(models.PipelineExecution.id == result["executionId"]).first()
    pickup = db.query(models.PipelinePickup).filter(models.PipelinePickup.pipeline_execution_id == execution.id).first()
    assert pickup.agent_id == agent.id


def test_run_pipeline_no_agent_rejected(db_session):
    db = db_session
    customer_id = _make_customer(db)
    pipeline = _make_pipeline(db, customer_id)  # no default agent

    request = RunPipelineRequest()
    with pytest.raises(HTTPException) as exc_info:
        _run_pipeline(pipeline.id, request, db)
    assert exc_info.value.status_code == 400


def test_run_pipeline_not_found(db_session):
    db = db_session
    with pytest.raises(HTTPException) as exc_info:
        _run_pipeline(999999999, RunPipelineRequest(), db)
    assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# complete_pipeline_pickup — standalone (non-release) execution
# ---------------------------------------------------------------------------

def test_complete_pickup_standalone_success(db_session):
    db = db_session
    customer_id = _make_customer(db)
    agent = _make_agent(db, customer_id)
    pipeline = _make_pipeline(db, customer_id)

    result = _run_pipeline(pipeline.id, RunPipelineRequest(agent_id=agent.id), db)
    pickup = db.query(models.PipelinePickup).filter(
        models.PipelinePickup.pipeline_execution_id == result["executionId"]
    ).first()

    _complete_pickup(pickup.id, {"success": True}, db)

    db.refresh(pickup)
    execution = db.query(models.PipelineExecution).filter(models.PipelineExecution.id == result["executionId"]).first()
    pipeline_row = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline.id).first()

    assert pickup.status == "completed"
    assert execution.status == "success"
    assert execution.completed_at is not None
    assert pipeline_row.status == "success"


def test_complete_pickup_not_found(db_session):
    db = db_session
    with pytest.raises(HTTPException) as exc_info:
        _complete_pickup(999999999, {"success": True}, db)
    assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# complete_pipeline_pickup — DAG advancement (release-triggered pipelines)
# ---------------------------------------------------------------------------

def _deploy_dag_release(db, customer_id, agent):
    """Build a release with two pipeline nodes: pipeline_a (root) -> pipeline_b (depends on a)."""
    pipeline_a = _make_pipeline(db, customer_id, "pipeline-a")
    pipeline_b = _make_pipeline(db, customer_id, "pipeline-b")
    release = models.Release(name=f"test-release-{uuid.uuid4().hex[:8]}", customer_id=customer_id, status="active")
    db.add(release)
    db.flush()

    rp_a = models.ReleasePipeline(release_id=release.id, pipeline_id=pipeline_a.id, order_index=0)
    db.add(rp_a)
    db.flush()
    rp_b = models.ReleasePipeline(
        release_id=release.id, pipeline_id=pipeline_b.id, order_index=1, depends_on=rp_a.id
    )
    db.add(rp_b)
    db.flush()

    request = DeployReleaseRequest(triggered_by="tester", agent_id=agent.id)
    deploy_result = deploy_release_pipelines(release, [rp_a, rp_b], request, db)
    return release, pipeline_a, pipeline_b, deploy_result


def test_complete_pickup_unlocks_downstream_dag_node(db_session):
    db = db_session
    customer_id = _make_customer(db)
    agent = _make_agent(db, customer_id)
    release, pipeline_a, pipeline_b, deploy_result = _deploy_dag_release(db, customer_id, agent)

    exec_a = db.query(models.PipelineExecution).filter(
        models.PipelineExecution.release_execution_id == deploy_result["release_execution_id"],
        models.PipelineExecution.pipeline_id == pipeline_a.id,
    ).first()
    pickup_a = db.query(models.PipelinePickup).filter(
        models.PipelinePickup.pipeline_execution_id == exec_a.id
    ).first()

    _complete_pickup(pickup_a.id, {"success": True}, db)

    exec_b = db.query(models.PipelineExecution).filter(
        models.PipelineExecution.release_execution_id == deploy_result["release_execution_id"],
        models.PipelineExecution.pipeline_id == pipeline_b.id,
    ).first()
    assert exec_b.status == "running"
    assert exec_b.started_at is not None

    pickup_b = db.query(models.PipelinePickup).filter(
        models.PipelinePickup.pipeline_execution_id == exec_b.id
    ).first()
    assert pickup_b is not None
    assert pickup_b.agent_id == agent.id

    # Not all nodes terminal yet -> release execution still in progress
    release_execution = db.query(models.ReleaseExecution).filter(
        models.ReleaseExecution.id == deploy_result["release_execution_id"]
    ).first()
    assert release_execution.status == "in_progress"


def test_complete_pickup_marks_release_succeeded_when_all_terminal(db_session):
    db = db_session
    customer_id = _make_customer(db)
    agent = _make_agent(db, customer_id)
    release, pipeline_a, pipeline_b, deploy_result = _deploy_dag_release(db, customer_id, agent)

    exec_a = db.query(models.PipelineExecution).filter(
        models.PipelineExecution.release_execution_id == deploy_result["release_execution_id"],
        models.PipelineExecution.pipeline_id == pipeline_a.id,
    ).first()
    pickup_a = db.query(models.PipelinePickup).filter(models.PipelinePickup.pipeline_execution_id == exec_a.id).first()
    _complete_pickup(pickup_a.id, {"success": True}, db)

    exec_b = db.query(models.PipelineExecution).filter(
        models.PipelineExecution.release_execution_id == deploy_result["release_execution_id"],
        models.PipelineExecution.pipeline_id == pipeline_b.id,
    ).first()
    pickup_b = db.query(models.PipelinePickup).filter(models.PipelinePickup.pipeline_execution_id == exec_b.id).first()
    _complete_pickup(pickup_b.id, {"success": True}, db)

    release_execution = db.query(models.ReleaseExecution).filter(
        models.ReleaseExecution.id == deploy_result["release_execution_id"]
    ).first()
    assert release_execution.status == "succeeded"
    assert release_execution.completed_at is not None


def test_complete_pickup_failure_does_not_unlock_downstream(db_session):
    """Characterizes existing behavior as-is: if the root node fails, the
    downstream node is never unlocked (stays 'pending' forever) and the release
    execution never reaches a terminal state either, since not all nodes become
    terminal. This is not necessarily correct behavior — just what happens today."""
    db = db_session
    customer_id = _make_customer(db)
    agent = _make_agent(db, customer_id)
    release, pipeline_a, pipeline_b, deploy_result = _deploy_dag_release(db, customer_id, agent)

    exec_a = db.query(models.PipelineExecution).filter(
        models.PipelineExecution.release_execution_id == deploy_result["release_execution_id"],
        models.PipelineExecution.pipeline_id == pipeline_a.id,
    ).first()
    pickup_a = db.query(models.PipelinePickup).filter(models.PipelinePickup.pipeline_execution_id == exec_a.id).first()

    _complete_pickup(pickup_a.id, {"success": False, "error_message": "boom"}, db)

    exec_b = db.query(models.PipelineExecution).filter(
        models.PipelineExecution.release_execution_id == deploy_result["release_execution_id"],
        models.PipelineExecution.pipeline_id == pipeline_b.id,
    ).first()
    assert exec_b.status == "pending"  # never unlocked

    pickup_b_count = db.query(models.PipelinePickup).filter(
        models.PipelinePickup.pipeline_execution_id == exec_b.id
    ).count()
    assert pickup_b_count == 0

    release_execution = db.query(models.ReleaseExecution).filter(
        models.ReleaseExecution.id == deploy_result["release_execution_id"]
    ).first()
    assert release_execution.status == "in_progress"  # exec_b never became terminal
