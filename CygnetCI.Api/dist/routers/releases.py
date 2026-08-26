"""Release endpoints: environments, releases, release/stage/pipeline execution, and agent release pickup."""
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models
from config import app_config
from deps import get_agent_uuid, require_permission, get_allowed_customer_ids, require_customer_access

router = APIRouter()

# ==================== RELEASE MANAGEMENT ====================

# Pydantic models for Release Management
class EnvironmentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    order_index: int = 0
    requires_approval: bool = False
    approvers: List[str] = []

class EnvironmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    order_index: Optional[int] = None
    requires_approval: Optional[bool] = None
    approvers: Optional[List[str]] = None

class ReleaseStageData(BaseModel):
    environment_id: int
    order_index: int
    pipeline_id: Optional[int] = None
    pre_deployment_approval: bool = False
    post_deployment_approval: bool = False
    auto_deploy: bool = False

class ReleasePipelineData(BaseModel):
    pipeline_id: int
    order_index: int
    execution_mode: str = "sequential"  # 'sequential' or 'parallel'
    depends_on: Optional[int] = None
    position_x: int = 0
    position_y: int = 0

class ReleaseCreate(BaseModel):
    name: str
    description: Optional[str] = None
    pipeline_id: Optional[int] = None
    version: Optional[str] = None
    customer_id: Optional[int] = None
    stages: List[ReleaseStageData] = []
    pipelines: List[ReleasePipelineData] = []

class ReleaseUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    version: Optional[str] = None
    pipelines: Optional[List[ReleasePipelineData]] = None
    stages: Optional[List[ReleaseStageData]] = None

class DeployReleaseRequest(BaseModel):
    triggered_by: str
    artifact_version: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    agent_id: Optional[int] = None

class ApprovalRequest(BaseModel):
    approved_by: str
    comments: Optional[str] = None

# (FilePushRequest / FileAcknowledgeRequest belong to file transfer — kept in main.py)

@router.get("/environments")
def get_environments(
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("releases", "read")),
):
    """Get all environments"""
    environments = db.query(models.Environment).order_by(models.Environment.order_index).all()
    return [
        {
            "id": env.id,
            "name": env.name,
            "description": env.description,
            "order_index": env.order_index,
            "requires_approval": env.requires_approval,
            "approvers": env.approvers or [],
            "created_at": env.created_at.isoformat()
        }
        for env in environments
    ]

@router.post("/environments", status_code=201)
def create_environment(
    environment: EnvironmentCreate,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("releases", "create")),
):
    """Create a new environment"""
    db_environment = models.Environment(
        name=environment.name,
        description=environment.description,
        order_index=environment.order_index,
        requires_approval=environment.requires_approval,
        approvers=environment.approvers
    )
    db.add(db_environment)
    db.commit()
    db.refresh(db_environment)

    return {
        "id": db_environment.id,
        "name": db_environment.name,
        "description": db_environment.description,
        "order_index": db_environment.order_index,
        "requires_approval": db_environment.requires_approval,
        "approvers": db_environment.approvers or []
    }

@router.put("/environments/{environment_id}")
def update_environment(
    environment_id: int,
    environment: EnvironmentUpdate,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("releases", "update")),
):
    """Update an environment"""
    db_environment = db.query(models.Environment).filter(models.Environment.id == environment_id).first()
    if not db_environment:
        raise HTTPException(status_code=404, detail="Environment not found")

    if environment.name is not None:
        db_environment.name = environment.name
    if environment.description is not None:
        db_environment.description = environment.description
    if environment.order_index is not None:
        db_environment.order_index = environment.order_index
    if environment.requires_approval is not None:
        db_environment.requires_approval = environment.requires_approval
    if environment.approvers is not None:
        db_environment.approvers = environment.approvers

    db.commit()
    db.refresh(db_environment)

    return {
        "id": db_environment.id,
        "name": db_environment.name,
        "description": db_environment.description,
        "order_index": db_environment.order_index,
        "requires_approval": db_environment.requires_approval,
        "approvers": db_environment.approvers or []
    }

