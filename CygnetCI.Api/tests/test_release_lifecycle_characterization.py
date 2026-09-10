"""Characterization tests for the release-lifecycle business logic, now living
in release_service.py (extracted from routers/releases.py — logic unchanged).
These tests were originally written against the router functions to lock in
behavior BEFORE the extraction; they were updated to call the service directly
once the extraction was verified to preserve identical behavior.

All DB writes happen inside the db_session fixture's rolled-back transaction
(see conftest.py) — nothing here is ever committed to the real database.
"""
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException

import models
from release_service import (
    approve_stage as _svc_approve_stage,
    reject_stage as _svc_reject_stage,
    abort_release_execution as _svc_abort_release_execution,
    update_release_execution_status as _svc_update_release_execution_status,
    ApprovalRequest,
)


def approve_stage(stage_execution_id, request, db, allowed=None):
    """Mirrors what the router's approve_stage endpoint does before delegating
    to the service: fetch + 404 check."""
    stage_execution = db.query(models.StageExecution).filter(models.StageExecution.id == stage_execution_id).first()
    if not stage_execution:
        raise HTTPException(status_code=404, detail="Stage execution not found")
    return _svc_approve_stage(stage_execution, request, db)


def reject_stage(stage_execution_id, request, db, allowed=None):
    stage_execution = db.query(models.StageExecution).filter(models.StageExecution.id == stage_execution_id).first()
    if not stage_execution:
        raise HTTPException(status_code=404, detail="Stage execution not found")
    return _svc_reject_stage(stage_execution, request, db)


def abort_release_execution(execution_id, db, allowed=None):
    release_execution = db.query(models.ReleaseExecution).filter(models.ReleaseExecution.id == execution_id).first()
    if not release_execution:
        raise HTTPException(status_code=404, detail="Release execution not found")
    return _svc_abort_release_execution(release_execution, db)


def update_release_execution_status(execution_id, db, allowed=None):
    release_execution = db.query(models.ReleaseExecution).filter(models.ReleaseExecution.id == execution_id).first()
    if not release_execution:
        raise HTTPException(status_code=404, detail="Release execution not found")
    return _svc_update_release_execution_status(release_execution, db)


def _make_customer(db):
    customer = models.Customer(name=f"test-customer-{uuid.uuid4().hex[:8]}", display_name="Test Customer")
    db.add(customer)
    db.flush()
    return customer


def _make_agent(db, customer_id):
    agent = models.Agent(
        name=f"test-agent-{uuid.uuid4().hex[:8]}", uuid=str(uuid.uuid4()),
        location="test", status="online", customer_id=customer_id,
    )
    db.add(agent)
    db.flush()
    return agent


def _make_release(db, customer_id):
    release = models.Release(name=f"test-release-{uuid.uuid4().hex[:8]}", customer_id=customer_id, status="active")
    db.add(release)
    db.flush()
    return release


def _make_release_execution(db, release_id, status="in_progress"):
    execution = models.ReleaseExecution(
        release_id=release_id, release_number="Release-1", triggered_by="tester",
        status=status, started_at=datetime.now(),
    )
    db.add(execution)
    db.flush()
    return execution


def _make_environment(db):
    env = models.Environment(name=f"test-env-{uuid.uuid4().hex[:8]}", requires_approval=False)
    db.add(env)
    db.flush()
    return env


def _make_release_stage(db, release_id, environment_id, order_index=0, agent_id=None):
    stage = models.ReleaseStage(
        release_id=release_id, environment_id=environment_id, order_index=order_index, agent_id=agent_id,
    )
    db.add(stage)
    db.flush()
    return stage


def _make_stage_execution(db, release_execution_id, release_stage_id, environment_id, agent_id=None, approval_status="pending"):
    stage_execution = models.StageExecution(
        release_execution_id=release_execution_id, release_stage_id=release_stage_id,
        environment_id=environment_id, agent_id=agent_id, status="awaiting_approval",
        approval_status=approval_status,
    )
    db.add(stage_execution)
    db.flush()
    return stage_execution


