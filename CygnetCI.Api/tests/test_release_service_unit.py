"""Pure unit tests for release_service.py — no database, no HTTP.

These complement (not replace) tests/test_release_deploy_characterization.py
and tests/test_release_lifecycle_characterization.py, which exercise the same
code against a real (rolled-back) database. Here every repository call is
mocked and a FakeSession stands in for the DB session, so these run without
any network/DB dependency and exercise pure business-logic branches in
isolation. This is possible specifically because Phase 3 moved every
db.query(...) out of release_service.py and into agent_repository.py /
pipeline_repository.py / release_repository.py — see FakeSession.query() in
tests/fakes.py, which raises if the service ever queries the DB directly
again (a regression guard on its own).
"""
from unittest.mock import patch

import pytest
from fastapi import HTTPException

import models
import release_service
from release_service import DeployReleaseRequest, ApprovalRequest
from tests.fakes import FakeSession, Fake


# ---------------------------------------------------------------------------
# deploy() routing
# ---------------------------------------------------------------------------

def test_deploy_routes_to_pipeline_based_when_release_pipelines_exist():
    db = FakeSession()
    release = Fake(id=1, name="r1", customer_id=1)
    rp = Fake(id=10, pipeline_id=100, depends_on=None, order_index=0)

    request = DeployReleaseRequest(triggered_by="t")
    with patch.object(release_service.release_repository, "get_release_pipelines", return_value=[rp]), \
         patch.object(release_service, "deploy_release_pipelines", return_value={"routed": "pipelines"}) as mock_deploy_pipelines:
        result = release_service.deploy(release, request, db)

    assert result == {"routed": "pipelines"}
    mock_deploy_pipelines.assert_called_once_with(release, [rp], request, db)


def test_deploy_routes_to_stage_based_when_no_release_pipelines():
    db = FakeSession()
    release = Fake(id=1, name="r1", customer_id=1)

    with patch.object(release_service.release_repository, "get_release_pipelines", return_value=[]), \
         patch.object(release_service, "_deploy_release_stages", return_value={"routed": "stages"}) as mock_deploy_stages:
        result = release_service.deploy(release, DeployReleaseRequest(triggered_by="t"), db)

    assert result == {"routed": "stages"}
    mock_deploy_stages.assert_called_once()


# ---------------------------------------------------------------------------
# deploy_release_pipelines — DAG logic
# ---------------------------------------------------------------------------

def test_deploy_release_pipelines_requires_agent_id():
    db = FakeSession()
    release = Fake(id=1, name="r1")
    request = DeployReleaseRequest(triggered_by="t")  # no agent_id

    with pytest.raises(HTTPException) as exc_info:
        release_service.deploy_release_pipelines(release, [Fake(id=10, pipeline_id=100, depends_on=None)], request, db)
    assert exc_info.value.status_code == 400


def test_deploy_release_pipelines_agent_not_found():
    db = FakeSession()
    release = Fake(id=1, name="r1")
    request = DeployReleaseRequest(triggered_by="t", agent_id=5)

    with patch.object(release_service.agent_repository, "get_by_id", return_value=None):
        with pytest.raises(HTTPException) as exc_info:
            release_service.deploy_release_pipelines(release, [Fake(id=10, pipeline_id=100, depends_on=None)], request, db)
    assert exc_info.value.status_code == 404


def test_deploy_release_pipelines_dag_root_runs_downstream_pending():
    db = FakeSession()
    release = Fake(id=1, name="r1")
    request = DeployReleaseRequest(triggered_by="t", agent_id=5)

    agent = Fake(id=5, name="agent-a", uuid="agent-uuid")
    pipeline_a = Fake(id=100, name="pipeline-a", branch="main")
    pipeline_b = Fake(id=101, name="pipeline-b", branch="main")
    rp_root = Fake(id=10, pipeline_id=100, depends_on=None, order_index=0)
    rp_downstream = Fake(id=11, pipeline_id=101, depends_on=10, order_index=1)

    def fake_pipeline_by_id(db_, pid):
        return {100: pipeline_a, 101: pipeline_b}[pid]

    with patch.object(release_service.agent_repository, "get_by_id", return_value=agent), \
         patch.object(release_service.release_repository, "count_executions", return_value=0), \
         patch.object(release_service.pipeline_repository, "get_by_id", side_effect=fake_pipeline_by_id):
        result = release_service.deploy_release_pipelines(release, [rp_root, rp_downstream], request, db)

    assert result["success"] is True
    assert result["release_number"] == "Release-1"

    pipeline_executions = [o for o in db.added if isinstance(o, models.PipelineExecution)]
    by_pipeline_id = {pe.pipeline_id: pe for pe in pipeline_executions}
    assert by_pipeline_id[100].status == "running"
    assert by_pipeline_id[101].status == "pending"

    pickups = [o for o in db.added if isinstance(o, models.PipelinePickup)]
    assert len(pickups) == 1
    assert pickups[0].pipeline_id == 100

    assert db.committed is True


