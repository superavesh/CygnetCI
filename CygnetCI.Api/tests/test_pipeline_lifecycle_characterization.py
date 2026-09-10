"""Characterization tests for the pipeline-lifecycle business logic, now
living in pipeline_service.py (extracted from routers/pipelines.py — logic
unchanged). These tests were originally written against the router functions
to lock in behavior BEFORE the extraction; they were updated to call the
service directly once the extraction was verified to preserve identical
behavior.

All DB writes happen inside the db_session fixture's rolled-back transaction
(see conftest.py) — nothing here is ever committed to the real database.
"""
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException

import models
from pipeline_service import cleanup_stale_executions, stop as _svc_stop


def cleanup_stale_pipeline_executions(stale_minutes, db):
    return cleanup_stale_executions(stale_minutes, db)


def stop_pipeline(pipeline_id, db, allowed=None):
    """Mirrors what the router's stop_pipeline endpoint does before
    delegating to the service: fetch + 404 check."""
    pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return _svc_stop(pipeline, db)


def _make_customer(db):
    customer = models.Customer(name=f"test-customer-{uuid.uuid4().hex[:8]}", display_name="Test Customer")
    db.add(customer)
    db.flush()
    return customer


def _make_pipeline(db, customer_id, status="running"):
    pipeline = models.Pipeline(
        name=f"test-pipeline-{uuid.uuid4().hex[:8]}", status=status, branch="main", customer_id=customer_id,
    )
    db.add(pipeline)
    db.flush()
    return pipeline


def _make_agent(db, customer_id):
    agent = models.Agent(
        name=f"test-agent-{uuid.uuid4().hex[:8]}", uuid=str(uuid.uuid4()),
        location="test", status="online", customer_id=customer_id,
    )
    db.add(agent)
    db.flush()
    return agent


def _make_execution(db, pipeline_id, status="running", started_at=None):
    execution = models.PipelineExecution(
        pipeline_id=pipeline_id, status=status, started_at=started_at or datetime.now(),
    )
    db.add(execution)
    db.flush()
    return execution


# ---------------------------------------------------------------------------
# cleanup_stale_pipeline_executions
# ---------------------------------------------------------------------------

def test_cleanup_marks_stale_execution_failed(db_session):
    db = db_session
    customer = _make_customer(db)
    pipeline = _make_pipeline(db, customer.id, status="running")
    old_start = datetime.now() - timedelta(minutes=60)
    execution = _make_execution(db, pipeline.id, status="running", started_at=old_start)
    # No logs at all -> falls back to started_at, which is stale (60 min ago > 30 min cutoff)

    agent = _make_agent(db, customer.id)
    pickup = models.PipelinePickup(
        pipeline_execution_id=execution.id, pipeline_id=pipeline.id, pipeline_name=pipeline.name,
        agent_id=agent.id, agent_uuid=agent.uuid, status="pending",
    )
    db.add(pickup)
    db.flush()

    result = cleanup_stale_pipeline_executions(stale_minutes=30, db=db)

    assert result["cleaned"] >= 1
    db.refresh(execution)
    db.refresh(pipeline)
    db.refresh(pickup)
    assert execution.status == "failed"
    assert execution.completed_at is not None
    assert pipeline.status == "failed"
    assert pickup.status == "failed"
    assert pickup.error_message is not None and "timed out" in pickup.error_message
    log = db.query(models.PipelineExecutionLog).filter(
        models.PipelineExecutionLog.pipeline_execution_id == execution.id
    ).first()
    assert log is not None
    assert "no activity" in log.message


def test_cleanup_leaves_recent_execution_untouched(db_session):
    db = db_session
    customer = _make_customer(db)
    pipeline = _make_pipeline(db, customer.id, status="running")
    execution = _make_execution(db, pipeline.id, status="running", started_at=datetime.now())

    result = cleanup_stale_pipeline_executions(stale_minutes=30, db=db)

    db.refresh(execution)
    assert execution.status == "running"  # untouched, not stale


def test_cleanup_uses_last_log_timestamp_when_present(db_session):
    db = db_session
    customer = _make_customer(db)
    pipeline = _make_pipeline(db, customer.id, status="running")
    # Started long ago, but a RECENT log means it's not actually stale.
    # timestamp is set explicitly (Python's local datetime.now(), matching
    # started_at below) rather than relying on the column's server_default
    # (the DB server's now() may be in a different timezone than this
    # process — a real, separate latent issue in the code under test, not
    # something to work around by changing the code here).
    execution = _make_execution(db, pipeline.id, status="running", started_at=datetime.now() - timedelta(hours=2))
    db.add(models.PipelineExecutionLog(
        pipeline_execution_id=execution.id, message="still going", log_level="info", source="agent",
        timestamp=datetime.now(),
    ))
    db.flush()

    cleanup_stale_pipeline_executions(stale_minutes=30, db=db)

    db.refresh(execution)
    assert execution.status == "running"  # recent log activity means not stale


# ---------------------------------------------------------------------------
# stop_pipeline
# ---------------------------------------------------------------------------

def test_stop_pipeline_cancels_running_execution_and_pickup(db_session):
    db = db_session
    customer = _make_customer(db)
    pipeline = _make_pipeline(db, customer.id, status="running")
    execution = _make_execution(db, pipeline.id, status="running")
    agent = _make_agent(db, customer.id)
    pickup = models.PipelinePickup(
        pipeline_execution_id=execution.id, pipeline_id=pipeline.id, pipeline_name=pipeline.name,
        agent_id=agent.id, agent_uuid=agent.uuid, status="in_progress",
    )
    db.add(pickup)
    db.flush()

    result = stop_pipeline(pipeline.id, db, allowed=None)

    assert result["success"] is True
    db.refresh(execution)
    db.refresh(pipeline)
    db.refresh(pickup)
    assert execution.status == "cancelled"
    assert execution.completed_at is not None
    assert pickup.status == "cancelled"
    assert pipeline.status == "pending"


def test_stop_pipeline_no_running_execution_still_resets_status(db_session):
    db = db_session
    customer = _make_customer(db)
    pipeline = _make_pipeline(db, customer.id, status="running")  # no execution at all

    result = stop_pipeline(pipeline.id, db, allowed=None)

    assert result["success"] is True
    db.refresh(pipeline)
    assert pipeline.status == "pending"


def test_stop_pipeline_not_found(db_session):
    db = db_session
    with pytest.raises(HTTPException) as exc_info:
        stop_pipeline(999999999, db, allowed=None)
    assert exc_info.value.status_code == 404
