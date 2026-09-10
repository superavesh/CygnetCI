"""Pure unit tests for pipeline_service.py — no database, no HTTP.

Complements tests/test_pipeline_execution_characterization.py and
tests/test_pipeline_lifecycle_characterization.py (real, rolled-back DB).
See tests/test_release_service_unit.py for the rationale — repository calls
are mocked, FakeSession stands in for the DB session.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

import models
import pipeline_service
from pipeline_service import RunPipelineRequest
from tests.fakes import FakeSession, Fake


# ---------------------------------------------------------------------------
# run()
# ---------------------------------------------------------------------------

def test_run_creates_execution_and_pickup():
    db = FakeSession()
    pipeline = Fake(id=100, name="p1", agent_id=None, status="pending", last_run=None)
    agent = Fake(id=5, name="agent-a", uuid="agent-uuid")
    request = RunPipelineRequest(agent_id=5, parameters={"foo": "bar"})

    with patch.object(pipeline_service.agent_repository, "get_by_id", return_value=agent):
        result = pipeline_service.run(pipeline, request, db)

    assert result["success"] is True
    executions = [o for o in db.added if isinstance(o, models.PipelineExecution)]
    assert executions[0].status == "running"
    pickups = [o for o in db.added if isinstance(o, models.PipelinePickup)]
    assert pickups[0].agent_id == 5
    params = [o for o in db.added if isinstance(o, models.PipelineExecutionParam)]
    assert params[0].param_name == "foo" and params[0].param_value == "bar"
    assert db.committed is True


def test_run_falls_back_to_pipeline_default_agent():
    db = FakeSession()
    pipeline = Fake(id=100, name="p1", agent_id=5, status="pending", last_run=None)
    agent = Fake(id=5, name="agent-a", uuid="agent-uuid")

    with patch.object(pipeline_service.agent_repository, "get_by_id", return_value=agent) as mock_get:
        pipeline_service.run(pipeline, RunPipelineRequest(), db)  # no agent_id in request

    mock_get.assert_called_once_with(db, 5)


def test_run_no_agent_raises_400():
    from fastapi import HTTPException
    import pytest

    db = FakeSession()
    pipeline = Fake(id=100, name="p1", agent_id=None, status="pending", last_run=None)

    with pytest.raises(HTTPException) as exc_info:
        pipeline_service.run(pipeline, RunPipelineRequest(), db)
    assert exc_info.value.status_code == 400


def test_run_agent_not_found_raises_404():
    from fastapi import HTTPException
    import pytest

    db = FakeSession()
    pipeline = Fake(id=100, name="p1", agent_id=None, status="pending", last_run=None)

    with patch.object(pipeline_service.agent_repository, "get_by_id", return_value=None):
        with pytest.raises(HTTPException) as exc_info:
            pipeline_service.run(pipeline, RunPipelineRequest(agent_id=999), db)
    assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# complete_pickup() — standalone (non-release) execution
# ---------------------------------------------------------------------------

def test_complete_pickup_standalone_success():
    db = FakeSession()
    pickup = Fake(id=1, pipeline_execution_id=100, pipeline_id=200, status=None, completed_at=None, error_message=None)
    execution = Fake(
        id=100, status=None, completed_at=None, started_at=datetime.now() - timedelta(seconds=30),
        release_execution_id=None, release_pipeline_id=None, duration_seconds=None,
    )
    pipeline = Fake(id=200, status=None)

    with patch.object(pipeline_service.pipeline_repository, "get_execution_by_id", return_value=execution), \
         patch.object(pipeline_service.pipeline_repository, "get_by_id", return_value=pipeline):
        result = pipeline_service.complete_pickup(pickup, {"success": True}, db)

    assert result["success"] is True
    assert pickup.status == "completed"
    assert execution.status == "success"
    assert execution.duration_seconds is not None
    assert pipeline.status == "success"
    assert db.committed is True


def test_complete_pickup_failure_sets_failed_status():
    db = FakeSession()
    pickup = Fake(id=1, pipeline_execution_id=100, pipeline_id=200, status=None, completed_at=None, error_message=None)
    execution = Fake(
        id=100, status=None, completed_at=None, started_at=None,
        release_execution_id=None, release_pipeline_id=None,
    )
    pipeline = Fake(id=200, status=None)

    with patch.object(pipeline_service.pipeline_repository, "get_execution_by_id", return_value=execution), \
         patch.object(pipeline_service.pipeline_repository, "get_by_id", return_value=pipeline):
        pipeline_service.complete_pickup(pickup, {"success": False, "error_message": "boom"}, db)

    assert pickup.status == "failed"
    assert pickup.error_message == "boom"
    assert execution.status == "failed"
    assert pipeline.status == "failed"


# ---------------------------------------------------------------------------
# complete_pickup() — DAG advancement
# ---------------------------------------------------------------------------

def test_complete_pickup_unlocks_downstream_node_on_success():
    db = FakeSession()
    pickup = Fake(id=1, pipeline_execution_id=100, pipeline_id=200, status=None, completed_at=None, error_message=None)
    execution = Fake(
        id=100, status=None, completed_at=None, started_at=None,
        release_execution_id=9, release_pipeline_id=10,
    )
    pipeline = Fake(id=200, status=None)
    next_rp = Fake(id=11, pipeline_id=201, order_index=1)
    pending_exec = Fake(id=101, status="pending", started_at=None, agent_id=5)
    next_pipeline = Fake(id=201, name="p2")
    next_agent = Fake(id=5, name="agent-a", uuid="agent-uuid")
    all_executions = [Fake(status="success"), pending_exec]  # pending_exec about to flip to running

    with patch.object(pipeline_service.pipeline_repository, "get_execution_by_id", return_value=execution), \
         patch.object(pipeline_service.pipeline_repository, "get_by_id", side_effect=lambda db_, pid: {200: pipeline, 201: next_pipeline}[pid]), \
         patch.object(pipeline_service.release_repository, "get_dependent_pipelines", return_value=[next_rp]), \
         patch.object(pipeline_service.pipeline_repository, "get_pending_execution_for_node", return_value=pending_exec), \
         patch.object(pipeline_service.agent_repository, "get_by_id", return_value=next_agent), \
         patch.object(pipeline_service.pipeline_repository, "get_executions_for_release", return_value=all_executions):
        result = pipeline_service.complete_pickup(pickup, {"success": True}, db)

    assert result["success"] is True
    assert pending_exec.status == "running"
    assert pending_exec.started_at is not None
    new_pickups = [o for o in db.added if isinstance(o, models.PipelinePickup)]
    assert len(new_pickups) == 1
    assert new_pickups[0].pipeline_id == 201


def test_complete_pickup_marks_release_succeeded_when_all_terminal():
    db = FakeSession()
    pickup = Fake(id=1, pipeline_execution_id=100, pipeline_id=200, status=None, completed_at=None, error_message=None)
    execution = Fake(
        id=100, status=None, completed_at=None, started_at=None,
        release_execution_id=9, release_pipeline_id=10,
    )
    pipeline = Fake(id=200, status=None)
    release_execution = Fake(id=9, status="in_progress", started_at=None, completed_at=None)
    all_executions = [Fake(status="success"), Fake(status="success")]

    with patch.object(pipeline_service.pipeline_repository, "get_execution_by_id", return_value=execution), \
         patch.object(pipeline_service.pipeline_repository, "get_by_id", return_value=pipeline), \
         patch.object(pipeline_service.release_repository, "get_dependent_pipelines", return_value=[]), \
         patch.object(pipeline_service.pipeline_repository, "get_executions_for_release", return_value=all_executions), \
         patch.object(pipeline_service.release_repository, "get_execution_by_id", return_value=release_execution):
        pipeline_service.complete_pickup(pickup, {"success": True}, db)

    assert release_execution.status == "succeeded"


def test_complete_pickup_failure_does_not_unlock_downstream():
    db = FakeSession()
    pickup = Fake(id=1, pipeline_execution_id=100, pipeline_id=200, status=None, completed_at=None, error_message=None)
    execution = Fake(
        id=100, status=None, completed_at=None, started_at=None,
        release_execution_id=9, release_pipeline_id=10,
    )
    pipeline = Fake(id=200, status=None)
    all_executions = [Fake(status="failed"), Fake(status="pending")]  # downstream never unlocked

    with patch.object(pipeline_service.pipeline_repository, "get_execution_by_id", return_value=execution), \
         patch.object(pipeline_service.pipeline_repository, "get_by_id", return_value=pipeline), \
         patch.object(pipeline_service.release_repository, "get_dependent_pipelines") as mock_get_dependent, \
         patch.object(pipeline_service.pipeline_repository, "get_executions_for_release", return_value=all_executions):
        pipeline_service.complete_pickup(pickup, {"success": False, "error_message": "boom"}, db)

    mock_get_dependent.assert_not_called()  # success=False -> the "if success:" branch never runs
    new_pickups = [o for o in db.added if isinstance(o, models.PipelinePickup)]
    assert len(new_pickups) == 0


# ---------------------------------------------------------------------------
# cleanup_stale_executions()
# ---------------------------------------------------------------------------

def test_cleanup_marks_stale_execution_failed():
    db = FakeSession()
    old_start = datetime.now() - timedelta(minutes=60)
    execution = Fake(id=1, pipeline_id=100, status="running", started_at=old_start, completed_at=None, duration_seconds=None)
    pipeline = Fake(id=100, status="running")

    with patch.object(pipeline_service.pipeline_repository, "get_all_running_executions", return_value=[execution]), \
         patch.object(pipeline_service.pipeline_repository, "get_last_log_for_execution", return_value=None), \
         patch.object(pipeline_service.pipeline_repository, "get_by_id", return_value=pipeline), \
         patch.object(pipeline_service.pipeline_repository, "get_active_pickup_for_execution", return_value=None):
        result = pipeline_service.cleanup_stale_executions(30, db)

    assert result["cleaned"] == 1
    assert execution.status == "failed"
    assert pipeline.status == "failed"
    logs = [o for o in db.added if isinstance(o, models.PipelineExecutionLog)]
    assert "no activity" in logs[0].message


def test_cleanup_leaves_recent_execution_untouched():
    db = FakeSession()
    execution = Fake(id=1, pipeline_id=100, status="running", started_at=datetime.now(), completed_at=None)

    with patch.object(pipeline_service.pipeline_repository, "get_all_running_executions", return_value=[execution]), \
         patch.object(pipeline_service.pipeline_repository, "get_last_log_for_execution", return_value=None):
        result = pipeline_service.cleanup_stale_executions(30, db)

    assert result["cleaned"] == 0
    assert execution.status == "running"


# ---------------------------------------------------------------------------
# stop()
# ---------------------------------------------------------------------------

def test_stop_cancels_running_execution_and_pickup():
    db = FakeSession()
    pipeline = Fake(id=100, status="running")
    running_execution = Fake(id=1, status="running", started_at=datetime.now() - timedelta(seconds=10), completed_at=None, duration=None)
    active_pickup = Fake(id=1, status="in_progress", completed_at=None, error_message=None)

    with patch.object(pipeline_service.pipeline_repository, "get_latest_running_execution", return_value=running_execution), \
         patch.object(pipeline_service.pipeline_repository, "get_active_pickup_for_execution", return_value=active_pickup):
        result = pipeline_service.stop(pipeline, db)

    assert result["success"] is True
    assert running_execution.status == "cancelled"
    assert active_pickup.status == "cancelled"
    assert pipeline.status == "pending"


def test_stop_no_running_execution_still_resets_pipeline():
    db = FakeSession()
    pipeline = Fake(id=100, status="running")

    with patch.object(pipeline_service.pipeline_repository, "get_latest_running_execution", return_value=None):
        result = pipeline_service.stop(pipeline, db)

    assert result["success"] is True
    assert pipeline.status == "pending"
