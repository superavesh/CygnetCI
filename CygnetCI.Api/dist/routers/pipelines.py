"""Pipeline endpoints: UI pipelines, pipeline execution, and agent pipeline pickup."""
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models
from formatters import format_pipeline, format_pipeline_full
from deps import get_agent_uuid, require_permission, get_allowed_customer_ids, require_customer_access

router = APIRouter()


class RunPipelineRequest(BaseModel):
    agent_id: Optional[int] = None
    parameters: Optional[Dict[str, Any]] = None

class PipelineStepData(BaseModel):
    name: str
    command: str
    order: int
    shellType: str = 'cmd'  # powershell, cmd, or bash

class PipelineParameterData(BaseModel):
    name: str
    type: str  # 'string', 'number', 'boolean', 'choice'
    defaultValue: Optional[str] = None
    required: bool = False
    description: Optional[str] = None
    choices: Optional[List[str]] = None

class PipelineCreate(BaseModel):
    name: str
    branch: str
    description: Optional[str] = None
    agentId: Optional[int] = None
    customerId: int  # Required - pipeline must belong to a customer
    logVerboseOutput: bool = False
    steps: List[PipelineStepData] = []
    parameters: List[PipelineParameterData] = []

class PipelineUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    branch: Optional[str] = None
    agentId: Optional[int] = None
    logVerboseOutput: Optional[bool] = None
    steps: Optional[List[PipelineStepData]] = None
    parameters: Optional[List[PipelineParameterData]] = None


# ==================== PIPELINES ====================

