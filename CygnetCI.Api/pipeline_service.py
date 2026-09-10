"""Pipeline execution business logic, extracted from routers/pipelines.py.

Moved out of the router (logic unchanged) so it can be tested independently of
FastAPI request/response handling. routers/pipelines.py now only does the
HTTP-layer concerns (fetch pipeline/pickup, 404, customer-access check) and
delegates to run()/complete_pickup() here. See
tests/test_pipeline_execution_characterization.py for the tests that pin this
behavior across the extraction — including the DAG-advancement logic that
unlocks downstream release pipelines and detects overall release completion.
"""
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
import agent_repository
import pipeline_repository
import release_repository


class RunPipelineRequest(BaseModel):
    agent_id: Optional[int] = None
    parameters: Optional[Dict[str, Any]] = None


def run(pipeline: models.Pipeline, request: RunPipelineRequest, db: Session) -> dict:
    """Trigger a pipeline execution with parameters and create pickup for agent"""
    # Get agent - use provided agent_id or default agent from pipeline
    agent_id = request.agent_id if request.agent_id else pipeline.agent_id
    if not agent_id:
        raise HTTPException(status_code=400, detail="No agent specified for pipeline execution")

    agent = agent_repository.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    pipeline.status = "pending"
    pipeline.last_run = datetime.now()

    # Create execution record
    execution = models.PipelineExecution(
        pipeline_id=pipeline.id,
        status="running",
        started_at=datetime.now()
    )
    db.add(execution)
    db.flush()  # Get execution ID

    # Store execution parameters
    if request.parameters:
        for param_name, param_value in request.parameters.items():
            exec_param = models.PipelineExecutionParam(
                execution_id=execution.id,
                param_name=param_name,
                param_value=str(param_value)
            )
            db.add(exec_param)

    # Create pickup entry for agent
    pickup_entry = models.PipelinePickup(
        pipeline_execution_id=execution.id,
        pipeline_id=pipeline.id,
        pipeline_name=pipeline.name,
        agent_id=agent.id,
        agent_uuid=agent.uuid,
        agent_name=agent.name,
        status="pending",
        priority=0
    )
    db.add(pickup_entry)

    db.commit()

    return {
        "success": True,
        "message": "Pipeline queued for execution",
        "executionId": execution.id
    }


def complete_pickup(pickup: models.PipelinePickup, completion_data: dict, db: Session) -> dict:
    """Agent completes a pipeline execution"""
    success = completion_data.get("success", False)
    error_message = completion_data.get("error_message")

    pickup.status = "completed" if success else "failed"
    pickup.completed_at = datetime.now()
    pickup.error_message = error_message

    # Update pipeline execution
    pipeline_execution = pipeline_repository.get_execution_by_id(db, pickup.pipeline_execution_id)

    if pipeline_execution:
        pipeline_execution.status = "success" if success else "failed"
        pipeline_execution.completed_at = datetime.now()

        if pipeline_execution.started_at:
            duration = pipeline_execution.completed_at - pipeline_execution.started_at
            pipeline_execution.duration_seconds = int(duration.total_seconds())

    # Update pipeline status
    pipeline = pipeline_repository.get_by_id(db, pickup.pipeline_id)

    if pipeline:
        pipeline.status = "success" if success else "failed"

    # ── DAG advancement: if this execution is part of a release workflow,
    # unlock dependent pipelines and check for overall release completion.
    if pipeline_execution and pipeline_execution.release_execution_id and pipeline_execution.release_pipeline_id:
        rel_exec_id = pipeline_execution.release_execution_id
        completed_rp_id = pipeline_execution.release_pipeline_id

        if success:
            # Find all release_pipeline nodes that depend on the just-completed node
            next_rps = release_repository.get_dependent_pipelines(db, completed_rp_id)

            for next_rp in next_rps:
                # Find the pending execution we created for this node at deploy time
                pending_exec = pipeline_repository.get_pending_execution_for_node(db, rel_exec_id, next_rp.id)

                if not pending_exec:
                    continue  # already started or missing — skip

                # Transition to running and create the pickup so the agent picks it up
                pending_exec.status = "running"
                pending_exec.started_at = datetime.now()
                db.flush()

                next_pipeline = pipeline_repository.get_by_id(db, next_rp.pipeline_id)
                next_agent = agent_repository.get_by_id(db, pending_exec.agent_id)

                if next_pipeline and next_agent:
                    db.add(models.PipelinePickup(
                        pipeline_execution_id=pending_exec.id,
                        pipeline_id=next_pipeline.id,
                        pipeline_name=next_pipeline.name,
                        agent_id=next_agent.id,
                        agent_uuid=next_agent.uuid,
                        agent_name=next_agent.name,
                        status="pending",
                        priority=next_rp.order_index
                    ))

        # Check if every node in this release execution is now terminal
        all_executions = pipeline_repository.get_executions_for_release(db, rel_exec_id)

        all_terminal = all(
            pe.status in ('success', 'failed', 'cancelled')
            for pe in all_executions
        )

        if all_terminal:
            release_execution = release_repository.get_execution_by_id(db, rel_exec_id)
            if release_execution and release_execution.status == "in_progress":
                any_failed = any(pe.status == 'failed' for pe in all_executions)
                release_execution.status = "failed" if any_failed else "succeeded"
                release_execution.completed_at = datetime.now()
                if release_execution.started_at:
                    d = release_execution.completed_at - release_execution.started_at
                    release_execution.duration_seconds = int(d.total_seconds())

    db.commit()

    return {"success": True, "message": "Pipeline execution completed"}


