"""Release deployment business logic, extracted from routers/releases.py.

Moved out of the router (logic unchanged) so it can be tested independently of
FastAPI request/response handling. routers/releases.py now only does the
HTTP-layer concerns (fetch release, 404, customer-access check) and delegates
to deploy() here. See tests/test_release_deploy_characterization.py for the
tests that pin this behavior across the extraction.
"""
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
import agent_repository
import pipeline_repository
import release_repository


class DeployReleaseRequest(BaseModel):
    triggered_by: str
    artifact_version: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    agent_id: Optional[int] = None


class ApprovalRequest(BaseModel):
    approved_by: str
    comments: Optional[str] = None


def deploy(release: models.Release, request: DeployReleaseRequest, db: Session) -> dict:
    """Trigger a release deployment - supports both pipeline-based and legacy
    stage-based releases. Caller is responsible for the release-not-found and
    customer-access checks before calling this."""
    release_pipelines = release_repository.get_release_pipelines(db, release.id)

    if release_pipelines:
        return deploy_release_pipelines(release, release_pipelines, request, db)

    return _deploy_release_stages(release, request, db)


def deploy_release_pipelines(
    release: models.Release,
    release_pipelines: List[models.ReleasePipeline],
    request: DeployReleaseRequest,
    db: Session,
) -> dict:
    """Deploy a release using the pipeline-based approach"""
    if not request.agent_id:
        raise HTTPException(status_code=400, detail="Agent ID is required for pipeline-based releases")

    agent = agent_repository.get_by_id(db, request.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Generate release number
    execution_count = release_repository.count_executions(db, release.id)
    release_number = f"Release-{execution_count + 1}"

    # Create release execution
    release_execution = models.ReleaseExecution(
        release_id=release.id,
        release_number=release_number,
        triggered_by=request.triggered_by,
        status="in_progress",
        artifact_version=request.artifact_version,
        started_at=datetime.now()
    )
    db.add(release_execution)
    db.flush()

    # Store parameters
    if request.parameters:
        for param_name, param_value in request.parameters.items():
            exec_param = models.ReleaseExecutionParameter(
                release_execution_id=release_execution.id,
                parameter_name=param_name,
                parameter_value=str(param_value)
            )
            db.add(exec_param)

    # ── DAG execution: only root nodes (no depends_on) start immediately.
    # Downstream nodes are created as 'pending' and get a pickup only when
    # their dependency completes (handled in complete_pipeline_pickup).
    root_rps = [rp for rp in release_pipelines if rp.depends_on is None]
    downstream_rps = [rp for rp in release_pipelines if rp.depends_on is not None]

    def _create_execution(rp, status: str):
        pipeline = pipeline_repository.get_by_id(db, rp.pipeline_id)
        if not pipeline:
            return None
        pe = models.PipelineExecution(
            pipeline_id=pipeline.id,
            agent_id=agent.id,
            agent_name=agent.name,
            status=status,
            commit=pipeline.branch or "main",
            triggered_by=request.triggered_by,
            started_at=datetime.now() if status == "running" else None,
            release_execution_id=release_execution.id,
            release_pipeline_id=rp.id,
        )
        db.add(pe)
        db.flush()

        if request.parameters:
            for param_name, param_value in request.parameters.items():
                db.add(models.PipelineExecutionParam(
                    execution_id=pe.id,
                    param_name=param_name,
                    param_value=str(param_value)
                ))
        return pe, pipeline

    # Start root pipelines immediately
    for rp in root_rps:
        result = _create_execution(rp, "running")
        if not result:
            continue
        pe, pipeline = result
        db.add(models.PipelinePickup(
            pipeline_execution_id=pe.id,
            pipeline_id=pipeline.id,
            pipeline_name=pipeline.name,
            agent_id=agent.id,
            agent_uuid=agent.uuid,
            agent_name=agent.name,
            status="pending",
            priority=rp.order_index
        ))

    # Register downstream nodes as pending — no pickup yet
    for rp in downstream_rps:
        _create_execution(rp, "pending")

    db.commit()

    return {
        "success": True,
        "release_execution_id": release_execution.id,
        "release_number": release_number,
        "message": f"Release '{release.name}' deployment started — {len(root_rps)} pipeline(s) running, {len(downstream_rps)} waiting on dependencies"
    }


def _deploy_release_stages(release: models.Release, request: DeployReleaseRequest, db: Session) -> dict:
    """Deploy a release using the legacy stage-based approach"""
    stages = release_repository.get_release_stages(db, release.id)

    if not stages:
        raise HTTPException(status_code=400, detail="Release has no stages or pipelines configured")

    # Generate release number
    execution_count = release_repository.count_executions(db, release.id)
    release_number = f"Release-{execution_count + 1}"

    # Create release execution
    release_execution = models.ReleaseExecution(
        release_id=release.id,
        release_number=release_number,
        triggered_by=request.triggered_by,
        status="in_progress",
        artifact_version=request.artifact_version,
        started_at=datetime.now()
    )
    db.add(release_execution)
    db.flush()

    # Store parameters
    if request.parameters:
        for param_name, param_value in request.parameters.items():
            exec_param = models.ReleaseExecutionParameter(
                release_execution_id=release_execution.id,
                parameter_name=param_name,
                parameter_value=str(param_value)
            )
            db.add(exec_param)

    # Get agent information if provided
    agent = None
    if request.agent_id:
        agent = agent_repository.get_by_id(db, request.agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

    # Create stage executions and pickup entries
    for stage in stages:
        environment = release_repository.get_environment(db, stage.environment_id)

        # Determine which agent to use (stage-specific or release-level)
        stage_agent = None
        if stage.agent_id:
            stage_agent = agent_repository.get_by_id(db, stage.agent_id)
        elif agent:
            stage_agent = agent

        # Determine initial status
        if stage.pre_deployment_approval or (environment and environment.requires_approval):
            initial_status = "awaiting_approval"
            approval_status = "pending"
        else:
            initial_status = "pending"
            approval_status = "not_required"

        stage_execution = models.StageExecution(
            release_execution_id=release_execution.id,
            release_stage_id=stage.id,
            environment_id=stage.environment_id,
            environment_name=environment.name if environment else "Unknown",
            agent_id=stage_agent.id if stage_agent else None,
            agent_name=stage_agent.name if stage_agent else None,
            status=initial_status,
            approval_status=approval_status
        )
        db.add(stage_execution)
        db.flush()

        # Create pickup entry if agent is assigned and no approval is required
        if stage_agent and initial_status == "pending":
            pickup_entry = models.ReleasePickup(
                release_execution_id=release_execution.id,
                stage_execution_id=stage_execution.id,
                agent_id=stage_agent.id,
                agent_uuid=stage_agent.uuid,
                agent_name=stage_agent.name,
                status="pending",
                priority=stage.order_index
            )
            db.add(pickup_entry)

    db.commit()

    return {
        "success": True,
        "message": "Release deployment initiated",
        "executionId": release_execution.id,
        "releaseNumber": release_number
    }


def approve_stage(stage_execution: models.StageExecution, request: ApprovalRequest, db: Session) -> dict:
    """Approve a stage execution. Caller is responsible for the
    stage-not-found and customer-access checks before calling this."""
    if stage_execution.approval_status != "pending":
        raise HTTPException(status_code=400, detail="Stage is not pending approval")

    stage_execution.approval_status = "approved"
    stage_execution.approved_by = request.approved_by
    stage_execution.approved_at = datetime.now()
    stage_execution.approval_comments = request.comments
    stage_execution.status = "pending"  # Ready to run

    # Create pickup entry if agent is assigned
    if stage_execution.agent_id:
        agent = agent_repository.get_by_id(db, stage_execution.agent_id)
        if agent:
            release_stage = release_repository.get_release_stage_by_id(db, stage_execution.release_stage_id)

            pickup_entry = models.ReleasePickup(
                release_execution_id=stage_execution.release_execution_id,
                stage_execution_id=stage_execution.id,
                agent_id=agent.id,
                agent_uuid=agent.uuid,
                agent_name=agent.name,
                status="pending",
                priority=release_stage.order_index if release_stage else 0
            )
            db.add(pickup_entry)

    db.commit()

    return {"success": True, "message": "Stage approved successfully"}


def reject_stage(stage_execution: models.StageExecution, request: ApprovalRequest, db: Session) -> dict:
    """Reject a stage execution. Caller is responsible for the
    stage-not-found and customer-access checks before calling this."""
    if stage_execution.approval_status != "pending":
        raise HTTPException(status_code=400, detail="Stage is not pending approval")

    stage_execution.approval_status = "rejected"
    stage_execution.approved_by = request.approved_by
    stage_execution.approved_at = datetime.now()
    stage_execution.approval_comments = request.comments
    stage_execution.status = "cancelled"

    # Update release execution status
    release_execution = release_repository.get_execution_by_id(db, stage_execution.release_execution_id)
    if release_execution:
        release_execution.status = "failed"
        release_execution.completed_at = datetime.now()

    db.commit()

    return {"success": True, "message": "Stage rejected"}


def abort_release_execution(release_execution: models.ReleaseExecution, db: Session) -> dict:
    """Abort an in-progress release execution.
    - Cancels all running pipeline pickups (agent detects cancellation via pickup status poll)
    - Cancels all pending pipeline executions so they never start
    - Marks the release execution as cancelled
    Caller is responsible for the execution-not-found and customer-access checks
    before calling this."""
    if release_execution.status != "in_progress":
        raise HTTPException(status_code=400, detail=f"Release execution is already '{release_execution.status}', cannot abort")

    # Get every pipeline execution that belongs to this release run
    all_pe = pipeline_repository.get_executions_for_release(db, release_execution.id)

    now = datetime.now()
    for pe in all_pe:
        if pe.status in ("running", "pending"):
            # Cancel the pickup so the agent stops picking it up
            active_pickup = pipeline_repository.get_active_pickup_for_execution(
                db, pe.id, ["pending", "picked_up", "in_progress"]
            )
            if active_pickup:
                active_pickup.status = "cancelled"
                active_pickup.completed_at = now
                active_pickup.error_message = "Release aborted by user"

            # Add a log entry for the pipeline execution
            db.add(models.PipelineExecutionLog(
                pipeline_execution_id=pe.id,
                message="Pipeline execution aborted — release was cancelled by user",
                log_level="warning",
                source="system"
            ))

            pe.status = "cancelled"
            pe.completed_at = now
            if pe.started_at:
                pe.duration = str(int((now - pe.started_at).total_seconds()))

    # Mark the release execution itself as cancelled
    release_execution.status = "cancelled"
    release_execution.completed_at = now
    if release_execution.started_at:
        release_execution.duration_seconds = int((now - release_execution.started_at).total_seconds())

    db.commit()
    return {"success": True, "message": "Release execution aborted"}


def update_release_execution_status(release_execution: models.ReleaseExecution, db: Session) -> dict:
    """Manually update release execution status based on pipeline completions.
    Caller is responsible for the execution-not-found and customer-access
    checks before calling this."""
    # Get all pipeline executions for this release
    time_window_start = release_execution.started_at
    time_window_end = release_execution.completed_at if release_execution.completed_at else datetime.now() + timedelta(hours=1)

    pipeline_executions = pipeline_repository.get_executions_by_trigger_and_window(
        db, release_execution.triggered_by, time_window_start, time_window_end
    )

    # Get the release to see how many pipelines it should have
    release = release_repository.get_by_id(db, release_execution.release_id)
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")

    release_pipelines = release_repository.get_release_pipelines(db, release.id)

    # Check if we have the expected number of pipeline executions
    if len(pipeline_executions) >= len(release_pipelines):
        # Check if all pipeline executions are complete
        all_complete = all(
            pe.status in ['success', 'failed', 'cancelled']
            for pe in pipeline_executions
        )

        if all_complete:
            # Determine overall status
            any_failed = any(pe.status == 'failed' for pe in pipeline_executions)

            release_execution.status = "failed" if any_failed else "succeeded"
            release_execution.completed_at = datetime.now()

            # Calculate duration
            if release_execution.started_at:
                duration = release_execution.completed_at - release_execution.started_at
                release_execution.duration_seconds = int(duration.total_seconds())

            db.commit()

            return {
                "success": True,
                "status": release_execution.status,
                "message": f"Release execution status updated to {release_execution.status}",
                "pipeline_count": len(pipeline_executions),
                "expected_count": len(release_pipelines)
            }
        else:
            incomplete = [pe for pe in pipeline_executions if pe.status not in ['success', 'failed', 'cancelled']]
            return {
                "success": False,
                "status": release_execution.status,
                "message": "Not all pipelines are complete",
                "pipeline_count": len(pipeline_executions),
                "expected_count": len(release_pipelines),
                "incomplete_count": len(incomplete)
            }
    else:
        return {
            "success": False,
            "status": release_execution.status,
            "message": "Not enough pipeline executions found",
            "pipeline_count": len(pipeline_executions),
            "expected_count": len(release_pipelines)
        }
