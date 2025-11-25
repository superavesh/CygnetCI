# main.py - Complete FastAPI Implementation with Database
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from enum import Enum
from sqlalchemy.orm import Session
import uvicorn

# Import database and models
from database import get_db, engine
import models

# Create tables
models.Base.metadata.create_all(bind=engine)

# ==============================================
# ENUMS
# ==============================================

class AgentStatus(str, Enum):
    online = "online"
    offline = "offline"
    busy = "busy"

class PipelineStatus(str, Enum):
    success = "success"
    failed = "failed"
    running = "running"
    pending = "pending"

class TaskStatus(str, Enum):
    completed = "completed"
    running = "running"
    queued = "queued"
    failed = "failed"

class ServiceType(str, Enum):
    website = "website"
    database = "database"
    api = "api"
    service = "service"

class ServiceStatus(str, Enum):
    healthy = "healthy"
    warning = "warning"
    critical = "critical"
    down = "down"
    unknown = "unknown"

class ServiceCategory(str, Enum):
    todo = "todo"
    monitoring = "monitoring"
    issues = "issues"
    healthy = "healthy"

class LogLevel(str, Enum):
    info = "info"
    success = "success"
    warning = "warning"
    error = "error"

# ==============================================
# PYDANTIC MODELS
# ==============================================

class ResourceDataPoint(BaseModel):
    time: str
    cpu: int
    memory: int
    disk: int

class AgentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    uuid: str
    location: str

class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None

class Agent(BaseModel):
    id: int
    name: str
    status: str
    lastSeen: str
    jobs: int
    location: str
    cpu: int
    memory: int
    resourceData: List[ResourceDataPoint] = []

    class Config:
        from_attributes = True

class PipelineCreate(BaseModel):
    name: str
    branch: str
    description: Optional[str] = None

class PipelineUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[PipelineStatus] = None
    branch: Optional[str] = None

class Pipeline(BaseModel):
    id: int
    name: str
    status: str
    lastRun: str
    duration: str
    branch: str
    commit: str

    class Config:
        from_attributes = True

class Task(BaseModel):
    id: int
    name: str
    pipeline: str
    agent: str
    status: str
    startTime: str
    duration: str

    class Config:
        from_attributes = True

class ServiceCreate(BaseModel):
    name: str
    type: ServiceType
    url: str
    category: ServiceCategory = ServiceCategory.todo

class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[ServiceStatus] = None
    category: Optional[ServiceCategory] = None

class Service(BaseModel):
    id: str
    name: str
    type: str
    status: str
    lastCheck: str
    response: str
    uptime: str
    url: str

    class Config:
        from_attributes = True

class ServiceCategoryData(BaseModel):
    title: str
    services: List[Service]

class Services(BaseModel):
    categories: Dict[str, ServiceCategoryData]

class StatValue(BaseModel):
    value: str
    trend: float

class Stats(BaseModel):
    activeAgents: StatValue
    runningPipelines: StatValue
    successRate: StatValue
    avgDeployTime: StatValue

class DashboardData(BaseModel):
    agents: List[Agent]
    pipelines: List[Pipeline]
    tasks: List[Task]
    stats: Stats
    services: Services

# ==================== UPDATED PYDANTIC MODELS ====================

class PipelineStepData(BaseModel):
    name: str
    command: str
    order: int

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
    steps: List[PipelineStepData] = []
    parameters: List[PipelineParameterData] = []

class PipelineUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    branch: Optional[str] = None
    agentId: Optional[int] = None
    steps: Optional[List[PipelineStepData]] = None
    parameters: Optional[List[PipelineParameterData]] = None

# ==============================================
# HELPER FUNCTIONS
# ==============================================