def cleanup_stale_executions(stale_minutes: int, db: Session) -> dict:
    """Mark pipeline executions as failed if they have been 'running' with no
    new logs for stale_minutes. Called by the UI periodically as a safety net
    for when the agent fails to report completion.

    NOTE: last_activity comparisons mix Python's local-timezone datetime.now()
    with DB-generated timestamps (PipelineExecutionLog.timestamp uses
    server_default=func.now()). If the database server's clock/timezone
    differs from this process's, staleness detection can be wrong — this is a
    pre-existing issue in the code being moved here, not something fixed as
    part of this extraction. See tests/test_pipeline_lifecycle_characterization.py.
    """
    cutoff = datetime.now() - timedelta(minutes=stale_minutes)

    # Find all executions that are still marked 'running'
    running_executions = pipeline_repository.get_all_running_executions(db)

    cleaned = 0
    for execution in running_executions:
        # Check when the last log was received
        last_log = pipeline_repository.get_last_log_for_execution(db, execution.id)

        last_activity = last_log.timestamp if last_log else execution.started_at
        if last_activity and last_activity < cutoff:
            # No activity for stale_minutes — mark as failed
            execution.status = "failed"
            execution.completed_at = datetime.now()
            if execution.started_at:
                d = execution.completed_at - execution.started_at
                execution.duration_seconds = int(d.total_seconds())

            # Also update the pipeline status
            pipeline = pipeline_repository.get_by_id(db, execution.pipeline_id)
            if pipeline and pipeline.status == "running":
                pipeline.status = "failed"

            # Mark the pickup as failed too
            pickup = pipeline_repository.get_active_pickup_for_execution(
                db, execution.id, ["pending", "running", "acknowledged"]
            )
            if pickup:
                pickup.status = "failed"
                pickup.completed_at = datetime.now()
                pickup.error_message = f"Execution timed out — no activity for over {stale_minutes} minutes"

            # Add a log entry explaining why it was marked failed
            db.add(models.PipelineExecutionLog(
                pipeline_execution_id=execution.id,
                message=f"[System] Execution marked as failed — no activity for over {stale_minutes} minutes. Agent may have crashed or lost connectivity.",
                log_level="error",
                source="system"
            ))
            cleaned += 1

    db.commit()
    return {"cleaned": cleaned, "message": f"Marked {cleaned} stale execution(s) as failed"}


def stop(pipeline: models.Pipeline, db: Session) -> dict:
    """Stop a running pipeline by cancelling its active execution and pickup"""
    running_execution = pipeline_repository.get_latest_running_execution(db, pipeline.id)

    if running_execution:
        # Mark execution as cancelled
        running_execution.status = "cancelled"
        running_execution.completed_at = datetime.now()
        if running_execution.started_at:
            duration = running_execution.completed_at - running_execution.started_at
            running_execution.duration = str(int(duration.total_seconds()))

        # Find and cancel the active pickup for this execution
        active_pickup = pipeline_repository.get_active_pickup_for_execution(
            db, running_execution.id, ["pending", "picked_up", "in_progress"]
        )

        if active_pickup:
            active_pickup.status = "cancelled"
            active_pickup.completed_at = datetime.now()
            active_pickup.error_message = "Cancelled by user"

        # Add a cancellation log entry
        cancel_log = models.PipelineExecutionLog(
            pipeline_execution_id=running_execution.id,
            message="Pipeline execution cancelled by user",
            log_level="warning",
            source="system"
        )
        db.add(cancel_log)

    # Reset pipeline status to pending
    pipeline.status = "pending"
    db.commit()

    return {"success": True, "message": "Pipeline stopped"}