def _make_pipeline_execution(db, release_execution_id=None, status="running", triggered_by="tester", started_at=None):
    customer = _make_customer(db)
    pipeline = models.Pipeline(name=f"test-pipeline-{uuid.uuid4().hex[:8]}", status="pending", branch="main", customer_id=customer.id)
    db.add(pipeline)
    db.flush()
    execution = models.PipelineExecution(
        pipeline_id=pipeline.id, status=status, triggered_by=triggered_by,
        started_at=started_at or datetime.now(), release_execution_id=release_execution_id,
    )
    db.add(execution)
    db.flush()
    return execution


# ---------------------------------------------------------------------------
# approve_stage
# ---------------------------------------------------------------------------

def test_approve_stage_creates_pickup_when_agent_assigned(db_session):
    db = db_session
    customer = _make_customer(db)
    agent = _make_agent(db, customer.id)
    release = _make_release(db, customer.id)
    env = _make_environment(db)
    release_stage = _make_release_stage(db, release.id, env.id, agent_id=agent.id)
    release_execution = _make_release_execution(db, release.id)
    stage_execution = _make_stage_execution(db, release_execution.id, release_stage.id, env.id, agent_id=agent.id)

    result = approve_stage(stage_execution.id, ApprovalRequest(approved_by="alice"), db, allowed=None)

    assert result["success"] is True
    db.refresh(stage_execution)
    assert stage_execution.approval_status == "approved"
    assert stage_execution.approved_by == "alice"
    assert stage_execution.status == "pending"
    pickup = db.query(models.ReleasePickup).filter(models.ReleasePickup.stage_execution_id == stage_execution.id).first()
    assert pickup is not None
    assert pickup.agent_id == agent.id


def test_approve_stage_no_agent_no_pickup(db_session):
    db = db_session
    customer = _make_customer(db)
    release = _make_release(db, customer.id)
    env = _make_environment(db)
    release_stage = _make_release_stage(db, release.id, env.id)
    release_execution = _make_release_execution(db, release.id)
    stage_execution = _make_stage_execution(db, release_execution.id, release_stage.id, env.id)

    result = approve_stage(stage_execution.id, ApprovalRequest(approved_by="alice"), db, allowed=None)

    assert result["success"] is True
    pickup_count = db.query(models.ReleasePickup).filter(models.ReleasePickup.stage_execution_id == stage_execution.id).count()
    assert pickup_count == 0


def test_approve_stage_not_pending_rejected(db_session):
    db = db_session
    customer = _make_customer(db)
    release = _make_release(db, customer.id)
    env = _make_environment(db)
    release_stage = _make_release_stage(db, release.id, env.id)
    release_execution = _make_release_execution(db, release.id)
    stage_execution = _make_stage_execution(db, release_execution.id, release_stage.id, env.id, approval_status="approved")

    with pytest.raises(HTTPException) as exc_info:
        approve_stage(stage_execution.id, ApprovalRequest(approved_by="alice"), db, allowed=None)
    assert exc_info.value.status_code == 400


def test_approve_stage_not_found(db_session):
    db = db_session
    with pytest.raises(HTTPException) as exc_info:
        approve_stage(999999999, ApprovalRequest(approved_by="alice"), db, allowed=None)
    assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# reject_stage
# ---------------------------------------------------------------------------

def test_reject_stage_marks_release_execution_failed(db_session):
    db = db_session
    customer = _make_customer(db)
    release = _make_release(db, customer.id)
    env = _make_environment(db)
    release_stage = _make_release_stage(db, release.id, env.id)
    release_execution = _make_release_execution(db, release.id)
    stage_execution = _make_stage_execution(db, release_execution.id, release_stage.id, env.id)

    result = reject_stage(stage_execution.id, ApprovalRequest(approved_by="bob", comments="no"), db, allowed=None)

    assert result["success"] is True
    db.refresh(stage_execution)
    db.refresh(release_execution)
    assert stage_execution.approval_status == "rejected"
    assert stage_execution.status == "cancelled"
    assert release_execution.status == "failed"


def test_reject_stage_not_pending_rejected(db_session):
    db = db_session
    customer = _make_customer(db)
    release = _make_release(db, customer.id)
    env = _make_environment(db)
    release_stage = _make_release_stage(db, release.id, env.id)
    release_execution = _make_release_execution(db, release.id)
    stage_execution = _make_stage_execution(db, release_execution.id, release_stage.id, env.id, approval_status="rejected")

    with pytest.raises(HTTPException) as exc_info:
        reject_stage(stage_execution.id, ApprovalRequest(approved_by="bob"), db, allowed=None)
    assert exc_info.value.status_code == 400