def relative_time(timestamp):
    """Convert timestamp to relative time string"""
    if not timestamp:
        return "never"
    
    now = datetime.now()
    diff = now - timestamp
    
    seconds = diff.total_seconds()
    
    if seconds < 60:
        return "just now"
    elif seconds < 3600:
        minutes = int(seconds / 60)
        return f"{minutes} minute{'s' if minutes > 1 else ''} ago"
    elif seconds < 86400:
        hours = int(seconds / 3600)
        return f"{hours} hour{'s' if hours > 1 else ''} ago"
    else:
        days = int(seconds / 86400)
        return f"{days} day{'s' if days > 1 else ''} ago"

def format_agent(agent):
    """Format agent for API response"""
    return {
        "id": agent.id,
        "name": agent.name,
        "status": agent.status,
        "lastSeen": relative_time(agent.last_seen),
        "jobs": agent.jobs,
        "location": agent.location,
        "cpu": agent.cpu,
        "memory": agent.memory,
        "resourceData": []
    }

def format_pipeline(pipeline):
    """Format pipeline for API response"""
    return {
        "id": pipeline.id,
        "name": pipeline.name,
        "status": pipeline.status,
        "lastRun": relative_time(pipeline.last_run),
        "duration": pipeline.duration or "-",
        "branch": pipeline.branch,
        "commit": pipeline.commit or "N/A"
    }

def format_task(task):
    """Format task for API response"""
    return {
        "id": task.id,
        "name": task.name,
        "pipeline": task.pipeline_name or "N/A",
        "agent": task.agent_name or "N/A",
        "status": task.status,
        "startTime": task.start_time.strftime("%I:%M %p") if task.start_time else "-",
        "duration": task.duration or "-"
    }

def format_service(service):
    """Format service for API response"""
    return {
        "id": service.id,
        "name": service.name,
        "type": service.type,
        "status": service.status,
        "lastCheck": relative_time(service.last_check),
        "response": service.response_time or "-",
        "uptime": f"{service.uptime}%" if service.uptime else "-",
        "url": service.url
    }


def format_pipeline_full(pipeline, db: Session):
    """Format pipeline with steps and parameters"""
    
    # Get steps
    steps = db.query(models.PipelineStep)\
        .filter(models.PipelineStep.pipeline_id == pipeline.id)\
        .order_by(models.PipelineStep.step_order)\
        .all()
    
    # Get parameters
    parameters = db.query(models.PipelineParameter)\
        .filter(models.PipelineParameter.pipeline_id == pipeline.id)\
        .all()
    
    return {
        "id": pipeline.id,
        "name": pipeline.name,
        "status": pipeline.status,
        "lastRun": relative_time(pipeline.last_run),
        "duration": pipeline.duration or "-",
        "branch": pipeline.branch,
        "commit": pipeline.commit or "N/A",
        "agent_id": pipeline.agent_id,
        "steps": [
            {
                "name": step.name,
                "command": step.command,
                "order": step.step_order
            }
            for step in steps
        ],
        "parameters": [
            {
                "name": param.name,
                "type": param.type,
                "defaultValue": param.default_value,
                "required": param.required,
                "description": param.description,
                "choices": param.choices if param.choices else []
            }
            for param in parameters
        ]
    }
# ==============================================
# FASTAPI APP
# ==============================================