@router.get("/pipelines/templates", tags=["🌐 UI - Pipelines"])
def get_pipeline_templates(
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("pipelines", "read")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Get pipelines for use as copy templates, scoped to the caller's assigned customers"""
    query = db.query(models.Pipeline)
    if allowed is not None:
        query = query.filter(models.Pipeline.customer_id.in_(allowed))
    pipelines = query.order_by(models.Pipeline.customer_id, models.Pipeline.name).all()
    result = []
    for pipeline in pipelines:
        customer = db.query(models.Customer).filter(models.Customer.id == pipeline.customer_id).first()
        steps = db.query(models.PipelineStep)\
            .filter(models.PipelineStep.pipeline_id == pipeline.id)\
            .order_by(models.PipelineStep.step_order).all()
        parameters = db.query(models.PipelineParameter)\
            .filter(models.PipelineParameter.pipeline_id == pipeline.id).all()
        result.append({
            "id": pipeline.id,
            "name": pipeline.name,
            "description": pipeline.description,
            "branch": pipeline.branch,
            "customer_id": pipeline.customer_id,
            "customer_name": customer.display_name if customer else "Unknown",
            "steps": [{"name": s.name, "command": s.command, "order": s.step_order, "shellType": s.shell_type} for s in steps],
            "parameters": [{"name": p.name, "type": p.type, "defaultValue": p.default_value or "", "required": p.required, "description": p.description or "", "choices": p.choices} for p in parameters]
        })
    return result

@router.post("/pipelines/cleanup-stale", tags=["🌐 UI - Pipelines"])
def cleanup_stale_pipeline_executions(stale_minutes: int = 30, db: Session = Depends(get_db)):
    """Mark pipeline executions as failed if they have been 'running' with no new logs for stale_minutes.
    Called by the UI periodically as a safety net for when the agent fails to report completion."""
    cutoff = datetime.now() - timedelta(minutes=stale_minutes)

    # Find all executions that are still marked 'running'
    running_executions = db.query(models.PipelineExecution)\
        .filter(models.PipelineExecution.status == "running")\
        .all()

    cleaned = 0
    for execution in running_executions:
        # Check when the last log was received
        last_log = db.query(models.PipelineExecutionLog)\
            .filter(models.PipelineExecutionLog.pipeline_execution_id == execution.id)\
            .order_by(models.PipelineExecutionLog.created_at.desc())\
            .first()

        last_activity = last_log.created_at if last_log else execution.started_at
        if last_activity and last_activity < cutoff:
            # No activity for stale_minutes — mark as failed
            execution.status = "failed"
            execution.completed_at = datetime.now()
            if execution.started_at:
                d = execution.completed_at - execution.started_at
                execution.duration_seconds = int(d.total_seconds())

            # Also update the pipeline status
            pipeline = db.query(models.Pipeline)\
                .filter(models.Pipeline.id == execution.pipeline_id).first()
            if pipeline and pipeline.status == "running":
                pipeline.status = "failed"

            # Mark the pickup as failed too
            pickup = db.query(models.PipelinePickup)\
                .filter(models.PipelinePickup.pipeline_execution_id == execution.id,
                        models.PipelinePickup.status.in_(["pending", "running", "acknowledged"]))\
                .first()
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

@router.get("/pipelines", tags=["🌐 UI - Pipelines"])
def get_pipelines(
    customer_id: Optional[int] = None,
    status: Optional[str] = None,
    branch: Optional[str] = None,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("pipelines", "read")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Get all pipelines with optional filtering by customer, scoped to the caller's
    assigned customers (superusers see all)"""
    if customer_id:
        require_customer_access(customer_id, allowed)

    query = db.query(models.Pipeline)

    if customer_id:
        query = query.filter(models.Pipeline.customer_id == customer_id)
    elif allowed is not None:
        query = query.filter(models.Pipeline.customer_id.in_(allowed))
    if status:
        query = query.filter(models.Pipeline.status == status)
    if branch:
        query = query.filter(models.Pipeline.branch == branch)

    pipelines = query.order_by(models.Pipeline.last_run.desc()).all()

    # Return pipelines with steps and parameters
    return [format_pipeline_full(pipeline, db) for pipeline in pipelines]

@router.post("/pipelines", status_code=201, tags=["🌐 UI - Pipelines"])
def create_pipeline(
    pipeline: PipelineCreate,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("pipelines", "create")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Create a new pipeline with steps and parameters"""
    require_customer_access(pipeline.customerId, allowed)

    # Create pipeline
    db_pipeline = models.Pipeline(
        name=pipeline.name,
        description=pipeline.description,
        branch=pipeline.branch,
        status="pending",
        agent_id=pipeline.agentId,
        customer_id=pipeline.customerId,
        log_verbose_output=pipeline.logVerboseOutput,
        commit="",
        duration="-"
    )
    
    db.add(db_pipeline)
    db.flush()  # Get the pipeline ID
    
    # Create steps
    for step_data in pipeline.steps:
        db_step = models.PipelineStep(
            pipeline_id=db_pipeline.id,
            name=step_data.name,
            command=step_data.command,
            step_order=step_data.order,
            shell_type=step_data.shellType
        )
        db.add(db_step)
    
    # Create parameters
    for param_data in pipeline.parameters:
        db_param = models.PipelineParameter(
            pipeline_id=db_pipeline.id,
            name=param_data.name,
            type=param_data.type,
            default_value=param_data.defaultValue,
            required=param_data.required,
            description=param_data.description,
            choices=param_data.choices
        )
        db.add(db_param)
    
    db.commit()
    db.refresh(db_pipeline)
    
    return format_pipeline_full(db_pipeline, db)

@router.get("/pipelines/{pipeline_id}", tags=["🌐 UI - Pipelines"])
def get_pipeline(
    pipeline_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("pipelines", "read")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Get pipeline by ID with steps and parameters"""
    pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    require_customer_access(pipeline.customer_id, allowed)
    return format_pipeline_full(pipeline, db)

@router.put("/pipelines/{pipeline_id}", tags=["🌐 UI - Pipelines"])
def update_pipeline(
    pipeline_id: int,
    pipeline: PipelineUpdate,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("pipelines", "update")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Update an existing pipeline"""
    db_pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
    if not db_pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    require_customer_access(db_pipeline.customer_id, allowed)

    # Update basic fields
    if pipeline.name is not None:
        db_pipeline.name = pipeline.name
    if pipeline.description is not None:
        db_pipeline.description = pipeline.description
    if pipeline.status is not None:
        db_pipeline.status = pipeline.status
    if pipeline.branch is not None:
        db_pipeline.branch = pipeline.branch
    if pipeline.agentId is not None:
        db_pipeline.agent_id = pipeline.agentId
    if pipeline.logVerboseOutput is not None:
        db_pipeline.log_verbose_output = pipeline.logVerboseOutput

    # Update steps if provided
    if pipeline.steps is not None:
        # Delete existing steps
        db.query(models.PipelineStep).filter(
            models.PipelineStep.pipeline_id == pipeline_id
        ).delete()
        
        # Add new steps
        for step_data in pipeline.steps:
            db_step = models.PipelineStep(
                pipeline_id=pipeline_id,
                name=step_data.name,
                command=step_data.command,
                step_order=step_data.order,
                shell_type=step_data.shellType
            )
            db.add(db_step)
    
    # Update parameters if provided
    if pipeline.parameters is not None:
        # Delete existing parameters
        db.query(models.PipelineParameter).filter(
            models.PipelineParameter.pipeline_id == pipeline_id
        ).delete()
        
        # Add new parameters
        for param_data in pipeline.parameters:
            db_param = models.PipelineParameter(
                pipeline_id=pipeline_id,
                name=param_data.name,
                type=param_data.type,
                default_value=param_data.defaultValue,
                required=param_data.required,
                description=param_data.description,
                choices=param_data.choices
            )
            db.add(db_param)
    
    db.commit()
    db.refresh(db_pipeline)

    return format_pipeline_full(db_pipeline, db)

@router.delete("/pipelines/{pipeline_id}", tags=["🌐 UI - Pipelines"])
def delete_pipeline(
    pipeline_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("pipelines", "delete")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Delete a pipeline"""
    db_pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
    if not db_pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    require_customer_access(db_pipeline.customer_id, allowed)

    # Delete the pipeline (cascade will delete related steps, parameters, executions)
    db.delete(db_pipeline)
    db.commit()

    return {"success": True, "message": f"Pipeline {pipeline_id} deleted successfully"}

@router.post("/pipelines/{pipeline_id}/run", tags=["🌐 UI - Pipeline Execution"])
def run_pipeline(
    pipeline_id: int,
    request: RunPipelineRequest,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("pipelines", "execute")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Trigger a pipeline execution with parameters and create pickup for agent"""
    db_pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
    if not db_pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    require_customer_access(db_pipeline.customer_id, allowed)

    # Get agent - use provided agent_id or default agent from pipeline
    agent_id = request.agent_id if request.agent_id else db_pipeline.agent_id
    if not agent_id:
        raise HTTPException(status_code=400, detail="No agent specified for pipeline execution")

    agent = db.query(models.Agent).filter(models.Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    db_pipeline.status = "pending"
    db_pipeline.last_run = datetime.now()

    # Create execution record
    execution = models.PipelineExecution(
        pipeline_id=pipeline_id,
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
        pipeline_id=pipeline_id,
        pipeline_name=db_pipeline.name,
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

@router.get("/pipelines/{pipeline_id}/executions", tags=["🌐 UI - Pipelines"])
def get_pipeline_executions(
    pipeline_id: int,
    limit: int = 10,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("pipelines", "read")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Get execution history for a pipeline"""
    db_pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
    if not db_pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    require_customer_access(db_pipeline.customer_id, allowed)

    executions = db.query(models.PipelineExecution)\
        .filter(models.PipelineExecution.pipeline_id == pipeline_id)\
        .order_by(models.PipelineExecution.started_at.desc())\
        .limit(limit)\
        .all()
    
    result = []
    for execution in executions:
        # Get parameters used in this execution
        params = db.query(models.PipelineExecutionParam)\
            .filter(models.PipelineExecutionParam.execution_id == execution.id)\
            .all()

        # Calculate duration if completed
        duration_value = None
        if execution.completed_at and execution.started_at:
            duration_seconds = int((execution.completed_at - execution.started_at).total_seconds())
            duration_value = duration_seconds

        result.append({
            "id": execution.id,
            "status": execution.status,
            "startedAt": execution.started_at.isoformat(),
            "completedAt": execution.completed_at.isoformat() if execution.completed_at else None,
            "duration": duration_value,
            "parameters": {p.param_name: p.param_value for p in params}
        })
    
    return result

@router.post("/pipelines/{pipeline_id}/stop", tags=["🌐 UI - Pipeline Execution"])
def stop_pipeline(
    pipeline_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("pipelines", "execute")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Stop a running pipeline by cancelling its active execution and pickup"""
    db_pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
    if not db_pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    require_customer_access(db_pipeline.customer_id, allowed)

    # Find the currently running execution for this pipeline
    running_execution = db.query(models.PipelineExecution)\
        .filter(models.PipelineExecution.pipeline_id == pipeline_id)\
        .filter(models.PipelineExecution.status == "running")\
        .order_by(models.PipelineExecution.started_at.desc())\
        .first()

    if running_execution:
        # Mark execution as cancelled
        running_execution.status = "cancelled"
        running_execution.completed_at = datetime.now()
        if running_execution.started_at:
            duration = running_execution.completed_at - running_execution.started_at
            running_execution.duration = str(int(duration.total_seconds()))

        # Find and cancel the active pickup for this execution
        active_pickup = db.query(models.PipelinePickup)\
            .filter(models.PipelinePickup.pipeline_execution_id == running_execution.id)\
            .filter(models.PipelinePickup.status.in_(["pending", "picked_up", "in_progress"]))\
            .first()

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
    db_pipeline.status = "pending"
    db.commit()

    return {"success": True, "message": "Pipeline stopped"}


# ==============================================
# PIPELINE PICKUP ENDPOINTS (Agent Polling)
# ==============================================

@router.get("/pipelines/pickup/pending", tags=["🤖 Agent - Pipeline Execution"])
def get_pending_pipelines(agent_uuid: str = Depends(get_agent_uuid), db: Session = Depends(get_db)):
    """Get pending pipeline pickups for a specific agent"""
    # Verify agent exists
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Get pending pickups for this agent
    pickups = db.query(models.PipelinePickup)\
        .filter(
            models.PipelinePickup.agent_uuid == agent_uuid,
            models.PipelinePickup.status.in_(["pending", "picked_up"])
        )\
        .order_by(models.PipelinePickup.priority, models.PipelinePickup.created_at)\
        .all()

    result = []
    for pickup in pickups:
        # Get pipeline execution details
        pipeline_execution = db.query(models.PipelineExecution)\
            .filter(models.PipelineExecution.id == pickup.pipeline_execution_id)\
            .first()

        # Get pipeline details
        pipeline = db.query(models.Pipeline)\
            .filter(models.Pipeline.id == pickup.pipeline_id)\
            .first()

        # Get execution parameters
        exec_params = db.query(models.PipelineExecutionParam)\
            .filter(models.PipelineExecutionParam.execution_id == pickup.pipeline_execution_id)\
            .all()

        parameters = {param.param_name: param.param_value for param in exec_params}

        # Get pipeline steps
        steps = db.query(models.PipelineStep)\
            .filter(models.PipelineStep.pipeline_id == pickup.pipeline_id)\
            .order_by(models.PipelineStep.step_order)\
            .all()

        steps_data = [{
            "id": step.id,
            "name": step.name,
            "command": step.command,
            "order_index": step.step_order,
            "shell_type": step.shell_type,
            "continue_on_error": False  # Default value since this field doesn't exist in the model
        } for step in steps]

        result.append({
            "pickup_id": pickup.id,
            "pipeline_execution_id": pickup.pipeline_execution_id,
            "pipeline_id": pickup.pipeline_id,
            "pipeline_name": pickup.pipeline_name,
            "status": pickup.status,
            "priority": pickup.priority,
            "created_at": pickup.created_at.isoformat() if pickup.created_at else None,
            "parameters": parameters,
            "steps": steps_data,
            "log_verbose_output": pipeline.log_verbose_output if pipeline else False,
            "pipeline": {
                "name": pipeline.name,
                "description": pipeline.description,
                "branch": pipeline.branch
            } if pipeline else None
        })

    return result

@router.post("/pipelines/pickup/{pickup_id}/acknowledge", tags=["🤖 Agent - Pipeline Execution"])
def acknowledge_pipeline_pickup(pickup_id: int, db: Session = Depends(get_db)):
    """Agent acknowledges picking up a pipeline execution"""
    pickup = db.query(models.PipelinePickup).filter(models.PipelinePickup.id == pickup_id).first()

    if not pickup:
        raise HTTPException(status_code=404, detail="Pickup not found")

    pickup.status = "picked_up"
    pickup.picked_up_at = datetime.now()

    db.commit()

    return {"success": True, "message": "Pickup acknowledged"}

@router.post("/pipelines/pickup/{pickup_id}/start", tags=["🤖 Agent - Pipeline Execution"])
def start_pipeline_pickup(pickup_id: int, db: Session = Depends(get_db)):
    """Agent starts executing a pipeline"""
    pickup = db.query(models.PipelinePickup).filter(models.PipelinePickup.id == pickup_id).first()

    if not pickup:
        raise HTTPException(status_code=404, detail="Pickup not found")

    pickup.status = "in_progress"
    pickup.started_at = datetime.now()

    # Update pipeline execution status
    pipeline_execution = db.query(models.PipelineExecution)\
        .filter(models.PipelineExecution.id == pickup.pipeline_execution_id)\
        .first()

    if pipeline_execution:
        pipeline_execution.status = "running"

    # Update pipeline status
    pipeline = db.query(models.Pipeline)\
        .filter(models.Pipeline.id == pickup.pipeline_id)\
        .first()

    if pipeline:
        pipeline.status = "running"

    db.commit()

    return {"success": True, "message": "Pipeline execution started"}

@router.post("/pipelines/pickup/{pickup_id}/complete", tags=["🤖 Agent - Pipeline Execution"])
def complete_pipeline_pickup(pickup_id: int, completion_data: dict, db: Session = Depends(get_db)):
    """Agent completes a pipeline execution"""
    pickup = db.query(models.PipelinePickup).filter(models.PipelinePickup.id == pickup_id).first()

    if not pickup:
        raise HTTPException(status_code=404, detail="Pickup not found")

    success = completion_data.get("success", False)
    error_message = completion_data.get("error_message")

    pickup.status = "completed" if success else "failed"
    pickup.completed_at = datetime.now()
    pickup.error_message = error_message

    # Update pipeline execution
    pipeline_execution = db.query(models.PipelineExecution)\
        .filter(models.PipelineExecution.id == pickup.pipeline_execution_id)\
        .first()

    if pipeline_execution:
        pipeline_execution.status = "success" if success else "failed"
        pipeline_execution.completed_at = datetime.now()

        if pipeline_execution.started_at:
            duration = pipeline_execution.completed_at - pipeline_execution.started_at
            pipeline_execution.duration_seconds = int(duration.total_seconds())

    # Update pipeline status
    pipeline = db.query(models.Pipeline)\
        .filter(models.Pipeline.id == pickup.pipeline_id)\
        .first()

    if pipeline:
        pipeline.status = "success" if success else "failed"

    # ── DAG advancement: if this execution is part of a release workflow,
    # unlock dependent pipelines and check for overall release completion.
    if pipeline_execution and pipeline_execution.release_execution_id and pipeline_execution.release_pipeline_id:
        rel_exec_id = pipeline_execution.release_execution_id
        completed_rp_id = pipeline_execution.release_pipeline_id

        if success:
            # Find all release_pipeline nodes that depend on the just-completed node
            next_rps = db.query(models.ReleasePipeline)\
                .filter(models.ReleasePipeline.depends_on == completed_rp_id)\
                .all()

            for next_rp in next_rps:
                # Find the pending execution we created for this node at deploy time
                pending_exec = db.query(models.PipelineExecution)\
                    .filter(
                        models.PipelineExecution.release_execution_id == rel_exec_id,
                        models.PipelineExecution.release_pipeline_id == next_rp.id,
                        models.PipelineExecution.status == "pending"
                    ).first()

                if not pending_exec:
                    continue  # already started or missing — skip

                # Transition to running and create the pickup so the agent picks it up
                pending_exec.status = "running"
                pending_exec.started_at = datetime.now()
                db.flush()

                next_pipeline = db.query(models.Pipeline)\
                    .filter(models.Pipeline.id == next_rp.pipeline_id).first()
                next_agent = db.query(models.Agent)\
                    .filter(models.Agent.id == pending_exec.agent_id).first()

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
        all_executions = db.query(models.PipelineExecution)\
            .filter(models.PipelineExecution.release_execution_id == rel_exec_id)\
            .all()

        all_terminal = all(
            pe.status in ('success', 'failed', 'cancelled')
            for pe in all_executions
        )

        if all_terminal:
            release_execution = db.query(models.ReleaseExecution)\
                .filter(models.ReleaseExecution.id == rel_exec_id).first()
            if release_execution and release_execution.status == "in_progress":
                any_failed = any(pe.status == 'failed' for pe in all_executions)
                release_execution.status = "failed" if any_failed else "succeeded"
                release_execution.completed_at = datetime.now()
                if release_execution.started_at:
                    d = release_execution.completed_at - release_execution.started_at
                    release_execution.duration_seconds = int(d.total_seconds())

    db.commit()

    return {"success": True, "message": "Pipeline execution completed"}

@router.get("/pipelines/pickup/{pickup_id}/status", tags=["🤖 Agent - Pipeline Execution"])
def get_pipeline_pickup_status(pickup_id: int, db: Session = Depends(get_db)):
    """Agent checks if a pipeline pickup has been cancelled"""
    pickup = db.query(models.PipelinePickup).filter(models.PipelinePickup.id == pickup_id).first()

    if not pickup:
        raise HTTPException(status_code=404, detail="Pickup not found")

    return {"pickup_id": pickup_id, "status": pickup.status}

@router.post("/pipelines/pickup/{pickup_id}/log", tags=["🤖 Agent - Pipeline Execution"])
def add_pipeline_pickup_log(pickup_id: int, log_data: dict, db: Session = Depends(get_db)):
    """Agent sends log entry for pipeline execution"""
    pickup = db.query(models.PipelinePickup).filter(models.PipelinePickup.id == pickup_id).first()

    if not pickup:
        raise HTTPException(status_code=404, detail="Pickup not found")

    # Create log entry for pipeline execution
    log_entry = models.PipelineExecutionLog(
        pipeline_execution_id=pickup.pipeline_execution_id,
        log_level=log_data.get("log_level", "info"),
        message=log_data.get("message"),
        step_name=log_data.get("step_name"),
        step_index=log_data.get("step_index"),
        source="agent"
    )

    db.add(log_entry)
    db.commit()

    return {"success": True, "log_id": log_entry.id}