# ---------------------------------------------------------------------------
# abort_release_execution
# ---------------------------------------------------------------------------

def test_abort_cancels_running_and_pending_executions(db_session):
    db = db_session
    customer = _make_customer(db)
    release = _make_release(db, customer.id)
    release_execution = _make_release_execution(db, release.id, status="in_progress")

    running_exec = _make_pipeline_execution(db, release_execution_id=release_execution.id, status="running")
    pending_exec = _make_pipeline_execution(db, release_execution_id=release_execution.id, status="pending")
    db.add(models.PipelinePickup(
        pipeline_execution_id=running_exec.id, pipeline_id=running_exec.pipeline_id,
        pipeline_name="x", agent_id=_make_agent(db, customer.id).id, agent_uuid=str(uuid.uuid4()),
        status="in_progress",
    ))
    db.flush()

    result = abort_release_execution(release_execution.id, db, allowed=None)

    assert result["success"] is True
    db.refresh(running_exec)
    db.refresh(pending_exec)
    db.refresh(release_execution)
    assert running_exec.status == "cancelled"
    assert pending_exec.status == "cancelled"
    assert release_execution.status == "cancelled"
    pickup = db.query(models.PipelinePickup).filter(models.PipelinePickup.pipeline_execution_id == running_exec.id).first()
    assert pickup.status == "cancelled"


def test_abort_not_found(db_session):
    db = db_session
    with pytest.raises(HTTPException) as exc_info:
        abort_release_execution(999999999, db, allowed=None)
    assert exc_info.value.status_code == 404


def test_abort_already_terminal_rejected(db_session):
    db = db_session
    customer = _make_customer(db)
    release = _make_release(db, customer.id)
    release_execution = _make_release_execution(db, release.id, status="succeeded")

    with pytest.raises(HTTPException) as exc_info:
        abort_release_execution(release_execution.id, db, allowed=None)
    assert exc_info.value.status_code == 400


# ---------------------------------------------------------------------------
# update_release_execution_status
# ---------------------------------------------------------------------------

def test_update_status_all_succeeded(db_session):
    db = db_session
    customer = _make_customer(db)
    release = _make_release(db, customer.id)
    release_execution = _make_release_execution(db, release.id, status="in_progress")

    pipeline = models.Pipeline(name=f"p-{uuid.uuid4().hex[:8]}", status="pending", branch="main", customer_id=customer.id)
    db.add(pipeline)
    db.flush()
    rp = models.ReleasePipeline(release_id=release.id, pipeline_id=pipeline.id, order_index=0)
    db.add(rp)
    db.flush()

    started = datetime.now() - timedelta(minutes=5)
    _make_pipeline_execution(db, status="success", triggered_by="tester-status-test", started_at=started)

    result = update_release_execution_status(release_execution.id, db, allowed=None)

    # matched by triggered_by="tester" (release_execution's own triggered_by) + time window,
    # not the "tester-status-test" one above -> expects 0 pipeline executions found (< 1 expected)
    assert result["success"] is False
    assert result["message"] == "Not enough pipeline executions found"


def test_update_status_matches_and_succeeds(db_session):
    db = db_session
    customer = _make_customer(db)
    release = _make_release(db, customer.id)
    release_execution = _make_release_execution(db, release.id, status="in_progress")

    pipeline = models.Pipeline(name=f"p-{uuid.uuid4().hex[:8]}", status="pending", branch="main", customer_id=customer.id)
    db.add(pipeline)
    db.flush()
    rp = models.ReleasePipeline(release_id=release.id, pipeline_id=pipeline.id, order_index=0)
    db.add(rp)
    db.flush()

    exec_ = models.PipelineExecution(
        pipeline_id=pipeline.id, status="success", triggered_by=release_execution.triggered_by,
        started_at=release_execution.started_at,
    )
    db.add(exec_)
    db.flush()

    result = update_release_execution_status(release_execution.id, db, allowed=None)

    assert result["success"] is True
    assert result["status"] == "succeeded"
    db.refresh(release_execution)
    assert release_execution.status == "succeeded"


def test_update_status_not_found(db_session):
    db = db_session
    with pytest.raises(HTTPException) as exc_info:
        update_release_execution_status(999999999, db, allowed=None)
    assert exc_info.value.status_code == 404