app = FastAPI(
    title="CygnetCI API",
    description="API for CygnetCI - CI/CD Management Platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================
# ENDPOINTS
# ==============================================

@app.get("/")
def root():
    return {
        "message": "CygnetCI API",
        "version": "1.0.0",
        "docs": "/docs"
    }

# ==================== DASHBOARD ====================

@app.get("/data")
def get_dashboard_data(db: Session = Depends(get_db)):
    """Get all dashboard data"""
    
    # Get agents
    agents = db.query(models.Agent).all()
    agents_data = [format_agent(agent) for agent in agents]
    
    # Get pipelines
    pipelines = db.query(models.Pipeline).order_by(models.Pipeline.last_run.desc()).all()
    pipelines_data = [format_pipeline(pipeline) for pipeline in pipelines]
    
    # Get tasks
    tasks = db.query(models.Task).order_by(models.Task.created_at.desc()).limit(10).all()
    tasks_data = [format_task(task) for task in tasks]
    
    # Calculate stats
    active_agents = db.query(models.Agent).filter(models.Agent.status == "online").count()
    running_pipelines = db.query(models.Pipeline).filter(models.Pipeline.status == "running").count()
    
    total_pipelines = db.query(models.Pipeline).count()
    successful_pipelines = db.query(models.Pipeline).filter(models.Pipeline.status == "success").count()
    success_rate = round((successful_pipelines / total_pipelines * 100) if total_pipelines > 0 else 0, 2)
    
    # Get services
    services = db.query(models.Service).all()
    services_by_category = {
        "todo": {"title": "To Monitor", "services": []},
        "monitoring": {"title": "Monitoring", "services": []},
        "issues": {"title": "Issues", "services": []},
        "healthy": {"title": "Healthy", "services": []}
    }
    
    for service in services:
        formatted_service = format_service(service)
        services_by_category[service.category]["services"].append(formatted_service)
    
    return {
        "agents": agents_data,
        "pipelines": pipelines_data,
        "tasks": tasks_data,
        "stats": {
            "activeAgents": {"value": str(active_agents), "trend": 12},
            "runningPipelines": {"value": str(running_pipelines), "trend": 8},
            "successRate": {"value": f"{success_rate}%", "trend": 3},
            "avgDeployTime": {"value": "2m 45s", "trend": -15}
        },
        "services": {
            "categories": services_by_category
        }
    }

# ==================== AGENTS ====================

@app.get("/agents")
def get_agents(db: Session = Depends(get_db)):
    """Get all agents"""
    agents = db.query(models.Agent).all()
    return [format_agent(agent) for agent in agents]

@app.post("/agents", status_code=201)
def create_agent(agent: AgentCreate, db: Session = Depends(get_db)):
    """Create a new agent"""
    
    # Check if UUID already exists
    existing = db.query(models.Agent).filter(models.Agent.uuid == agent.uuid).first()
    if existing:
        raise HTTPException(status_code=400, detail="Agent with this UUID already exists")
    
    # Create new agent
    db_agent = models.Agent(
        name=agent.name,
        uuid=agent.uuid,
        description=agent.description,
        location=agent.location,
        status="online",
        last_seen=datetime.now(),
        jobs=0,
        cpu=0,
        memory=0
    )
    
    db.add(db_agent)
    db.commit()
    db.refresh(db_agent)
    
    return format_agent(db_agent)

@app.get("/agents/{agent_id}")
def get_agent(agent_id: int, db: Session = Depends(get_db)):
    """Get agent by ID"""
    agent = db.query(models.Agent).filter(models.Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return format_agent(agent)

@app.put("/agents/{agent_id}")
def update_agent(agent_id: int, agent: AgentUpdate, db: Session = Depends(get_db)):
    """Update an existing agent"""
    db_agent = db.query(models.Agent).filter(models.Agent.id == agent_id).first()
    if not db_agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    if agent.name is not None:
        db_agent.name = agent.name
    if agent.description is not None:
        db_agent.description = agent.description
    if agent.location is not None:
        db_agent.location = agent.location
    
    db.commit()
    db.refresh(db_agent)
    
    return format_agent(db_agent)

@app.delete("/agents/{agent_id}")
def delete_agent(agent_id: int, db: Session = Depends(get_db)):
    """Delete an agent"""
    db_agent = db.query(models.Agent).filter(models.Agent.id == agent_id).first()
    if not db_agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    db.delete(db_agent)
    db.commit()
    
    return {"success": True, "message": "Agent deleted successfully"}

@app.get("/agents/{agent_id}/logs")
def get_agent_logs(
    agent_id: int,
    limit: int = Query(50, ge=1, le=500),
    level: Optional[LogLevel] = None,
    db: Session = Depends(get_db)
):
    """Get health logs for an agent"""
    query = db.query(models.AgentLog).filter(models.AgentLog.agent_id == agent_id)
    
    if level:
        query = query.filter(models.AgentLog.level == level.value)
    
    logs = query.order_by(models.AgentLog.timestamp.desc()).limit(limit).all()
    
    return [
        {
            "id": log.id,
            "timestamp": log.timestamp.isoformat(),
            "level": log.level,
            "message": log.message,
            "details": log.details
        }
        for log in logs
    ]

# ==================== PIPELINES ====================

@app.get("/pipelines")
def get_pipelines(
    status: Optional[str] = None,
    branch: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all pipelines with optional filtering"""
    query = db.query(models.Pipeline)
    
    if status:
        query = query.filter(models.Pipeline.status == status)
    if branch:
        query = query.filter(models.Pipeline.branch == branch)
    
    pipelines = query.order_by(models.Pipeline.last_run.desc()).all()
    
    # Return pipelines with steps and parameters
    return [format_pipeline_full(pipeline, db) for pipeline in pipelines]

@app.post("/pipelines", status_code=201)
def create_pipeline(pipeline: PipelineCreate, db: Session = Depends(get_db)):
    """Create a new pipeline with steps and parameters"""
    
    # Create pipeline
    db_pipeline = models.Pipeline(
        name=pipeline.name,
        description=pipeline.description,
        branch=pipeline.branch,
        status="pending",
        agent_id=pipeline.agentId,
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
            step_order=step_data.order
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

@app.get("/pipelines/{pipeline_id}")
def get_pipeline(pipeline_id: int, db: Session = Depends(get_db)):
    """Get pipeline by ID with steps and parameters"""
    pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return format_pipeline_full(pipeline, db)

@app.put("/pipelines/{pipeline_id}")
def update_pipeline(pipeline_id: int, pipeline: PipelineUpdate, db: Session = Depends(get_db)):
    """Update an existing pipeline"""
    db_pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
    if not db_pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    
    # Update basic fields
    if pipeline.name is not None:
        db_pipeline.name = pipeline.name
    if pipeline.status is not None:
        db_pipeline.status = pipeline.status
    if pipeline.branch is not None:
        db_pipeline.branch = pipeline.branch
    if pipeline.agentId is not None:
        db_pipeline.agent_id = pipeline.agentId
    
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
                step_order=step_data.order
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

@app.post("/pipelines/{pipeline_id}/run")
def run_pipeline(
    pipeline_id: int, 
    params: Dict[str, Any] = None,
    db: Session = Depends(get_db)
):
    """Trigger a pipeline execution with parameters"""
    db_pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
    if not db_pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    
    db_pipeline.status = "running"
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
    if params:
        for param_name, param_value in params.items():
            exec_param = models.PipelineExecutionParam(
                execution_id=execution.id,
                param_name=param_name,
                param_value=str(param_value)
            )
            db.add(exec_param)
    
    db.commit()
    
    return {
        "success": True,
        "message": "Pipeline started",
        "executionId": execution.id
    }

@app.get("/pipelines/{pipeline_id}/executions")
def get_pipeline_executions(
    pipeline_id: int,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """Get execution history for a pipeline"""
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
        
        result.append({
            "id": execution.id,
            "status": execution.status,
            "startedAt": execution.started_at.isoformat(),
            "completedAt": execution.completed_at.isoformat() if execution.completed_at else None,
            "duration": execution.duration,
            "parameters": {p.param_name: p.param_value for p in params}
        })
    
    return result

@app.post("/pipelines/{pipeline_id}/stop")
def stop_pipeline(pipeline_id: int, db: Session = Depends(get_db)):
    """Stop a running pipeline"""
    db_pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
    if not db_pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    
    db_pipeline.status = "pending"
    db.commit()
    
    return {"success": True, "message": "Pipeline stopped"}

# ==================== TASKS ====================

@app.get("/tasks")
def get_tasks(
    status: Optional[TaskStatus] = None,
    agent_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Get all tasks with optional filtering"""
    query = db.query(models.Task)
    
    if status:
        query = query.filter(models.Task.status == status.value)
    if agent_id:
        query = query.filter(models.Task.agent_id == agent_id)
    
    tasks = query.order_by(models.Task.created_at.desc()).all()
    return [format_task(task) for task in tasks]

@app.get("/tasks/{task_id}")
def get_task(task_id: int, db: Session = Depends(get_db)):
    """Get task by ID"""
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return format_task(task)

@app.delete("/tasks/{task_id}")
def cancel_task(task_id: int, db: Session = Depends(get_db)):
    """Cancel a task"""
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    db_task.status = "failed"
    db.commit()
    
    return {"success": True, "message": "Task cancelled"}

# ==================== SERVICES ====================

@app.get("/services")
def get_services(db: Session = Depends(get_db)):
    """Get all monitored services organized by categories"""
    services = db.query(models.Service).all()
    
    categories = {
        "todo": {"title": "To Monitor", "services": []},
        "monitoring": {"title": "Monitoring", "services": []},
        "issues": {"title": "Issues", "services": []},
        "healthy": {"title": "Healthy", "services": []}
    }
    
    for service in services:
        formatted_service = format_service(service)
        categories[service.category]["services"].append(formatted_service)
    
    return {"categories": categories}

@app.post("/services", status_code=201)
def create_service(service: ServiceCreate, db: Session = Depends(get_db)):
    """Add a new service to monitor"""
    
    # Generate service ID
    service_id = f"svc-{datetime.now().timestamp()}"
    
    db_service = models.Service(
        id=service_id,
        name=service.name,
        type=service.type.value,
        url=service.url,
        status="unknown",
        category=service.category.value,
        last_check=datetime.now(),
        response_time="-",
        uptime=0.0
    )
    
    db.add(db_service)
    db.commit()
    db.refresh(db_service)
    
    return format_service(db_service)

@app.get("/services/{service_id}")
def get_service(service_id: str, db: Session = Depends(get_db)):
    """Get service by ID"""
    service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    return format_service(service)

@app.put("/services/{service_id}")
def update_service(service_id: str, service: ServiceUpdate, db: Session = Depends(get_db)):
    """Update an existing service"""
    db_service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not db_service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    if service.name is not None:
        db_service.name = service.name
    if service.status is not None:
        db_service.status = service.status.value
    if service.category is not None:
        db_service.category = service.category.value
    
    db.commit()
    db.refresh(db_service)
    
    return format_service(db_service)

@app.delete("/services/{service_id}")
def delete_service(service_id: str, db: Session = Depends(get_db)):
    """Delete a service"""
    db_service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not db_service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    db.delete(db_service)
    db.commit()
    
    return {"success": True, "message": "Service deleted"}

class MoveCategoryRequest(BaseModel):
    category: ServiceCategory

@app.post("/services/{service_id}/move")
def move_service(service_id: str, request: MoveCategoryRequest, db: Session = Depends(get_db)):
    """Move service to a different monitoring category"""
    db_service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not db_service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    db_service.category = request.category.value
    db.commit()
    
    return {"success": True, "message": "Service moved successfully"}

# ==================== STATS ====================

@app.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    """Get dashboard statistics"""
    active_agents = db.query(models.Agent).filter(models.Agent.status == "online").count()
    running_pipelines = db.query(models.Pipeline).filter(models.Pipeline.status == "running").count()
    
    total_pipelines = db.query(models.Pipeline).count()
    successful_pipelines = db.query(models.Pipeline).filter(models.Pipeline.status == "success").count()
    success_rate = round((successful_pipelines / total_pipelines * 100) if total_pipelines > 0 else 0, 2)
    
    return {
        "activeAgents": {"value": str(active_agents), "trend": 12},
        "runningPipelines": {"value": str(running_pipelines), "trend": 8},
        "successRate": {"value": f"{success_rate}%", "trend": 3},
        "avgDeployTime": {"value": "2m 45s", "trend": -15}
    }

# ==============================================
# RUN SERVER
# ==============================================

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )