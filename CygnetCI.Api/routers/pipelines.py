"""Pipeline endpoints: UI pipelines, pipeline execution, and agent pipeline pickup."""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models
from formatters import format_pipeline, format_pipeline_full
from deps import get_agent_uuid, require_permission, get_allowed_customer_ids, require_customer_access
import pipeline_service
from pipeline_service import RunPipelineRequest

router = APIRouter()


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
    return pipeline_service.cleanup_stale_executions(stale_minutes, db)

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

    return pipeline_service.run(db_pipeline, request, db)

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

    return pipeline_service.stop(db_pipeline, db)


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

    return pipeline_service.complete_pickup(pickup, completion_data, db)

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