@router.get("/releases", tags=["🌐 UI - Releases"])
def get_releases(
    customer_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("releases", "read")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Get all releases with their stages and pipelines, scoped to the caller's
    assigned customers (superusers see all)"""
    if customer_id:
        require_customer_access(customer_id, allowed)

    query = db.query(models.Release)

    if customer_id:
        query = query.filter(models.Release.customer_id == customer_id)
    elif allowed is not None:
        query = query.filter(models.Release.customer_id.in_(allowed))

    releases = query.order_by(models.Release.created_at.desc()).all()

    result = []
    for release in releases:
        # Get stages for this release
        stages = db.query(models.ReleaseStage)\
            .filter(models.ReleaseStage.release_id == release.id)\
            .order_by(models.ReleaseStage.order_index)\
            .all()

        # Get pipelines for this release
        release_pipelines = db.query(models.ReleasePipeline)\
            .filter(models.ReleasePipeline.release_id == release.id)\
            .order_by(models.ReleasePipeline.order_index)\
            .all()

        # Get latest execution
        latest_execution = db.query(models.ReleaseExecution)\
            .filter(models.ReleaseExecution.release_id == release.id)\
            .order_by(models.ReleaseExecution.created_at.desc())\
            .first()

        result.append({
            "id": release.id,
            "name": release.name,
            "description": release.description,
            "pipeline_id": release.pipeline_id,
            "version": release.version,
            "status": release.status,
            "created_by": release.created_by,
            "created_at": release.created_at.isoformat(),
            "stages": [
                {
                    "id": stage.id,
                    "environment_id": stage.environment_id,
                    "order_index": stage.order_index,
                    "pipeline_id": stage.pipeline_id,
                    "pre_deployment_approval": stage.pre_deployment_approval,
                    "post_deployment_approval": stage.post_deployment_approval,
                    "auto_deploy": stage.auto_deploy
                }
                for stage in stages
            ],
            "pipelines": [
                {
                    "id": rp.id,
                    "release_id": rp.release_id,
                    "pipeline_id": rp.pipeline_id,
                    "pipeline": {
                        "id": rp.pipeline.id,
                        "name": rp.pipeline.name
                    } if rp.pipeline else None,
                    "order_index": rp.order_index,
                    "execution_mode": rp.execution_mode,
                    "depends_on": rp.depends_on,
                    "position_x": rp.position_x,
                    "position_y": rp.position_y,
                    "created_at": rp.created_at.isoformat()
                }
                for rp in release_pipelines
            ],
            "latest_execution": {
                "id": latest_execution.id,
                "release_number": latest_execution.release_number,
                "status": latest_execution.status,
                "started_at": latest_execution.started_at.isoformat() if latest_execution.started_at else None,
                "completed_at": latest_execution.completed_at.isoformat() if latest_execution.completed_at else None
            } if latest_execution else None
        })

    return result

@router.post("/releases", status_code=201, tags=["🌐 UI - Releases"])
def create_release(
    release: ReleaseCreate,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("releases", "create")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Create a new release definition with stages and/or pipelines"""
    require_customer_access(release.customer_id, allowed)
    db_release = models.Release(
        name=release.name,
        description=release.description,
        pipeline_id=release.pipeline_id,
        version=release.version,
        customer_id=release.customer_id,
        status="active"
    )
    db.add(db_release)
    db.flush()

    # Create stages (for backward compatibility)
    for stage_data in release.stages:
        db_stage = models.ReleaseStage(
            release_id=db_release.id,
            environment_id=stage_data.environment_id,
            order_index=stage_data.order_index,
            pipeline_id=stage_data.pipeline_id,
            pre_deployment_approval=stage_data.pre_deployment_approval,
            post_deployment_approval=stage_data.post_deployment_approval,
            auto_deploy=stage_data.auto_deploy
        )
        db.add(db_stage)

    # Create release pipelines (new pipeline-based approach)
    # Step 1: insert all rows without depends_on to get real IDs first
    rp_objects = []
    for pipeline_data in release.pipelines:
        db_release_pipeline = models.ReleasePipeline(
            release_id=db_release.id,
            pipeline_id=pipeline_data.pipeline_id,
            order_index=pipeline_data.order_index,
            execution_mode=pipeline_data.execution_mode,
            depends_on=None,  # set after flush
            position_x=pipeline_data.position_x,
            position_y=pipeline_data.position_y
        )
        db.add(db_release_pipeline)
        rp_objects.append((db_release_pipeline, pipeline_data.depends_on))

    # Step 2: flush so every row gets its auto-generated release_pipeline.id
    db.flush()

    # Step 3: build pipeline_id → release_pipeline.id map for this release
    pid_to_rpid = {rp_obj.pipeline_id: rp_obj.id for rp_obj, _ in rp_objects}

    # Step 4: wire up depends_on using the real release_pipeline.id
    for rp_obj, dep_pipeline_id in rp_objects:
        if dep_pipeline_id is not None:
            rp_obj.depends_on = pid_to_rpid.get(dep_pipeline_id)

    db.commit()
    db.refresh(db_release)

    return {"id": db_release.id, "message": "Release created successfully"}

@router.get("/releases/{release_id}", tags=["🌐 UI - Releases"])
def get_release(
    release_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("releases", "read")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Get release details with stages and environments"""
    release = db.query(models.Release).filter(models.Release.id == release_id).first()
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")
    require_customer_access(release.customer_id, allowed)

    # Get stages with environment details
    stages = db.query(models.ReleaseStage)\
        .filter(models.ReleaseStage.release_id == release_id)\
        .order_by(models.ReleaseStage.order_index)\
        .all()

    stages_data = []
    for stage in stages:
        environment = db.query(models.Environment).filter(models.Environment.id == stage.environment_id).first()
        pipeline = None
        if stage.pipeline_id:
            pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == stage.pipeline_id).first()

        stages_data.append({
            "id": stage.id,
            "environment": {
                "id": environment.id,
                "name": environment.name,
                "requires_approval": environment.requires_approval
            },
            "order_index": stage.order_index,
            "pipeline": {
                "id": pipeline.id,
                "name": pipeline.name
            } if pipeline else None,
            "pre_deployment_approval": stage.pre_deployment_approval,
            "post_deployment_approval": stage.post_deployment_approval,
            "auto_deploy": stage.auto_deploy
        })

    return {
        "id": release.id,
        "name": release.name,
        "description": release.description,
        "pipeline_id": release.pipeline_id,
        "version": release.version,
        "status": release.status,
        "created_by": release.created_by,
        "created_at": release.created_at.isoformat(),
        "stages": stages_data
    }

@router.put("/releases/{release_id}", tags=["🌐 UI - Releases"])
def update_release(
    release_id: int,
    release: ReleaseUpdate,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("releases", "update")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Update a release"""
    db_release = db.query(models.Release).filter(models.Release.id == release_id).first()
    if not db_release:
        raise HTTPException(status_code=404, detail="Release not found")
    require_customer_access(db_release.customer_id, allowed)

    if release.name is not None:
        db_release.name = release.name
    if release.description is not None:
        db_release.description = release.description
    if release.status is not None:
        db_release.status = release.status
    if release.version is not None:
        db_release.version = release.version

    # Replace pipelines if provided
    if release.pipelines is not None:
        db.query(models.ReleasePipeline).filter(models.ReleasePipeline.release_id == release_id).delete()
        db.flush()
        rp_objects = []
        for pipeline_data in release.pipelines:
            db_rp = models.ReleasePipeline(
                release_id=release_id,
                pipeline_id=pipeline_data.pipeline_id,
                order_index=pipeline_data.order_index,
                execution_mode=pipeline_data.execution_mode,
                depends_on=None,
                position_x=pipeline_data.position_x,
                position_y=pipeline_data.position_y
            )
            db.add(db_rp)
            rp_objects.append((db_rp, pipeline_data.depends_on))
        db.flush()
        pid_to_rpid = {rp_obj.pipeline_id: rp_obj.id for rp_obj, _ in rp_objects}
        for rp_obj, dep_pipeline_id in rp_objects:
            if dep_pipeline_id is not None:
                rp_obj.depends_on = pid_to_rpid.get(dep_pipeline_id)

    # Replace stages if provided
    if release.stages is not None:
        db.query(models.ReleaseStage).filter(models.ReleaseStage.release_id == release_id).delete()
        db.flush()
        for stage_data in release.stages:
            db.add(models.ReleaseStage(
                release_id=release_id,
                environment_id=stage_data.environment_id,
                order_index=stage_data.order_index,
                pipeline_id=stage_data.pipeline_id,
                pre_deployment_approval=stage_data.pre_deployment_approval,
                post_deployment_approval=stage_data.post_deployment_approval,
                auto_deploy=stage_data.auto_deploy
            ))

    db.commit()

    return {"success": True, "message": "Release updated successfully"}

@router.delete("/releases/{release_id}", tags=["🌐 UI - Releases"])
def delete_release(
    release_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("releases", "delete")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Delete a release"""
    db_release = db.query(models.Release).filter(models.Release.id == release_id).first()
    if not db_release:
        raise HTTPException(status_code=404, detail="Release not found")
    require_customer_access(db_release.customer_id, allowed)

    db.delete(db_release)
    db.commit()

    return {"success": True, "message": "Release deleted successfully"}

def deploy_release_pipelines(release_id: int, release, release_pipelines, request: DeployReleaseRequest, db: Session):
    """Deploy a release using the pipeline-based approach"""
    if not request.agent_id:
        raise HTTPException(status_code=400, detail="Agent ID is required for pipeline-based releases")

    agent = db.query(models.Agent).filter(models.Agent.id == request.agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Generate release number
    execution_count = db.query(models.ReleaseExecution)\
        .filter(models.ReleaseExecution.release_id == release_id)\
        .count()
    release_number = f"Release-{execution_count + 1}"

    # Create release execution
    release_execution = models.ReleaseExecution(
        release_id=release_id,
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
        pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == rp.pipeline_id).first()
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
                db.add(models.PipelineExecutionParameter(
                    pipeline_execution_id=pe.id,
                    parameter_name=param_name,
                    parameter_value=str(param_value)
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

@router.post("/releases/{release_id}/deploy", tags=["🌐 UI - Release Execution"])
def deploy_release(
    release_id: int,
    request: DeployReleaseRequest,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("releases", "deploy")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Trigger a release deployment - supports both stage-based and pipeline-based releases"""
    release = db.query(models.Release).filter(models.Release.id == release_id).first()
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")
    require_customer_access(release.customer_id, allowed)

    # Check if this is a pipeline-based release
    release_pipelines = db.query(models.ReleasePipeline)\
        .filter(models.ReleasePipeline.release_id == release_id)\
        .order_by(models.ReleasePipeline.order_index)\
        .all()

    # If pipelines exist, use pipeline-based deployment
    if release_pipelines:
        return deploy_release_pipelines(release_id, release, release_pipelines, request, db)

    # Otherwise, use legacy stage-based deployment
    # Get all stages for this release
    stages = db.query(models.ReleaseStage)\
        .filter(models.ReleaseStage.release_id == release_id)\
        .order_by(models.ReleaseStage.order_index)\
        .all()

    if not stages:
        raise HTTPException(status_code=400, detail="Release has no stages or pipelines configured")

    # Generate release number
    execution_count = db.query(models.ReleaseExecution)\
        .filter(models.ReleaseExecution.release_id == release_id)\
        .count()
    release_number = f"Release-{execution_count + 1}"

    # Create release execution
    release_execution = models.ReleaseExecution(
        release_id=release_id,
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
        agent = db.query(models.Agent).filter(models.Agent.id == request.agent_id).first()
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

    # Create stage executions and pickup entries
    for stage in stages:
        environment = db.query(models.Environment).filter(models.Environment.id == stage.environment_id).first()

        # Determine which agent to use (stage-specific or release-level)
        stage_agent = None
        if stage.agent_id:
            stage_agent = db.query(models.Agent).filter(models.Agent.id == stage.agent_id).first()
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

@router.get("/releases/{release_id}/executions", tags=["🌐 UI - Releases"])
def get_release_executions(
    release_id: int,
    limit: int = 10,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("releases", "read")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Get execution history for a release"""
    release = db.query(models.Release).filter(models.Release.id == release_id).first()
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")
    require_customer_access(release.customer_id, allowed)

    executions = db.query(models.ReleaseExecution)\
        .filter(models.ReleaseExecution.release_id == release_id)\
        .order_by(models.ReleaseExecution.created_at.desc())\
        .limit(limit)\
        .all()

    result = []
    for execution in executions:
        # Get stage executions
        stage_executions = db.query(models.StageExecution)\
            .filter(models.StageExecution.release_execution_id == execution.id)\
            .order_by(models.StageExecution.created_at)\
            .all()

        # Get parameters
        parameters = db.query(models.ReleaseExecutionParameter)\
            .filter(models.ReleaseExecutionParameter.release_execution_id == execution.id)\
            .all()

        result.append({
            "id": execution.id,
            "release_number": execution.release_number,
            "triggered_by": execution.triggered_by,
            "status": execution.status,
            "artifact_version": execution.artifact_version,
            "started_at": execution.started_at.isoformat() if execution.started_at else None,
            "completed_at": execution.completed_at.isoformat() if execution.completed_at else None,
            "duration_seconds": execution.duration_seconds,
            "parameters": {p.parameter_name: p.parameter_value for p in parameters},
            "stages": [
                {
                    "id": stage.id,
                    "environment_name": stage.environment_name,
                    "status": stage.status,
                    "approval_status": stage.approval_status,
                    "approved_by": stage.approved_by,
                    "started_at": stage.started_at.isoformat() if stage.started_at else None,
                    "completed_at": stage.completed_at.isoformat() if stage.completed_at else None
                }
                for stage in stage_executions
            ]
        })

    return result

def _require_release_execution_access(release_execution, db: Session, allowed: Optional[List[int]]) -> None:
    """Resolve a release_execution's parent release and check customer access."""
    if allowed is None:
        return
    release = db.query(models.Release).filter(models.Release.id == release_execution.release_id).first()
    require_customer_access(release.customer_id if release else None, allowed)


@router.get("/release-executions/{execution_id}", tags=["🌐 UI - Releases"])
def get_release_execution(
    execution_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("releases", "read")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Get a single release execution by ID"""
    execution = db.query(models.ReleaseExecution).filter(models.ReleaseExecution.id == execution_id).first()
    if not execution:
        raise HTTPException(status_code=404, detail="Release execution not found")
    _require_release_execution_access(execution, db, allowed)

    # Get stage executions
    stage_executions = db.query(models.StageExecution)\
        .filter(models.StageExecution.release_execution_id == execution.id)\
        .order_by(models.StageExecution.created_at)\
        .all()

    # Get parameters
    parameters = db.query(models.ReleaseExecutionParameter)\
        .filter(models.ReleaseExecutionParameter.release_execution_id == execution.id)\
        .all()

    return {
        "id": execution.id,
        "release_id": execution.release_id,
        "release_number": execution.release_number,
        "triggered_by": execution.triggered_by,
        "status": execution.status,
        "artifact_version": execution.artifact_version,
        "started_at": execution.started_at.isoformat() if execution.started_at else None,
        "completed_at": execution.completed_at.isoformat() if execution.completed_at else None,
        "duration_seconds": execution.duration_seconds,
        "parameters": {p.parameter_name: p.parameter_value for p in parameters},
        "stages": [
            {
                "id": stage.id,
                "environment_name": stage.environment_name,
                "status": stage.status,
                "approval_status": stage.approval_status,
                "approved_by": stage.approved_by,
                "started_at": stage.started_at.isoformat() if stage.started_at else None,
                "completed_at": stage.completed_at.isoformat() if stage.completed_at else None
            }
            for stage in stage_executions
        ]
    }

@router.get("/release-executions/{execution_id}/pipeline-executions", tags=["🌐 UI - Releases"])
def get_release_pipeline_executions(
    execution_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("releases", "read")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Get list of pipeline executions for a release execution"""
    # First, verify the release execution exists
    release_execution = db.query(models.ReleaseExecution).filter(models.ReleaseExecution.id == execution_id).first()
    if not release_execution:
        raise HTTPException(status_code=404, detail="Release execution not found")
    _require_release_execution_access(release_execution, db, allowed)

    # Get all pipeline executions that were created as part of this release
    time_window_start = release_execution.started_at
    time_window_end = release_execution.completed_at if release_execution.completed_at else datetime.now()

    pipeline_executions = db.query(models.PipelineExecution)\
        .filter(models.PipelineExecution.triggered_by == release_execution.triggered_by)\
        .filter(models.PipelineExecution.started_at >= time_window_start)\
        .filter(models.PipelineExecution.started_at <= time_window_end)\
        .order_by(models.PipelineExecution.started_at)\
        .all()

    # Build response with pipeline information
    result = []
    for pipe_exec in pipeline_executions:
        # Get pipeline name
        pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipe_exec.pipeline_id).first()
        pipeline_name = pipeline.name if pipeline else f"Pipeline {pipe_exec.pipeline_id}"

        # Calculate duration if completed
        duration = None
        if pipe_exec.completed_at and pipe_exec.started_at:
            duration = int((pipe_exec.completed_at - pipe_exec.started_at).total_seconds())

        result.append({
            "id": pipe_exec.id,
            "pipeline_id": pipe_exec.pipeline_id,
            "pipeline_name": pipeline_name,
            "status": pipe_exec.status,
            "started_at": pipe_exec.started_at.isoformat(),
            "completed_at": pipe_exec.completed_at.isoformat() if pipe_exec.completed_at else None,
            "duration": duration
        })

    return result

@router.get("/release-executions/{execution_id}/logs", tags=["🌐 UI - Releases"])
def get_release_execution_logs(
    execution_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("releases", "read")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Get all pipeline execution logs for a release execution"""
    # First, verify the release execution exists
    release_execution = db.query(models.ReleaseExecution).filter(models.ReleaseExecution.id == execution_id).first()
    if not release_execution:
        raise HTTPException(status_code=404, detail="Release execution not found")
    _require_release_execution_access(release_execution, db, allowed)

    # Get all pipeline executions created for this release
    # We need to find pipeline executions that were created as part of this release deployment
    # For now, we'll get pipeline executions based on the triggered_by and timestamp

    # Get all pipeline executions that match the release execution's triggered_by and were started around the same time
    time_window_start = release_execution.started_at
    time_window_end = release_execution.completed_at if release_execution.completed_at else datetime.now()

    pipeline_executions = db.query(models.PipelineExecution)\
        .filter(models.PipelineExecution.triggered_by == release_execution.triggered_by)\
        .filter(models.PipelineExecution.started_at >= time_window_start)\
        .filter(models.PipelineExecution.started_at <= time_window_end)\
        .all()

    # Collect all logs from all pipeline executions
    all_logs = []
    for pipe_exec in pipeline_executions:
        logs = db.query(models.PipelineExecutionLog)\
            .filter(models.PipelineExecutionLog.pipeline_execution_id == pipe_exec.id)\
            .order_by(models.PipelineExecutionLog.timestamp)\
            .all()

        # Get pipeline name
        pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipe_exec.pipeline_id).first()
        pipeline_name = pipeline.name if pipeline else f"Pipeline {pipe_exec.pipeline_id}"

        for log in logs:
            all_logs.append({
                "id": log.id,
                "pipeline_execution_id": pipe_exec.id,
                "pipeline_name": pipeline_name,
                "timestamp": log.timestamp.isoformat(),
                "log_level": log.log_level,
                "message": log.message,
                "step_name": log.step_name,
                "step_index": log.step_index,
                "source": log.source
            })

    # Sort all logs by timestamp
    all_logs.sort(key=lambda x: x["timestamp"])

    return all_logs

@router.post("/release-executions/{execution_id}/update-status", tags=["🌐 UI - Releases"])
def update_release_execution_status(
    execution_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("releases", "read")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Manually update release execution status based on pipeline completions"""
    release_execution = db.query(models.ReleaseExecution).filter(models.ReleaseExecution.id == execution_id).first()
    if not release_execution:
        raise HTTPException(status_code=404, detail="Release execution not found")
    _require_release_execution_access(release_execution, db, allowed)

    # Get all pipeline executions for this release
    time_window_start = release_execution.started_at
    time_window_end = release_execution.completed_at if release_execution.completed_at else datetime.now() + timedelta(hours=1)

    pipeline_executions = db.query(models.PipelineExecution)\
        .filter(models.PipelineExecution.triggered_by == release_execution.triggered_by)\
        .filter(models.PipelineExecution.started_at >= time_window_start)\
        .filter(models.PipelineExecution.started_at <= time_window_end)\
        .all()

    # Get the release to see how many pipelines it should have
    release = db.query(models.Release).filter(models.Release.id == release_execution.release_id).first()
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")

    release_pipelines = db.query(models.ReleasePipeline)\
        .filter(models.ReleasePipeline.release_id == release.id)\
        .all()

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

@router.post("/release-executions/{execution_id}/abort", tags=["🌐 UI - Release Execution"])
def abort_release_execution(
    execution_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("releases", "deploy")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Abort an in-progress release execution.
    - Cancels all running pipeline pickups (agent detects cancellation via pickup status poll)
    - Cancels all pending pipeline executions so they never start
    - Marks the release execution as cancelled
    """
    release_execution = db.query(models.ReleaseExecution)\
        .filter(models.ReleaseExecution.id == execution_id).first()
    if not release_execution:
        raise HTTPException(status_code=404, detail="Release execution not found")
    _require_release_execution_access(release_execution, db, allowed)
    if release_execution.status != "in_progress":
        raise HTTPException(status_code=400, detail=f"Release execution is already '{release_execution.status}', cannot abort")

    # Get every pipeline execution that belongs to this release run
    all_pe = db.query(models.PipelineExecution)\
        .filter(models.PipelineExecution.release_execution_id == execution_id)\
        .all()

    now = datetime.now()
    for pe in all_pe:
        if pe.status in ("running", "pending"):
            # Cancel the pickup so the agent stops picking it up
            active_pickup = db.query(models.PipelinePickup)\
                .filter(models.PipelinePickup.pipeline_execution_id == pe.id)\
                .filter(models.PipelinePickup.status.in_(["pending", "picked_up", "in_progress"]))\
                .first()
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


@router.post("/stage-executions/{stage_execution_id}/approve", tags=["🌐 UI - Release Execution"])
def approve_stage(
    stage_execution_id: int,
    request: ApprovalRequest,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("releases", "deploy")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Approve a stage execution"""
    stage_execution = db.query(models.StageExecution)\
        .filter(models.StageExecution.id == stage_execution_id)\
        .first()

    if not stage_execution:
        raise HTTPException(status_code=404, detail="Stage execution not found")
    if allowed is not None:
        release_execution = db.query(models.ReleaseExecution)\
            .filter(models.ReleaseExecution.id == stage_execution.release_execution_id).first()
        if release_execution:
            _require_release_execution_access(release_execution, db, allowed)

    if stage_execution.approval_status != "pending":
        raise HTTPException(status_code=400, detail="Stage is not pending approval")

    stage_execution.approval_status = "approved"
    stage_execution.approved_by = request.approved_by
    stage_execution.approved_at = datetime.now()
    stage_execution.approval_comments = request.comments
    stage_execution.status = "pending"  # Ready to run

    # Create pickup entry if agent is assigned
    if stage_execution.agent_id:
        # Get agent details
        agent = db.query(models.Agent).filter(models.Agent.id == stage_execution.agent_id).first()
        if agent:
            # Get release stage for priority
            release_stage = db.query(models.ReleaseStage)\
                .filter(models.ReleaseStage.id == stage_execution.release_stage_id)\
                .first()

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

@router.post("/stage-executions/{stage_execution_id}/reject")
def reject_stage(
    stage_execution_id: int,
    request: ApprovalRequest,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("releases", "deploy")),
    allowed: Optional[List[int]] = Depends(get_allowed_customer_ids),
):
    """Reject a stage execution"""
    stage_execution = db.query(models.StageExecution)\
        .filter(models.StageExecution.id == stage_execution_id)\
        .first()

    if not stage_execution:
        raise HTTPException(status_code=404, detail="Stage execution not found")
    if allowed is not None:
        release_execution = db.query(models.ReleaseExecution)\
            .filter(models.ReleaseExecution.id == stage_execution.release_execution_id).first()
        if release_execution:
            _require_release_execution_access(release_execution, db, allowed)

    if stage_execution.approval_status != "pending":
        raise HTTPException(status_code=400, detail="Stage is not pending approval")

    stage_execution.approval_status = "rejected"
    stage_execution.approved_by = request.approved_by
    stage_execution.approved_at = datetime.now()
    stage_execution.approval_comments = request.comments
    stage_execution.status = "cancelled"

    # Update release execution status
    release_execution = db.query(models.ReleaseExecution)\
        .filter(models.ReleaseExecution.id == stage_execution.release_execution_id)\
        .first()
    if release_execution:
        release_execution.status = "failed"
        release_execution.completed_at = datetime.now()

    db.commit()

    return {"success": True, "message": "Stage rejected"}

# ==============================================
# EXECUTION LOGS ENDPOINTS
# ==============================================

@router.get("/pipeline-executions/{execution_id}/logs", tags=["🌐 UI - Pipeline Execution"])
def get_pipeline_execution_logs(
    execution_id: int,
    log_level: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get logs for a pipeline execution"""
    execution = db.query(models.PipelineExecution)\
        .filter(models.PipelineExecution.id == execution_id)\
        .first()

    if not execution:
        raise HTTPException(status_code=404, detail="Pipeline execution not found")

    query = db.query(models.PipelineExecutionLog)\
        .filter(models.PipelineExecutionLog.pipeline_execution_id == execution_id)

    if log_level:
        query = query.filter(models.PipelineExecutionLog.log_level == log_level)

    logs = query.order_by(models.PipelineExecutionLog.timestamp.asc()).limit(limit).all()

    return [
        {
            "id": log.id,
            "log_level": log.log_level,
            "message": log.message,
            "timestamp": log.timestamp.isoformat(),
            "step_name": log.step_name,
            "step_index": log.step_index,
            "source": log.source
        }
        for log in logs
    ]

@router.post("/pipeline-executions/{execution_id}/logs", tags=["🌐 UI - Pipeline Execution"])
def add_pipeline_execution_log(
    execution_id: int,
    log_data: dict,
    db: Session = Depends(get_db)
):
    """Add a log entry to a pipeline execution"""
    execution = db.query(models.PipelineExecution)\
        .filter(models.PipelineExecution.id == execution_id)\
        .first()

    if not execution:
        raise HTTPException(status_code=404, detail="Pipeline execution not found")

    log_entry = models.PipelineExecutionLog(
        pipeline_execution_id=execution_id,
        log_level=log_data.get("log_level", "info"),
        message=log_data.get("message"),
        step_name=log_data.get("step_name"),
        step_index=log_data.get("step_index"),
        source=log_data.get("source", "system")
    )

    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)

    return {"success": True, "log_id": log_entry.id}

@router.get("/stage-executions/{execution_id}/logs", tags=["🌐 UI - Release Execution"])
def get_stage_execution_logs(
    execution_id: int,
    log_level: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get logs for a stage execution"""
    execution = db.query(models.StageExecution)\
        .filter(models.StageExecution.id == execution_id)\
        .first()

    if not execution:
        raise HTTPException(status_code=404, detail="Stage execution not found")

    query = db.query(models.StageExecutionLog)\
        .filter(models.StageExecutionLog.stage_execution_id == execution_id)

    if log_level:
        query = query.filter(models.StageExecutionLog.log_level == log_level)

    logs = query.order_by(models.StageExecutionLog.timestamp.asc()).limit(limit).all()

    return [
        {
            "id": log.id,
            "log_level": log.log_level,
            "message": log.message,
            "timestamp": log.timestamp.isoformat(),
            "task_name": log.task_name,
            "source": log.source
        }
        for log in logs
    ]

@router.post("/stage-executions/{execution_id}/logs", tags=["🌐 UI - Release Execution"])
def add_stage_execution_log(
    execution_id: int,
    log_data: dict,
    db: Session = Depends(get_db)
):
    """Add a log entry to a stage execution"""
    execution = db.query(models.StageExecution)\
        .filter(models.StageExecution.id == execution_id)\
        .first()

    if not execution:
        raise HTTPException(status_code=404, detail="Stage execution not found")

    log_entry = models.StageExecutionLog(
        stage_execution_id=execution_id,
        log_level=log_data.get("log_level", "info"),
        message=log_data.get("message"),
        task_name=log_data.get("task_name"),
        source=log_data.get("source", "system")
    )

    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)

    return {"success": True, "log_id": log_entry.id}


# ==============================================
# RELEASE PICKUP ENDPOINTS (Agent Communication)
# ==============================================

@router.get("/releases/pickup/pending", tags=["🤖 Agent - Release Execution"])
def get_pending_releases(agent_uuid: str = Depends(get_agent_uuid), db: Session = Depends(get_db)):
    """Get pending release pickups for a specific agent"""
    # Verify agent exists
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Get pending pickups for this agent
    pickups = db.query(models.ReleasePickup)\
        .filter(
            models.ReleasePickup.agent_uuid == agent_uuid,
            models.ReleasePickup.status.in_(["pending", "picked_up"])
        )\
        .order_by(models.ReleasePickup.priority, models.ReleasePickup.created_at)\
        .all()

    result = []
    for pickup in pickups:
        # Get stage execution details
        stage_execution = db.query(models.StageExecution)\
            .filter(models.StageExecution.id == pickup.stage_execution_id)\
            .first()

        # Get release execution details
        release_execution = db.query(models.ReleaseExecution)\
            .filter(models.ReleaseExecution.id == pickup.release_execution_id)\
            .first()

        # Get release details
        release = db.query(models.Release)\
            .filter(models.Release.id == release_execution.release_id)\
            .first()

        # Get stage details
        stage = db.query(models.ReleaseStage)\
            .filter(models.ReleaseStage.id == stage_execution.release_stage_id)\
            .first()

        # Get environment details
        environment = db.query(models.Environment)\
            .filter(models.Environment.id == stage_execution.environment_id)\
            .first()

        # Get pipeline if exists
        pipeline = None
        pipeline_steps = []
        if stage.pipeline_id:
            pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == stage.pipeline_id).first()

            # Get pipeline steps
            if pipeline:
                steps = db.query(models.PipelineStep)\
                    .filter(models.PipelineStep.pipeline_id == pipeline.id)\
                    .order_by(models.PipelineStep.step_order)\
                    .all()

                for step in steps:
                    pipeline_steps.append({
                        "name": step.name,
                        "type": "bash",  # Default type since PipelineStep doesn't have type
                        "script_content": step.command,
                        "configuration": {},
                        "order_index": step.step_order
                    })

        # Get parameters
        parameters = db.query(models.ReleaseExecutionParameter)\
            .filter(models.ReleaseExecutionParameter.release_execution_id == release_execution.id)\
            .all()

        result.append({
            "pickup_id": pickup.id,
            "release_execution_id": release_execution.id,
            "stage_execution_id": stage_execution.id,
            "release_name": release.name,
            "release_number": release_execution.release_number,
            "environment_name": environment.name if environment else "Unknown",
            "pipeline_id": pipeline.id if pipeline else None,
            "pipeline_name": pipeline.name if pipeline else None,
            "steps": pipeline_steps,
            "status": pickup.status,
            "priority": pickup.priority,
            "created_at": pickup.created_at.isoformat(),
            "parameters": {p.parameter_name: p.parameter_value for p in parameters}
        })

    return result

@router.post("/releases/pickup/{pickup_id}/acknowledge", tags=["🤖 Agent - Release Execution"])
def acknowledge_release_pickup(pickup_id: int, db: Session = Depends(get_db)):
    """Agent acknowledges pickup of a release"""
    pickup = db.query(models.ReleasePickup).filter(models.ReleasePickup.id == pickup_id).first()

    if not pickup:
        raise HTTPException(status_code=404, detail="Pickup not found")

    pickup.status = "picked_up"
    pickup.picked_up_at = datetime.now()

    # Update stage execution status
    stage_execution = db.query(models.StageExecution)\
        .filter(models.StageExecution.id == pickup.stage_execution_id)\
        .first()

    if stage_execution:
        stage_execution.status = "in_progress"
        stage_execution.started_at = datetime.now()

    db.commit()

    return {"success": True, "message": "Release pickup acknowledged"}

@router.post("/releases/pickup/{pickup_id}/start", tags=["🤖 Agent - Release Execution"])
def start_release_execution(pickup_id: int, db: Session = Depends(get_db)):
    """Agent starts executing the release"""
    pickup = db.query(models.ReleasePickup).filter(models.ReleasePickup.id == pickup_id).first()

    if not pickup:
        raise HTTPException(status_code=404, detail="Pickup not found")

    pickup.status = "in_progress"
    pickup.started_at = datetime.now()
    db.commit()

    return {"success": True, "message": "Release execution started"}

@router.post("/releases/pickup/{pickup_id}/complete", tags=["🤖 Agent - Release Execution"])
def complete_release_pickup(pickup_id: int, completion_data: dict, db: Session = Depends(get_db)):
    """Agent completes release execution"""
    pickup = db.query(models.ReleasePickup).filter(models.ReleasePickup.id == pickup_id).first()

    if not pickup:
        raise HTTPException(status_code=404, detail="Pickup not found")

    success = completion_data.get("success", False)
    error_message = completion_data.get("error_message")

    pickup.status = "completed" if success else "failed"
    pickup.completed_at = datetime.now()
    if error_message:
        pickup.error_message = error_message

    # Update stage execution
    stage_execution = db.query(models.StageExecution)\
        .filter(models.StageExecution.id == pickup.stage_execution_id)\
        .first()

    if stage_execution:
        stage_execution.status = "succeeded" if success else "failed"
        stage_execution.completed_at = datetime.now()

        # Calculate duration
        if stage_execution.started_at:
            duration = stage_execution.completed_at - stage_execution.started_at
            stage_execution.duration_seconds = int(duration.total_seconds())

    # Check if all stages are complete to update release execution
    release_execution = db.query(models.ReleaseExecution)\
        .filter(models.ReleaseExecution.id == pickup.release_execution_id)\
        .first()

    if release_execution:
        all_stages = db.query(models.StageExecution)\
            .filter(models.StageExecution.release_execution_id == release_execution.id)\
            .all()

        all_completed = all(s.status in ["succeeded", "failed", "cancelled", "skipped"] for s in all_stages)
        any_failed = any(s.status == "failed" for s in all_stages)

        if all_completed:
            release_execution.status = "failed" if any_failed else "succeeded"
            release_execution.completed_at = datetime.now()

            # Calculate duration
            if release_execution.started_at:
                duration = release_execution.completed_at - release_execution.started_at
                release_execution.duration_seconds = int(duration.total_seconds())

    db.commit()

    return {"success": True, "message": "Release pickup completed"}

@router.post("/releases/pickup/{pickup_id}/log", tags=["🤖 Agent - Release Execution"])
def add_release_pickup_log(pickup_id: int, log_data: dict, db: Session = Depends(get_db)):
    """Agent sends log entry for release execution"""
    pickup = db.query(models.ReleasePickup).filter(models.ReleasePickup.id == pickup_id).first()

    if not pickup:
        raise HTTPException(status_code=404, detail="Pickup not found")

    # Create log entry
    log_entry = models.StageExecutionLog(
        stage_execution_id=pickup.stage_execution_id,
        log_level=log_data.get("log_level", "info"),
        message=log_data.get("message"),
        task_name=log_data.get("task_name"),
        source="agent"
    )

    db.add(log_entry)
    db.commit()

    return {"success": True, "log_id": log_entry.id}