# ---------------------------------------------------------------------------
# _deploy_release_stages (exercised via deploy())
# ---------------------------------------------------------------------------

def test_deploy_stage_based_no_stages_rejected():
    db = FakeSession()
    release = Fake(id=1, name="r1")

    with patch.object(release_service.release_repository, "get_release_pipelines", return_value=[]), \
         patch.object(release_service.release_repository, "get_release_stages", return_value=[]):
        with pytest.raises(HTTPException) as exc_info:
            release_service.deploy(release, DeployReleaseRequest(triggered_by="t"), db)
    assert exc_info.value.status_code == 400


def test_deploy_stage_based_requires_approval_no_pickup():
    db = FakeSession()
    release = Fake(id=1, name="r1")
    stage = Fake(id=20, environment_id=30, agent_id=None, order_index=0, pre_deployment_approval=False)
    environment = Fake(id=30, name="prod", requires_approval=True)

    with patch.object(release_service.release_repository, "get_release_pipelines", return_value=[]), \
         patch.object(release_service.release_repository, "get_release_stages", return_value=[stage]), \
         patch.object(release_service.release_repository, "count_executions", return_value=0), \
         patch.object(release_service.release_repository, "get_environment", return_value=environment):
        result = release_service.deploy(release, DeployReleaseRequest(triggered_by="t"), db)

    assert result["success"] is True
    stage_executions = [o for o in db.added if isinstance(o, models.StageExecution)]
    assert stage_executions[0].status == "awaiting_approval"
    assert stage_executions[0].approval_status == "pending"
    pickups = [o for o in db.added if isinstance(o, models.ReleasePickup)]
    assert len(pickups) == 0


def test_deploy_stage_based_no_approval_with_agent_creates_pickup():
    db = FakeSession()
    release = Fake(id=1, name="r1")
    stage = Fake(id=20, environment_id=30, agent_id=None, order_index=0, pre_deployment_approval=False)
    environment = Fake(id=30, name="prod", requires_approval=False)
    agent = Fake(id=5, name="agent-a", uuid="agent-uuid")

    with patch.object(release_service.release_repository, "get_release_pipelines", return_value=[]), \
         patch.object(release_service.release_repository, "get_release_stages", return_value=[stage]), \
         patch.object(release_service.release_repository, "count_executions", return_value=0), \
         patch.object(release_service.release_repository, "get_environment", return_value=environment), \
         patch.object(release_service.agent_repository, "get_by_id", return_value=agent):
        result = release_service.deploy(
            release, DeployReleaseRequest(triggered_by="t", agent_id=5), db
        )

    assert result["success"] is True
    pickups = [o for o in db.added if isinstance(o, models.ReleasePickup)]
    assert len(pickups) == 1
    assert pickups[0].agent_id == 5


# ---------------------------------------------------------------------------
# approve_stage / reject_stage
# ---------------------------------------------------------------------------

def test_approve_stage_not_pending_rejected():
    db = FakeSession()
    stage_execution = Fake(id=1, approval_status="approved")
    with pytest.raises(HTTPException) as exc_info:
        release_service.approve_stage(stage_execution, ApprovalRequest(approved_by="alice"), db)
    assert exc_info.value.status_code == 400


def test_approve_stage_creates_pickup_when_agent_assigned():
    db = FakeSession()
    stage_execution = Fake(
        id=1, approval_status="pending", agent_id=5, release_execution_id=2, release_stage_id=20,
    )
    agent = Fake(id=5, name="agent-a", uuid="agent-uuid")
    release_stage = Fake(id=20, order_index=3)

    with patch.object(release_service.agent_repository, "get_by_id", return_value=agent), \
         patch.object(release_service.release_repository, "get_release_stage_by_id", return_value=release_stage):
        result = release_service.approve_stage(stage_execution, ApprovalRequest(approved_by="alice"), db)

    assert result["success"] is True
    assert stage_execution.approval_status == "approved"
    assert stage_execution.status == "pending"
    pickups = [o for o in db.added if isinstance(o, models.ReleasePickup)]
    assert len(pickups) == 1
    assert pickups[0].priority == 3


def test_reject_stage_marks_release_execution_failed():
    db = FakeSession()
    stage_execution = Fake(id=1, approval_status="pending", release_execution_id=2)
    release_execution = Fake(id=2, status="in_progress")

    with patch.object(release_service.release_repository, "get_execution_by_id", return_value=release_execution):
        result = release_service.reject_stage(stage_execution, ApprovalRequest(approved_by="bob"), db)

    assert result["success"] is True
    assert stage_execution.approval_status == "rejected"
    assert stage_execution.status == "cancelled"
    assert release_execution.status == "failed"


# ---------------------------------------------------------------------------
# abort_release_execution
# ---------------------------------------------------------------------------

def test_abort_rejects_non_in_progress():
    db = FakeSession()
    release_execution = Fake(id=1, status="succeeded")
    with pytest.raises(HTTPException) as exc_info:
        release_service.abort_release_execution(release_execution, db)
    assert exc_info.value.status_code == 400


def test_abort_cancels_running_and_pending_executions():
    db = FakeSession()
    release_execution = Fake(id=1, status="in_progress", started_at=None)
    pe_running = Fake(id=100, status="running", started_at=None)
    pe_pending = Fake(id=101, status="pending", started_at=None)
    active_pickup = Fake(id=200, status="in_progress")

    with patch.object(release_service.pipeline_repository, "get_executions_for_release", return_value=[pe_running, pe_pending]), \
         patch.object(release_service.pipeline_repository, "get_active_pickup_for_execution", return_value=active_pickup):
        result = release_service.abort_release_execution(release_execution, db)

    assert result["success"] is True
    assert pe_running.status == "cancelled"
    assert pe_pending.status == "cancelled"
    assert active_pickup.status == "cancelled"
    assert release_execution.status == "cancelled"


# ---------------------------------------------------------------------------
# update_release_execution_status
# ---------------------------------------------------------------------------

def test_update_status_release_not_found():
    db = FakeSession()
    release_execution = Fake(id=1, release_id=99, triggered_by="t", started_at=None, completed_at=None)

    with patch.object(release_service.pipeline_repository, "get_executions_by_trigger_and_window", return_value=[]), \
         patch.object(release_service.release_repository, "get_by_id", return_value=None):
        with pytest.raises(HTTPException) as exc_info:
            release_service.update_release_execution_status(release_execution, db)
    assert exc_info.value.status_code == 404


def test_update_status_all_succeeded():
    db = FakeSession()
    release_execution = Fake(id=1, release_id=2, triggered_by="t", started_at=None, completed_at=None)
    release = Fake(id=2)
    pe1 = Fake(status="success")
    pe2 = Fake(status="success")

    with patch.object(release_service.pipeline_repository, "get_executions_by_trigger_and_window", return_value=[pe1, pe2]), \
         patch.object(release_service.release_repository, "get_by_id", return_value=release), \
         patch.object(release_service.release_repository, "get_release_pipelines", return_value=[Fake(), Fake()]):
        result = release_service.update_release_execution_status(release_execution, db)

    assert result["success"] is True
    assert result["status"] == "succeeded"
    assert release_execution.status == "succeeded"


def test_update_status_one_failed_marks_execution_failed():
    db = FakeSession()
    release_execution = Fake(id=1, release_id=2, triggered_by="t", started_at=None, completed_at=None)
    release = Fake(id=2)
    pe1 = Fake(status="success")
    pe2 = Fake(status="failed")

    with patch.object(release_service.pipeline_repository, "get_executions_by_trigger_and_window", return_value=[pe1, pe2]), \
         patch.object(release_service.release_repository, "get_by_id", return_value=release), \
         patch.object(release_service.release_repository, "get_release_pipelines", return_value=[Fake(), Fake()]):
        result = release_service.update_release_execution_status(release_execution, db)

    assert result["status"] == "failed"


def test_update_status_not_all_complete():
    db = FakeSession()
    release_execution = Fake(id=1, release_id=2, triggered_by="t", started_at=None, completed_at=None, status="in_progress")
    release = Fake(id=2)
    pe1 = Fake(status="running")

    with patch.object(release_service.pipeline_repository, "get_executions_by_trigger_and_window", return_value=[pe1]), \
         patch.object(release_service.release_repository, "get_by_id", return_value=release), \
         patch.object(release_service.release_repository, "get_release_pipelines", return_value=[Fake()]):
        result = release_service.update_release_execution_status(release_execution, db)

    assert result["success"] is False
    assert result["message"] == "Not all pipelines are complete"


def test_update_status_not_enough_executions():
    db = FakeSession()
    release_execution = Fake(id=1, release_id=2, triggered_by="t", started_at=None, completed_at=None, status="in_progress")
    release = Fake(id=2)

    with patch.object(release_service.pipeline_repository, "get_executions_by_trigger_and_window", return_value=[]), \
         patch.object(release_service.release_repository, "get_by_id", return_value=release), \
         patch.object(release_service.release_repository, "get_release_pipelines", return_value=[Fake()]):
        result = release_service.update_release_execution_status(release_execution, db)

    assert result["message"] == "Not enough pipeline executions found"
