# main.py - Complete FastAPI Implementation with Database
from fastapi import FastAPI, HTTPException, Depends, Query, Body, UploadFile, File, Form, Response, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from enum import Enum
from sqlalchemy.orm import Session
import uvicorn
import os
import hashlib
import shutil
import bcrypt

# Import database, models, and config
from database import get_db, engine
import models
from config import app_config
import customer_api

# Create tables
models.Base.metadata.create_all(bind=engine)

# Print configuration
app_config.print_config()

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

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]

class AgentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    uuid: str
    location: str
    customer_id: Optional[int] = None
    parent_agent_id: Optional[int] = None

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

class RunPipelineRequest(BaseModel):
    agent_id: Optional[int] = None
    parameters: Optional[Dict[str, Any]] = None

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

def format_agent(agent, parent_name=None):
    """Format agent for API response"""
    return {
        "id": agent.id,
        "uuid": agent.uuid,
        "name": agent.name,
        "status": agent.status,
        "lastSeen": relative_time(agent.last_seen),
        "jobs": agent.jobs,
        "location": agent.location,
        "cpu": agent.cpu,
        "memory": agent.memory,
        "customerId": agent.customer_id,
        "parentAgentId": agent.parent_agent_id,
        "parentAgentName": parent_name,
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
        "description": pipeline.description,
        "status": pipeline.status,
        "lastRun": relative_time(pipeline.last_run),
        "duration": pipeline.duration or "-",
        "branch": pipeline.branch,
        "commit": pipeline.commit or "N/A",
        "agent_id": pipeline.agent_id,
        "logVerboseOutput": pipeline.log_verbose_output or False,
        "steps": [
            {
                "name": step.name,
                "command": step.command,
                "order": step.step_order,
                "shellType": step.shell_type
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

tags_metadata = [
    # ==============================================
    # UI / FRONTEND ENDPOINTS
    # ==============================================
    {
        "name": "🔐 Authentication",
        "description": "**[FOR UI]** User authentication and session management",
    },
    {
        "name": "🌐 UI - System",
        "description": "**[FOR UI]** System information and health check endpoints",
    },
    {
        "name": "🌐 UI - Dashboard",
        "description": "**[FOR UI]** Dashboard data aggregation endpoints for overview pages",
    },
    {
        "name": "🌐 UI - Agents",
        "description": "**[FOR UI]** Manage deployment agents - view, register, update, monitor agent status",
    },
    {
        "name": "🌐 UI - Pipelines",
        "description": "**[FOR UI]** Create and manage CI/CD pipelines, define steps and parameters",
    },
    {
        "name": "🌐 UI - Pipeline Execution",
        "description": "**[FOR UI]** Run pipelines, monitor execution status, view logs",
    },
    {
        "name": "🌐 UI - Releases",
        "description": "**[FOR UI]** Release management - create releases, define stages, manage environments",
    },
    {
        "name": "🌐 UI - Release Execution",
        "description": "**[FOR UI]** Deploy releases, track execution progress, manage stage approvals",
    },
    {
        "name": "🌐 UI - Tasks",
        "description": "**[FOR UI]** View and manage individual deployment tasks",
    },
    {
        "name": "🌐 UI - Services",
        "description": "**[FOR UI]** Monitor and manage services with status updates",
    },
    {
        "name": "🌐 UI - File Management",
        "description": "**[FOR UI]** Upload and manage scripts/artifacts, push files to agents",
    },

    # ==============================================
    # AGENT COMMUNICATION ENDPOINTS
    # ==============================================
    {
        "name": "🤖 Agent - Registration & Health",
        "description": "**[FOR AGENTS]** Agent registration, heartbeat, and status updates",
    },
    {
        "name": "🤖 Agent - Task Execution",
        "description": "**[FOR AGENTS]** Poll for tasks, report execution status, stream logs",
    },
    {
        "name": "🤖 Agent - Release Execution",
        "description": "**[FOR AGENTS]** Poll for release pickups, execute releases, stream logs, report completion",
    },
    {
        "name": "🤖 Agent - File Transfer",
        "description": "**[FOR AGENTS]** Download scripts and artifacts assigned to the agent",
    },
]

app = FastAPI(
    title="CygnetCI API",
    description="API for CygnetCI - CI/CD Management Platform",
    version="1.0.0",
    debug=app_config.get_debug_mode(),
    openapi_tags=tags_metadata
)

# Configure CORS from config file
app.add_middleware(
    CORSMiddleware,
    allow_origins=app_config.get_allowed_origins(),
    allow_credentials=app_config.get_allow_credentials(),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include customer API router
app.include_router(customer_api.router)

# ==============================================
# SECURITY: Agent UUID from header
# ==============================================

def get_agent_uuid(x_agent_uuid: str = Header(...,
        description="Agent UUID — must be passed as the X-Agent-UUID request header")):
    """Dependency that extracts the agent UUID from the X-Agent-UUID request header.
    Keeps UUIDs out of URL paths (which appear in server logs, browser history, proxies)."""
    return x_agent_uuid

# ==============================================
# ENDPOINTS
# ==============================================

@app.get("/", tags=["🌐 UI - System"])
def root():
    return {
        "message": "CygnetCI API",
        "version": "1.0.0",
        "docs": "/docs"
    }

# ==================== AUTHENTICATION ====================

@app.post("/auth/login", response_model=LoginResponse, tags=["🔐 Authentication"])
def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate user with username and password
    Returns access token and user information
    """
    # Find user by username
    user = db.query(models.User).filter(models.User.username.ilike(credentials.username)).first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Verify password - support both bcrypt and SHA256 for backward compatibility
    password_valid = False

    # Check if password hash starts with $2b$ (bcrypt format)
    if user.password_hash.startswith('$2b$') or user.password_hash.startswith('$2a$'):
        # Use bcrypt verification
        password_valid = bcrypt.checkpw(
            credentials.password.encode('utf-8'),
            user.password_hash.encode('utf-8')
        )
    else:
        # Fallback to SHA256 for legacy passwords
        hashed_password = hashlib.sha256(credentials.password.encode()).hexdigest()
        password_valid = user.password_hash == hashed_password

    if not password_valid:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Check if user is active
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is disabled")

    # Update last login timestamp
    user.last_login = datetime.now()
    db.commit()

    # Generate access token (simple token for now - should use JWT in production)
    access_token = hashlib.sha256(f"{user.username}{datetime.now().isoformat()}".encode()).hexdigest()

    # Return user data (without password)
    user_data = {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "is_active": user.is_active,
        "is_superuser": user.is_superuser,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login": user.last_login.isoformat() if user.last_login else None
    }

    return LoginResponse(
        access_token=access_token,
        user=user_data
    )

# ==================== DASHBOARD ====================

@app.get("/data", tags=["🌐 UI - Dashboard"])
def get_dashboard_data(customer_id: int = None, db: Session = Depends(get_db)):
    """Get all dashboard data with optional customer filtering"""

    # Get agents — ordered by creation (id) so order is stable across refreshes
    agents_query = db.query(models.Agent)
    if customer_id is not None:
        agents_query = agents_query.filter(models.Agent.customer_id == customer_id)
    agents = agents_query.order_by(models.Agent.id.asc()).all()
    agents_data = [format_agent(agent) for agent in agents]

    # Get pipelines
    pipelines_query = db.query(models.Pipeline).order_by(models.Pipeline.last_run.desc())
    if customer_id is not None:
        pipelines_query = pipelines_query.filter(models.Pipeline.customer_id == customer_id)
    pipelines = pipelines_query.all()
    pipelines_data = [format_pipeline(pipeline) for pipeline in pipelines]

    # Get tasks
    tasks_query = db.query(models.Task)
    if customer_id is not None:
        # Filter tasks by customer through pipeline relationship
        tasks_query = tasks_query.join(models.Pipeline).filter(models.Pipeline.customer_id == customer_id)
    tasks = tasks_query.order_by(models.Task.created_at.desc()).limit(10).all()
    tasks_data = [format_task(task) for task in tasks]

    # Calculate stats
    active_agents_query = db.query(models.Agent).filter(models.Agent.status == "online")
    running_pipelines_query = db.query(models.Pipeline).filter(models.Pipeline.status == "running")
    total_pipelines_query = db.query(models.Pipeline)
    successful_pipelines_query = db.query(models.Pipeline).filter(models.Pipeline.status == "success")

    if customer_id is not None:
        active_agents_query = active_agents_query.filter(models.Agent.customer_id == customer_id)
        running_pipelines_query = running_pipelines_query.filter(models.Pipeline.customer_id == customer_id)
        total_pipelines_query = total_pipelines_query.filter(models.Pipeline.customer_id == customer_id)
        successful_pipelines_query = successful_pipelines_query.filter(models.Pipeline.customer_id == customer_id)

    active_agents = active_agents_query.count()
    running_pipelines = running_pipelines_query.count()
    total_pipelines = total_pipelines_query.count()
    successful_pipelines = successful_pipelines_query.count()
    success_rate = round((successful_pipelines / total_pipelines * 100) if total_pipelines > 0 else 0, 2)

    # Get services
    services_query = db.query(models.Service)
    if customer_id is not None:
        services_query = services_query.filter(models.Service.customer_id == customer_id)
    services = services_query.all()
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

@app.get("/agents", tags=["🌐 UI - Agents"])
def get_agents(db: Session = Depends(get_db)):
    """Get all agents with automatic status update based on last heartbeat"""
    agents = db.query(models.Agent).all()

    # Compute effective status based on last heartbeat (2 minutes timeout)
    offline_threshold = datetime.now() - timedelta(minutes=2)

    # Try to update statuses in DB, but fall back to computed status if DB is read-only
    try:
        needs_commit = False
        for agent in agents:
            if agent.last_seen and agent.last_seen < offline_threshold:
                if agent.status != "offline":
                    agent.status = "offline"
                    needs_commit = True
            elif agent.last_seen and agent.last_seen >= offline_threshold:
                if agent.status == "offline":
                    agent.status = "online"
                    needs_commit = True
        if needs_commit:
            db.commit()
    except Exception:
        db.rollback()
        # Re-query agents fresh after rollback
        agents = db.query(models.Agent).all()

    # Build agent name lookup for parent resolution
    agent_names = {a.id: a.name for a in agents}

    # Build response with computed effective status
    result = []
    for agent in agents:
        parent_name = agent_names.get(agent.parent_agent_id) if agent.parent_agent_id else None
        agent_data = format_agent(agent, parent_name)
        # Override status based on heartbeat even if DB update failed
        if agent.last_seen and agent.last_seen < offline_threshold:
            agent_data["status"] = "offline"
        elif agent.last_seen and agent.last_seen >= offline_threshold and agent.status == "offline":
            agent_data["status"] = "online"
        result.append(agent_data)

    return result

@app.post("/agents", tags=["🤖 Agent - Registration & Health"])
def create_agent(agent: AgentCreate, response: Response, db: Session = Depends(get_db)):
    """Register a new agent (called by agent on startup). Returns existing agent if UUID already registered."""

    # Check if UUID already exists — return existing data so agent always gets its own ID
    existing = db.query(models.Agent).filter(models.Agent.uuid == agent.uuid).first()
    if existing:
        # Update parent_agent_id if provided (sub-agent reconnecting after parent restart)
        if agent.parent_agent_id is not None and existing.parent_agent_id != agent.parent_agent_id:
            existing.parent_agent_id = agent.parent_agent_id
            db.commit()
            db.refresh(existing)
        return format_agent(existing)

    # Resolve customer_id: if a parent agent is provided, inherit its customer_id automatically
    resolved_customer_id = agent.customer_id
    if agent.parent_agent_id is not None:
        parent = db.query(models.Agent).filter(models.Agent.id == agent.parent_agent_id).first()
        if not parent:
            raise HTTPException(status_code=400, detail="Parent agent not found")
        if resolved_customer_id is None:
            resolved_customer_id = parent.customer_id

    # Validate customer_id is available (required for standalone agents without a parent)
    if resolved_customer_id is None:
        raise HTTPException(status_code=400, detail="Customer ID is required. Please select a customer before adding an agent.")

    # Validate customer exists
    customer = db.query(models.Customer).filter(models.Customer.id == resolved_customer_id).first()
    if not customer:
        raise HTTPException(status_code=400, detail="Customer not found")

    # Create new agent
    db_agent = models.Agent(
        name=agent.name,
        uuid=agent.uuid,
        description=agent.description,
        location=agent.location,
        customer_id=resolved_customer_id,
        parent_agent_id=agent.parent_agent_id,
        status="online",
        last_seen=datetime.now(),
        jobs=0,
        cpu=0,
        memory=0
    )

    db.add(db_agent)
    db.commit()
    db.refresh(db_agent)

    response.status_code = 201
    return format_agent(db_agent)

@app.get("/agents/{agent_id:int}", tags=["🌐 UI - Agents"])
def get_agent(agent_id: int, db: Session = Depends(get_db)):
    """Get agent by ID"""
    agent = db.query(models.Agent).filter(models.Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return format_agent(agent)

@app.put("/agents/{agent_id:int}", tags=["🌐 UI - Agents"])
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

@app.delete("/agents/{agent_id:int}", tags=["🌐 UI - Agents"])
def delete_agent(agent_id: int, db: Session = Depends(get_db)):
    """Delete an agent"""
    db_agent = db.query(models.Agent).filter(models.Agent.id == agent_id).first()
    if not db_agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    db.delete(db_agent)
    db.commit()
    
    return {"success": True, "message": "Agent deleted successfully"}

@app.get("/agents/{agent_id:int}/logs", tags=["🌐 UI - Agents"])
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

# ==================== MONITORING ====================

@app.get("/monitoring/agents/metrics", tags=["🌐 UI - Monitoring"])
def get_agents_metrics(customer_id: int = None, db: Session = Depends(get_db)):
    """Get current metrics for all agents"""
    query = db.query(models.Agent)
    if customer_id is not None:
        query = query.filter(models.Agent.customer_id == customer_id)
    agents = query.order_by(models.Agent.id.asc()).all()

    result = []
    for agent in agents:
        # Get latest resource data
        latest_resource = db.query(models.AgentResourceData)\
            .filter(models.AgentResourceData.agent_id == agent.id)\
            .order_by(models.AgentResourceData.timestamp.desc())\
            .first()

        result.append({
            "id": agent.id,
            "uuid": agent.uuid,
            "name": agent.name,
            "status": agent.status,
            "location": agent.location,
            "cpu": latest_resource.cpu if latest_resource else agent.cpu,
            "memory": latest_resource.memory if latest_resource else agent.memory,
            "disk": latest_resource.disk if latest_resource else 0,
            "jobs": agent.jobs,
            "last_seen": agent.last_seen.isoformat() if agent.last_seen else None,
            "has_k8s_data": any(k.startswith(f"{agent.uuid}:") for k in _k8s_metrics_store)
        })

    return result

@app.get("/monitoring/agents/metrics/history", tags=["🌐 UI - Monitoring"])
def get_agent_metrics_history(
    agent_uuid: str = Depends(get_agent_uuid),
    hours: int = Query(1, ge=1, le=24),
    db: Session = Depends(get_db)
):
    """Get historical metrics for an agent (last N hours)"""
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    from_time = datetime.now() - timedelta(hours=hours)

    metrics = db.query(models.AgentResourceData)\
        .filter(
            models.AgentResourceData.agent_id == agent.id,
            models.AgentResourceData.timestamp >= from_time
        )\
        .order_by(models.AgentResourceData.timestamp.asc())\
        .all()

    return [
        {
            "timestamp": metric.timestamp.isoformat(),
            "cpu": metric.cpu,
            "memory": metric.memory,
            "disk": metric.disk
        }
        for metric in metrics
    ]

@app.delete("/monitoring/agents/metrics/history", tags=["🌐 UI - Monitoring"])
def delete_agent_metrics_history(
    agent_uuid: str = Depends(get_agent_uuid),
    start_date: str = Query(..., description="Start datetime in ISO format"),
    end_date: str = Query(..., description="End datetime in ISO format"),
    db: Session = Depends(get_db)
):
    """Delete historical metrics for an agent within a date range"""
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        from_time = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        to_time = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid datetime format: {str(e)}")

    if from_time >= to_time:
        raise HTTPException(status_code=400, detail="Start date must be before end date")

    # Delete metrics in the specified range
    deleted_count = db.query(models.AgentResourceData)\
        .filter(
            models.AgentResourceData.agent_id == agent.id,
            models.AgentResourceData.timestamp >= from_time,
            models.AgentResourceData.timestamp <= to_time
        )\
        .delete(synchronize_session=False)

    db.commit()

    return {
        "message": f"Deleted {deleted_count} metrics",
        "deleted_count": deleted_count,
        "start_date": from_time.isoformat(),
        "end_date": to_time.isoformat()
    }

@app.get("/monitoring/api/ping", tags=["🌐 UI - Monitoring"])
def ping_api():
    """API health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0",
        "uptime": "running"
    }

@app.post("/monitoring/agents/report", tags=["🤖 Agent - Monitoring"])
def report_monitoring_data(agent_uuid: str = Depends(get_agent_uuid), data: dict = Body(...), db: Session = Depends(get_db)):
    """Agent reports its monitoring data (Windows services, drives, pings)"""
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        # Clear old data (keep only last 24 hours)
        cutoff_time = datetime.now() - timedelta(hours=24)

        # Store Windows Services
        if "windows_services" in data:
            # Delete old services for this agent
            db.query(models.AgentWindowsService)\
                .filter(models.AgentWindowsService.agent_id == agent.id)\
                .delete()

            for service in data["windows_services"]:
                db_service = models.AgentWindowsService(
                    agent_id=agent.id,
                    service_name=service["name"],
                    display_name=service["display_name"],
                    status=service["status"],
                    description=service.get("description", "")
                )
                db.add(db_service)

        # Store Drive Info
        if "drives" in data:
            # Delete old drives for this agent
            db.query(models.AgentDriveInfo)\
                .filter(models.AgentDriveInfo.agent_id == agent.id)\
                .delete()

            for drive in data["drives"]:
                db_drive = models.AgentDriveInfo(
                    agent_id=agent.id,
                    drive_letter=drive["letter"],
                    drive_label=drive.get("label", ""),
                    total_gb=drive["total_gb"],
                    used_gb=drive["used_gb"],
                    free_gb=drive["free_gb"],
                    percent_used=drive["percent_used"]
                )
                db.add(db_drive)

        # Store Website Pings
        if "website_pings" in data:
            # Delete all existing pings for this agent so URL changes take effect immediately
            db.query(models.AgentWebsitePing)\
                .filter(models.AgentWebsitePing.agent_id == agent.id)\
                .delete()

            for ping in data["website_pings"]:
                db_ping = models.AgentWebsitePing(
                    agent_id=agent.id,
                    url=ping["url"],
                    name=ping["name"],
                    status=ping["status"],
                    response_time_ms=ping["response_time_ms"]
                )
                db.add(db_ping)

        db.commit()
        return {"success": True, "message": "Monitoring data received"}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/monitoring/agents/windows-services", tags=["🌐 UI - Monitoring"])
def get_agent_windows_services(agent_uuid: str = Depends(get_agent_uuid), db: Session = Depends(get_db)):
    """Get Windows services starting with 'CI' for an agent"""
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Get latest reported services from database
    services = db.query(models.AgentWindowsService)\
        .filter(models.AgentWindowsService.agent_id == agent.id)\
        .order_by(models.AgentWindowsService.reported_at.desc())\
        .all()

    return [
        {
            "name": s.service_name,
            "display_name": s.display_name,
            "status": s.status,
            "description": s.description
        }
        for s in services
    ]

@app.post("/monitoring/agents/windows-services/control", tags=["🌐 UI - Monitoring"])
def control_windows_service(
    agent_uuid: str = Depends(get_agent_uuid),
    service_name: str = None,
    action: str = None,
    db: Session = Depends(get_db)
):
    """Control Windows service (start/stop) - queues command for agent to execute"""
    import json

    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if not service_name or not action:
        raise HTTPException(status_code=400, detail="service_name and action are required")

    if action not in ["start", "stop"]:
        raise HTTPException(status_code=400, detail="action must be 'start' or 'stop'")

    # Create command for agent to pick up
    command_data = json.dumps({
        "service_name": service_name,
        "action": action
    })

    db_command = models.AgentCommand(
        agent_id=agent.id,
        command_type="service_control",
        command_data=command_data,
        status="pending"
    )
    db.add(db_command)
    db.commit()
    db.refresh(db_command)

    return {
        "success": True,
        "message": f"Command to {action} service '{service_name}' queued for agent",
        "command_id": db_command.id,
        "service_name": service_name,
        "action": action,
        "agent_uuid": agent_uuid
    }

@app.get("/monitoring/agents/drive-info", tags=["🌐 UI - Monitoring"])
def get_agent_drive_info(agent_uuid: str = Depends(get_agent_uuid), db: Session = Depends(get_db)):
    """Get drive information for an agent"""
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Get drive data from database
    drives = db.query(models.AgentDriveInfo)\
        .filter(models.AgentDriveInfo.agent_id == agent.id)\
        .all()

    return [
        {
            "letter": drive.drive_letter,
            "label": drive.drive_label,
            "total_gb": drive.total_gb,
            "used_gb": drive.used_gb,
            "free_gb": drive.free_gb,
            "percent_used": drive.percent_used
        }
        for drive in drives
    ]

@app.get("/monitoring/agents/website-ping", tags=["🌐 UI - Monitoring"])
def get_agent_website_ping(agent_uuid: str = Depends(get_agent_uuid), db: Session = Depends(get_db)):
    """Get website/API ping status from agent (from agent's appsettings.json configuration)"""
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Get the latest ping data for each URL (most recent check)
    # Using a subquery to get the latest checked_at for each URL
    from sqlalchemy import func as sql_func

    # Get all pings for this agent, ordered by checked_at descending
    pings = db.query(models.AgentWebsitePing)\
        .filter(models.AgentWebsitePing.agent_id == agent.id)\
        .order_by(models.AgentWebsitePing.checked_at.desc())\
        .all()

    # Deduplicate by URL, keeping only the most recent ping for each URL
    seen_urls = set()
    unique_pings = []
    for ping in pings:
        if ping.url not in seen_urls:
            seen_urls.add(ping.url)
            unique_pings.append({
                "url": ping.url,
                "name": ping.name,
                "status": ping.status,
                "response_time_ms": ping.response_time_ms,
                "last_checked": ping.checked_at.isoformat() if ping.checked_at else datetime.now().isoformat()
            })

    return unique_pings

@app.get("/monitoring/agents/logs/{service_name}", tags=["🌐 UI - Monitoring"])
def get_service_logs(
    agent_uuid: str = Depends(get_agent_uuid),
    service_name: str = None,
    date: Optional[str] = None,
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """Get logs for a specific service on an agent"""
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    query = db.query(models.AgentLog)\
        .filter(models.AgentLog.agent_id == agent.id)

    if date:
        try:
            filter_date = datetime.strptime(date, "%Y-%m-%d").date()
            next_date = filter_date + timedelta(days=1)
            query = query.filter(
                models.AgentLog.timestamp >= filter_date,
                models.AgentLog.timestamp < next_date
            )
        except ValueError:
            pass

    logs = query.order_by(models.AgentLog.timestamp.desc()).limit(limit).all()

    return {
        "agent_name": agent.name,
        "service_name": service_name,
        "log_count": len(logs),
        "logs": [
            {
                "id": log.id,
                "timestamp": log.timestamp.isoformat(),
                "level": log.level,
                "message": log.message,
                "details": log.details
            }
            for log in logs
        ]
    }

# ── Service Log File Browser ─────────────────────────────────────────────────

@app.get("/commands/{command_id}", tags=["🌐 UI - Monitoring"])
def get_command_result(command_id: int, db: Session = Depends(get_db)):
    """Poll the status and result of an agent command"""
    command = db.query(models.AgentCommand).filter(models.AgentCommand.id == command_id).first()
    if not command:
        raise HTTPException(status_code=404, detail="Command not found")

    result_data = None
    if command.result:
        try:
            result_data = json.loads(command.result)
        except Exception:
            result_data = {"message": command.result}

    return {
        "id": command.id,
        "status": command.status,
        "command_type": command.command_type,
        "result": result_data,
        "created_at": command.created_at.isoformat() if command.created_at else None,
        "completed_at": command.completed_at.isoformat() if command.completed_at else None,
    }

@app.post("/monitoring/agents/service-log-files/{service_name}", tags=["🌐 UI - Monitoring"])
def request_service_log_list(agent_uuid: str = Depends(get_agent_uuid), service_name: str = None, db: Session = Depends(get_db)):
    """Ask the agent to list log files for a service. Returns command_id to poll."""
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    cmd = models.AgentCommand(
        agent_id=agent.id,
        command_type="service_log_list",
        command_data=json.dumps({"service_name": service_name}),
        status="pending"
    )
    db.add(cmd)
    db.commit()
    db.refresh(cmd)
    return {"command_id": cmd.id}

@app.post("/monitoring/agents/service-log-read/{service_name}", tags=["🌐 UI - Monitoring"])
def request_service_log_read(
    agent_uuid: str = Depends(get_agent_uuid),
    service_name: str = None,
    file_name: str = Query(...),
    max_kb: int = Query(512, ge=1, le=4096),
    db: Session = Depends(get_db)
):
    """Ask the agent to read a specific log file. Returns command_id to poll."""
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    cmd = models.AgentCommand(
        agent_id=agent.id,
        command_type="service_log_read",
        command_data=json.dumps({"service_name": service_name, "file_name": file_name, "max_kb": max_kb}),
        status="pending"
    )
    db.add(cmd)
    db.commit()
    db.refresh(cmd)
    return {"command_id": cmd.id}

# ==================== PIPELINES ====================

@app.get("/pipelines/templates", tags=["🌐 UI - Pipelines"])
def get_pipeline_templates(db: Session = Depends(get_db)):
    """Get all pipelines across all customers for use as copy templates"""
    pipelines = db.query(models.Pipeline).order_by(models.Pipeline.customer_id, models.Pipeline.name).all()
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

@app.post("/pipelines/cleanup-stale", tags=["🌐 UI - Pipelines"])
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

@app.get("/pipelines", tags=["🌐 UI - Pipelines"])
def get_pipelines(
    customer_id: Optional[int] = None,
    status: Optional[str] = None,
    branch: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all pipelines with optional filtering by customer"""
    query = db.query(models.Pipeline)

    if customer_id:
        query = query.filter(models.Pipeline.customer_id == customer_id)
    if status:
        query = query.filter(models.Pipeline.status == status)
    if branch:
        query = query.filter(models.Pipeline.branch == branch)

    pipelines = query.order_by(models.Pipeline.last_run.desc()).all()

    # Return pipelines with steps and parameters
    return [format_pipeline_full(pipeline, db) for pipeline in pipelines]

@app.post("/pipelines", status_code=201, tags=["🌐 UI - Pipelines"])
def create_pipeline(pipeline: PipelineCreate, db: Session = Depends(get_db)):
    """Create a new pipeline with steps and parameters"""

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

@app.get("/pipelines/{pipeline_id}", tags=["🌐 UI - Pipelines"])
def get_pipeline(pipeline_id: int, db: Session = Depends(get_db)):
    """Get pipeline by ID with steps and parameters"""
    pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return format_pipeline_full(pipeline, db)

@app.put("/pipelines/{pipeline_id}", tags=["🌐 UI - Pipelines"])
def update_pipeline(pipeline_id: int, pipeline: PipelineUpdate, db: Session = Depends(get_db)):
    """Update an existing pipeline"""
    db_pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
    if not db_pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    
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

@app.delete("/pipelines/{pipeline_id}", tags=["🌐 UI - Pipelines"])
def delete_pipeline(pipeline_id: int, db: Session = Depends(get_db)):
    """Delete a pipeline"""
    db_pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
    if not db_pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    # Delete the pipeline (cascade will delete related steps, parameters, executions)
    db.delete(db_pipeline)
    db.commit()

    return {"success": True, "message": f"Pipeline {pipeline_id} deleted successfully"}

@app.post("/pipelines/{pipeline_id}/run", tags=["🌐 UI - Pipeline Execution"])
def run_pipeline(
    pipeline_id: int,
    request: RunPipelineRequest,
    db: Session = Depends(get_db)
):
    """Trigger a pipeline execution with parameters and create pickup for agent"""
    db_pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
    if not db_pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

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

@app.get("/pipelines/{pipeline_id}/executions", tags=["🌐 UI - Pipelines"])
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

@app.post("/pipelines/{pipeline_id}/stop", tags=["🌐 UI - Pipeline Execution"])
def stop_pipeline(pipeline_id: int, db: Session = Depends(get_db)):
    """Stop a running pipeline by cancelling its active execution and pickup"""
    db_pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
    if not db_pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

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

# ==================== TASKS ====================

@app.get("/tasks", tags=["🌐 UI - Tasks"])
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

@app.get("/tasks/{task_id}", tags=["🌐 UI - Tasks"])
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

@app.get("/services", tags=["🌐 UI - Services"])
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

@app.post("/services", status_code=201, tags=["🌐 UI - Services"])
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

@app.get("/services/{service_id}", tags=["🌐 UI - Services"])
def get_service(service_id: str, db: Session = Depends(get_db)):
    """Get service by ID"""
    service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    return format_service(service)

@app.put("/services/{service_id}", tags=["🌐 UI - Services"])
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

@app.post("/services/{service_id}/move", tags=["🌐 UI - Services"])
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

# File Transfer Models
class FilePushRequest(BaseModel):
    transfer_file_id: int
    agent_uuid: str
    agent_name: Optional[str] = None
    requested_by: Optional[str] = None

class FileAcknowledgeRequest(BaseModel):
    success: bool
    error_message: Optional[str] = None

# Get NFSShared folder path from config
NFS_SHARED_PATH = app_config.get_nfs_shared_root()

@app.get("/environments")
def get_environments(db: Session = Depends(get_db)):
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

@app.post("/environments", status_code=201)
def create_environment(environment: EnvironmentCreate, db: Session = Depends(get_db)):
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

@app.put("/environments/{environment_id}")
def update_environment(environment_id: int, environment: EnvironmentUpdate, db: Session = Depends(get_db)):
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

@app.get("/releases", tags=["🌐 UI - Releases"])
def get_releases(customer_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Get all releases with their stages and pipelines, optionally filtered by customer"""
    query = db.query(models.Release)

    if customer_id:
        query = query.filter(models.Release.customer_id == customer_id)

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

@app.post("/releases", status_code=201, tags=["🌐 UI - Releases"])
def create_release(release: ReleaseCreate, db: Session = Depends(get_db)):
    """Create a new release definition with stages and/or pipelines"""
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

@app.get("/releases/{release_id}", tags=["🌐 UI - Releases"])
def get_release(release_id: int, db: Session = Depends(get_db)):
    """Get release details with stages and environments"""
    release = db.query(models.Release).filter(models.Release.id == release_id).first()
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")

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

@app.put("/releases/{release_id}", tags=["🌐 UI - Releases"])
def update_release(release_id: int, release: ReleaseUpdate, db: Session = Depends(get_db)):
    """Update a release"""
    db_release = db.query(models.Release).filter(models.Release.id == release_id).first()
    if not db_release:
        raise HTTPException(status_code=404, detail="Release not found")

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

@app.delete("/releases/{release_id}", tags=["🌐 UI - Releases"])
def delete_release(release_id: int, db: Session = Depends(get_db)):
    """Delete a release"""
    db_release = db.query(models.Release).filter(models.Release.id == release_id).first()
    if not db_release:
        raise HTTPException(status_code=404, detail="Release not found")

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

@app.post("/releases/{release_id}/deploy", tags=["🌐 UI - Release Execution"])
def deploy_release(release_id: int, request: DeployReleaseRequest, db: Session = Depends(get_db)):
    """Trigger a release deployment - supports both stage-based and pipeline-based releases"""
    release = db.query(models.Release).filter(models.Release.id == release_id).first()
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")

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

@app.get("/releases/{release_id}/executions", tags=["🌐 UI - Releases"])
def get_release_executions(release_id: int, limit: int = 10, db: Session = Depends(get_db)):
    """Get execution history for a release"""
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

@app.get("/release-executions/{execution_id}", tags=["🌐 UI - Releases"])
def get_release_execution(execution_id: int, db: Session = Depends(get_db)):
    """Get a single release execution by ID"""
    execution = db.query(models.ReleaseExecution).filter(models.ReleaseExecution.id == execution_id).first()
    if not execution:
        raise HTTPException(status_code=404, detail="Release execution not found")

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

@app.get("/release-executions/{execution_id}/pipeline-executions", tags=["🌐 UI - Releases"])
def get_release_pipeline_executions(execution_id: int, db: Session = Depends(get_db)):
    """Get list of pipeline executions for a release execution"""
    # First, verify the release execution exists
    release_execution = db.query(models.ReleaseExecution).filter(models.ReleaseExecution.id == execution_id).first()
    if not release_execution:
        raise HTTPException(status_code=404, detail="Release execution not found")

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

@app.get("/release-executions/{execution_id}/logs", tags=["🌐 UI - Releases"])
def get_release_execution_logs(execution_id: int, db: Session = Depends(get_db)):
    """Get all pipeline execution logs for a release execution"""
    # First, verify the release execution exists
    release_execution = db.query(models.ReleaseExecution).filter(models.ReleaseExecution.id == execution_id).first()
    if not release_execution:
        raise HTTPException(status_code=404, detail="Release execution not found")

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

@app.post("/release-executions/{execution_id}/update-status", tags=["🌐 UI - Releases"])
def update_release_execution_status(execution_id: int, db: Session = Depends(get_db)):
    """Manually update release execution status based on pipeline completions"""
    release_execution = db.query(models.ReleaseExecution).filter(models.ReleaseExecution.id == execution_id).first()
    if not release_execution:
        raise HTTPException(status_code=404, detail="Release execution not found")

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

@app.post("/release-executions/{execution_id}/abort", tags=["🌐 UI - Release Execution"])
def abort_release_execution(execution_id: int, db: Session = Depends(get_db)):
    """Abort an in-progress release execution.
    - Cancels all running pipeline pickups (agent detects cancellation via pickup status poll)
    - Cancels all pending pipeline executions so they never start
    - Marks the release execution as cancelled
    """
    release_execution = db.query(models.ReleaseExecution)\
        .filter(models.ReleaseExecution.id == execution_id).first()
    if not release_execution:
        raise HTTPException(status_code=404, detail="Release execution not found")
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


@app.post("/stage-executions/{stage_execution_id}/approve", tags=["🌐 UI - Release Execution"])
def approve_stage(stage_execution_id: int, request: ApprovalRequest, db: Session = Depends(get_db)):
    """Approve a stage execution"""
    stage_execution = db.query(models.StageExecution)\
        .filter(models.StageExecution.id == stage_execution_id)\
        .first()

    if not stage_execution:
        raise HTTPException(status_code=404, detail="Stage execution not found")

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

@app.post("/stage-executions/{stage_execution_id}/reject")
def reject_stage(stage_execution_id: int, request: ApprovalRequest, db: Session = Depends(get_db)):
    """Reject a stage execution"""
    stage_execution = db.query(models.StageExecution)\
        .filter(models.StageExecution.id == stage_execution_id)\
        .first()

    if not stage_execution:
        raise HTTPException(status_code=404, detail="Stage execution not found")

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

@app.get("/pipeline-executions/{execution_id}/logs", tags=["🌐 UI - Pipeline Execution"])
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

@app.post("/pipeline-executions/{execution_id}/logs", tags=["🌐 UI - Pipeline Execution"])
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

@app.get("/stage-executions/{execution_id}/logs", tags=["🌐 UI - Release Execution"])
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

@app.post("/stage-executions/{execution_id}/logs", tags=["🌐 UI - Release Execution"])
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
# FILE TRANSFER ENDPOINTS
# ==============================================

def calculate_checksum(file_path: str) -> str:
    """Calculate MD5 checksum of a file"""
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

@app.post("/transfer/upload", tags=["🌐 UI - File Management"])
async def upload_file(
    file: UploadFile = File(...),
    file_type: str = Form(...),
    version: str = Form(...),
    uploaded_by: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """Upload a file (script or artifact) to NFSShared folder"""

    # Validate file_type
    if file_type not in ['script', 'artifact']:
        raise HTTPException(status_code=400, detail="file_type must be 'script' or 'artifact'")

    # Validate file extension (optional - can be disabled in config)
    # if not app_config.validate_file_extension(file.filename, file_type):
    #     allowed_exts = app_config.get_allowed_script_extensions() if file_type == 'script' else app_config.get_allowed_artifact_extensions()
    #     raise HTTPException(status_code=400, detail=f"File extension not allowed. Allowed extensions: {', '.join(allowed_exts)}")

    try:
        # Create folder structure using config helper
        folder_path = app_config.get_file_path(file_type, version)
        os.makedirs(folder_path, exist_ok=True)

        # Save file
        file_path = os.path.join(folder_path, file.filename)

        # Write file in chunks to handle large files efficiently
        file_size = 0
        chunk_size = 1024 * 1024  # 1 MB chunks
        with open(file_path, "wb") as buffer:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                buffer.write(chunk)
                file_size += len(chunk)

        # Validate file size
        max_size = app_config.get_max_file_size_bytes()
        if file_size > max_size:
            os.remove(file_path)  # Clean up the file
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size: {app_config.get_max_file_size_mb()} MB"
            )

        # Calculate checksum if enabled in config
        checksum = None
        if app_config.should_calculate_checksum():
            checksum = calculate_checksum(file_path)

        # Check if file already exists in database
        existing_file = db.query(models.TransferFile)\
            .filter(
                models.TransferFile.file_type == file_type,
                models.TransferFile.file_name == file.filename,
                models.TransferFile.version == version
            ).first()

        if existing_file:
            # Update existing record
            existing_file.file_path = file_path
            existing_file.file_size_bytes = file_size
            existing_file.checksum = checksum
            existing_file.uploaded_by = uploaded_by
            existing_file.description = description
            existing_file.updated_at = datetime.now()
            db.commit()
            db.refresh(existing_file)

            return {
                "success": True,
                "message": "File updated successfully",
                "file": {
                    "id": existing_file.id,
                    "file_type": existing_file.file_type,
                    "file_name": existing_file.file_name,
                    "version": existing_file.version,
                    "file_path": existing_file.file_path,
                    "file_size_bytes": existing_file.file_size_bytes,
                    "checksum": existing_file.checksum
                }
            }

        # Create new database record
        transfer_file = models.TransferFile(
            file_type=file_type,
            file_name=file.filename,
            version=version,
            file_path=file_path,
            file_size_bytes=file_size,
            checksum=checksum,
            uploaded_by=uploaded_by,
            description=description
        )

        db.add(transfer_file)
        db.commit()
        db.refresh(transfer_file)

        return {
            "success": True,
            "message": "File uploaded successfully",
            "file": {
                "id": transfer_file.id,
                "file_type": transfer_file.file_type,
                "file_name": transfer_file.file_name,
                "version": transfer_file.version,
                "file_path": transfer_file.file_path,
                "file_size_bytes": transfer_file.file_size_bytes,
                "checksum": transfer_file.checksum
            }
        }

    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is (e.g. file too large)
    except Exception as e:
        import traceback
        print(f"Upload failed: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {type(e).__name__}: {str(e)}")

@app.get("/transfer/files", tags=["🌐 UI - File Management"])
def get_transfer_files(
    file_type: Optional[str] = None,
    version: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all uploaded files, optionally filtered by type and version"""
    query = db.query(models.TransferFile)

    if file_type:
        query = query.filter(models.TransferFile.file_type == file_type)
    if version:
        query = query.filter(models.TransferFile.version == version)

    files = query.order_by(models.TransferFile.created_at.desc()).all()

    return [
        {
            "id": f.id,
            "file_type": f.file_type,
            "file_name": f.file_name,
            "version": f.version,
            "file_path": f.file_path,
            "file_size_bytes": f.file_size_bytes,
            "checksum": f.checksum,
            "uploaded_by": f.uploaded_by,
            "description": f.description,
            "created_at": f.created_at.isoformat(),
            "updated_at": f.updated_at.isoformat()
        }
        for f in files
    ]

@app.get("/transfer/versions", tags=["🌐 UI - File Management"])
def get_versions(file_type: Optional[str] = None, db: Session = Depends(get_db)):
    """Get all unique versions, optionally filtered by file type"""
    query = db.query(models.TransferFile.version).distinct()

    if file_type:
        query = query.filter(models.TransferFile.file_type == file_type)

    versions = query.order_by(models.TransferFile.version.desc()).all()
    return [v[0] for v in versions]

@app.post("/transfer/push", tags=["🌐 UI - File Management"])
def push_file_to_agent(request: FilePushRequest, db: Session = Depends(get_db)):
    """Create a pickup entry for an agent to download a file"""

    # Verify transfer file exists
    transfer_file = db.query(models.TransferFile)\
        .filter(models.TransferFile.id == request.transfer_file_id)\
        .first()

    if not transfer_file:
        raise HTTPException(status_code=404, detail="Transfer file not found")

    # Check if pickup already exists for this agent and file
    existing_pickup = db.query(models.TransferFilePickup)\
        .filter(
            models.TransferFilePickup.transfer_file_id == request.transfer_file_id,
            models.TransferFilePickup.agent_uuid == request.agent_uuid,
            models.TransferFilePickup.status == "pending"
        ).first()

    if existing_pickup:
        return {
            "success": True,
            "message": "Pickup already exists for this agent",
            "pickup_id": existing_pickup.id
        }

    # Create pickup entry
    pickup = models.TransferFilePickup(
        transfer_file_id=request.transfer_file_id,
        agent_uuid=request.agent_uuid,
        agent_name=request.agent_name,
        file_type=transfer_file.file_type,
        version=transfer_file.version,
        status="pending",
        requested_by=request.requested_by
    )

    db.add(pickup)
    db.commit()
    db.refresh(pickup)

    return {
        "success": True,
        "message": "File pushed to agent successfully",
        "pickup_id": pickup.id,
        "agent_uuid": pickup.agent_uuid,
        "file_name": transfer_file.file_name,
        "version": transfer_file.version
    }

@app.get("/transfer/agent/downloads", tags=["🤖 Agent - File Transfer"])
def get_agent_downloads(agent_uuid: str = Depends(get_agent_uuid), db: Session = Depends(get_db)):
    """Get all pending downloads for an agent"""
    pickups = db.query(models.TransferFilePickup)\
        .filter(
            models.TransferFilePickup.agent_uuid == agent_uuid,
            models.TransferFilePickup.status == "pending"
        )\
        .all()

    result = []
    for pickup in pickups:
        transfer_file = db.query(models.TransferFile)\
            .filter(models.TransferFile.id == pickup.transfer_file_id)\
            .first()

        if transfer_file:
            result.append({
                "pickup_id": pickup.id,
                "transfer_file_id": transfer_file.id,
                "file_type": transfer_file.file_type,
                "file_name": transfer_file.file_name,
                "version": transfer_file.version,
                "file_path": transfer_file.file_path,
                "file_size_bytes": transfer_file.file_size_bytes,
                "checksum": transfer_file.checksum,
                "requested_at": pickup.requested_at.isoformat()
            })

    return result

@app.get("/transfer/download/{pickup_id}", tags=["🤖 Agent - File Transfer"])
def download_file(pickup_id: int, db: Session = Depends(get_db)):
    """Download a file for an agent (used by agents)"""

    pickup = db.query(models.TransferFilePickup)\
        .filter(models.TransferFilePickup.id == pickup_id)\
        .first()

    if not pickup:
        raise HTTPException(status_code=404, detail="Pickup not found")

    if pickup.status != "pending":
        raise HTTPException(status_code=400, detail="Pickup already processed")

    transfer_file = db.query(models.TransferFile)\
        .filter(models.TransferFile.id == pickup.transfer_file_id)\
        .first()

    if not transfer_file:
        raise HTTPException(status_code=404, detail="Transfer file not found")

    if not os.path.exists(transfer_file.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    # Mark as downloading — acknowledge endpoint will set final status
    pickup.status = "downloading"
    db.commit()

    return FileResponse(
        path=transfer_file.file_path,
        filename=transfer_file.file_name,
        media_type='application/octet-stream'
    )

@app.post("/transfer/acknowledge/{pickup_id}", tags=["🤖 Agent - File Transfer"])
def acknowledge_download(pickup_id: int, request: FileAcknowledgeRequest, db: Session = Depends(get_db)):
    """Agent acknowledges successful file download"""

    pickup = db.query(models.TransferFilePickup)\
        .filter(models.TransferFilePickup.id == pickup_id)\
        .first()

    if not pickup:
        raise HTTPException(status_code=404, detail="Pickup not found")

    if request.success:
        # Keep the pickup entry for history but mark as acknowledged
        pickup.acknowledged_at = datetime.now()
        pickup.status = "downloaded"  # Ensure status is set to downloaded
        db.commit()

        return {
            "success": True,
            "message": "Download acknowledged successfully"
        }
    else:
        # Mark as failed
        pickup.status = "failed"
        pickup.error_message = request.error_message
        pickup.acknowledged_at = datetime.now()
        db.commit()

        return {
            "success": True,
            "message": "Download marked as failed"
        }

@app.get("/transfer/pickups", tags=["🌐 UI - File Management"])
def get_all_pickups(
    status: Optional[str] = None,
    agent_uuid: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all file pickup entries (for admin/monitoring)"""
    query = db.query(models.TransferFilePickup)

    if status:
        query = query.filter(models.TransferFilePickup.status == status)
    if agent_uuid:
        query = query.filter(models.TransferFilePickup.agent_uuid == agent_uuid)

    pickups = query.order_by(models.TransferFilePickup.requested_at.desc()).all()

    result = []
    for pickup in pickups:
        transfer_file = db.query(models.TransferFile)\
            .filter(models.TransferFile.id == pickup.transfer_file_id)\
            .first()

        result.append({
            "id": pickup.id,
            "transfer_file_id": pickup.transfer_file_id,
            "file_name": transfer_file.file_name if transfer_file else "Unknown",
            "file_type": pickup.file_type,
            "version": pickup.version,
            "file_size_bytes": transfer_file.file_size_bytes if transfer_file else None,
            "agent_uuid": pickup.agent_uuid,
            "agent_name": pickup.agent_name,
            "status": pickup.status,
            "requested_by": pickup.requested_by,
            "requested_at": pickup.requested_at.isoformat(),
            "downloaded_at": pickup.downloaded_at.isoformat() if pickup.downloaded_at else None,
            "acknowledged_at": pickup.acknowledged_at.isoformat() if pickup.acknowledged_at else None,
            "error_message": pickup.error_message
        })

    return result

@app.get("/transfer/files/{file_id}/history", tags=["🌐 UI - File Management"])
def get_file_transfer_history(file_id: int, limit: int = 50, db: Session = Depends(get_db)):
    """Get transfer history for a specific file"""

    # Verify file exists
    transfer_file = db.query(models.TransferFile)\
        .filter(models.TransferFile.id == file_id)\
        .first()

    if not transfer_file:
        raise HTTPException(status_code=404, detail="Transfer file not found")

    # Get all pickups for this file
    pickups = db.query(models.TransferFilePickup)\
        .filter(models.TransferFilePickup.transfer_file_id == file_id)\
        .order_by(models.TransferFilePickup.requested_at.desc())\
        .limit(limit)\
        .all()

    # Calculate statistics
    total_downloads = len(pickups)
    successful_downloads = sum(1 for p in pickups if p.status == 'downloaded')
    failed_downloads = sum(1 for p in pickups if p.status == 'failed')
    pending_downloads = sum(1 for p in pickups if p.status == 'pending')

    # Get unique agents that downloaded this file
    unique_agents = db.query(models.TransferFilePickup.agent_name)\
        .filter(
            models.TransferFilePickup.transfer_file_id == file_id,
            models.TransferFilePickup.agent_name.isnot(None)
        )\
        .distinct()\
        .all()

    result = []
    for pickup in pickups:
        # Calculate download duration if available
        duration = None
        if pickup.downloaded_at and pickup.requested_at:
            duration_seconds = int((pickup.downloaded_at - pickup.requested_at).total_seconds())
            duration = duration_seconds

        result.append({
            "id": pickup.id,
            "agent_uuid": pickup.agent_uuid,
            "agent_name": pickup.agent_name or "Unknown",
            "status": pickup.status,
            "requested_by": pickup.requested_by,
            "requested_at": pickup.requested_at.isoformat(),
            "downloaded_at": pickup.downloaded_at.isoformat() if pickup.downloaded_at else None,
            "acknowledged_at": pickup.acknowledged_at.isoformat() if pickup.acknowledged_at else None,
            "duration": duration,
            "error_message": pickup.error_message
        })

    return {
        "file_id": file_id,
        "file_name": transfer_file.file_name,
        "file_type": transfer_file.file_type,
        "version": transfer_file.version,
        "statistics": {
            "total_downloads": total_downloads,
            "successful": successful_downloads,
            "failed": failed_downloads,
            "pending": pending_downloads,
            "unique_agents": len(unique_agents)
        },
        "history": result
    }

@app.delete("/transfer/files/{file_id}", tags=["🌐 UI - File Management"])
def delete_transfer_file(file_id: int, db: Session = Depends(get_db)):
    """Delete a transfer file"""
    transfer_file = db.query(models.TransferFile)\
        .filter(models.TransferFile.id == file_id)\
        .first()

    if not transfer_file:
        raise HTTPException(status_code=404, detail="Transfer file not found")

    # Delete file from disk
    if os.path.exists(transfer_file.file_path):
        try:
            os.remove(transfer_file.file_path)
        except Exception as e:
            print(f"Warning: Could not delete file from disk: {e}")

    # Delete from database (pickups will cascade delete)
    db.delete(transfer_file)
    db.commit()

    return {"success": True, "message": "Transfer file deleted"}

# ==============================================
# AGENT COMMUNICATION ENDPOINTS
# ==============================================

@app.post("/agents/heartbeat", tags=["🤖 Agent - Registration & Health"])
def agent_heartbeat(agent_uuid: str = Depends(get_agent_uuid), heartbeat: dict = Body(...), db: Session = Depends(get_db)):
    """Agent sends heartbeat with system metrics"""
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()

    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Update agent status and metrics
    agent.status = heartbeat.get("status", "online")
    agent.cpu = heartbeat.get("cpu", 0)
    agent.memory = heartbeat.get("memory", 0)
    agent.jobs = heartbeat.get("jobs", 0)
    agent.last_seen = datetime.now()

    # Save resource data to AgentResourceData table for historical tracking
    cpu = heartbeat.get("cpu", 0)
    memory = heartbeat.get("memory", 0)
    disk = heartbeat.get("disk", 0)

    resource_data = models.AgentResourceData(
        agent_id=agent.id,
        cpu=cpu,
        memory=memory,
        disk=disk,
        timestamp=datetime.now()
    )
    db.add(resource_data)

    db.commit()

    return {"success": True, "message": "Heartbeat received"}

@app.get("/tasks/agent/pending", tags=["🤖 Agent - Task Execution"])
def get_pending_tasks(agent_uuid: str = Depends(get_agent_uuid), db: Session = Depends(get_db)):
    """Get pending tasks for a specific agent"""
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()

    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Get tasks assigned to this agent with status 'pending' or 'queued'
    tasks = db.query(models.Task)\
        .filter(models.Task.agent_id == agent.id)\
        .filter(models.Task.status.in_(["pending", "queued"]))\
        .order_by(models.Task.created_at)\
        .all()

    return [
        {
            "id": task.id,
            "name": task.name,
            "script_path": task.description,  # Assuming description contains script path
            "script_type": "shell",
            "environment_variables": {},
            "timeout_seconds": 3600
        }
        for task in tasks
    ]

@app.post("/tasks/{task_id}/logs", tags=["🤖 Agent - Task Execution"])
def stream_task_log(task_id: int, log_data: dict, db: Session = Depends(get_db)):
    """Stream log line from agent for a task"""
    task = db.query(models.Task).filter(models.Task.id == task_id).first()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Update task status to running if it's pending
    if task.status == "pending":
        task.status = "running"
        task.started_at = datetime.now()

    # For now, just print the log (in production, you'd store this in a logs table)
    log_line = log_data.get("log_line", "")
    print(f"[Task {task_id}] {log_line}")

    db.commit()

    return {"success": True}

@app.post("/tasks/{task_id}/complete", tags=["🤖 Agent - Task Execution"])
def complete_task(task_id: int, completion_data: dict, db: Session = Depends(get_db)):
    """Mark task as completed by agent"""
    task = db.query(models.Task).filter(models.Task.id == task_id).first()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    success = completion_data.get("success", False)
    exit_code = completion_data.get("exit_code", 0)

    task.status = "completed" if success else "failed"
    task.completed_at = datetime.now()

    # Calculate duration
    if task.started_at:
        duration = task.completed_at - task.started_at
        task.duration = str(int(duration.total_seconds())) + "s"

    db.commit()

    return {"success": True, "message": "Task completed"}

# ==============================================
# AGENT COMMAND ENDPOINTS (Service Control, etc.)
# ==============================================

@app.get("/commands/agent/pending", tags=["🤖 Agent - Task Execution"])
def get_pending_commands(agent_uuid: str = Depends(get_agent_uuid), db: Session = Depends(get_db)):
    """Get pending commands for a specific agent (e.g., service start/stop)"""
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()

    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    commands = db.query(models.AgentCommand)\
        .filter(
            models.AgentCommand.agent_id == agent.id,
            models.AgentCommand.status == "pending"
        )\
        .order_by(models.AgentCommand.created_at)\
        .all()

    return [
        {
            "id": cmd.id,
            "command_type": cmd.command_type,
            "command_data": cmd.command_data,
            "created_at": cmd.created_at.isoformat() if cmd.created_at else None
        }
        for cmd in commands
    ]

@app.post("/commands/{command_id}/start", tags=["🤖 Agent - Task Execution"])
def start_command(command_id: int, db: Session = Depends(get_db)):
    """Mark command as started by agent"""
    command = db.query(models.AgentCommand).filter(models.AgentCommand.id == command_id).first()

    if not command:
        raise HTTPException(status_code=404, detail="Command not found")

    command.status = "in_progress"
    command.started_at = datetime.now()
    db.commit()

    return {"success": True, "message": "Command started"}

@app.post("/commands/{command_id}/complete", tags=["🤖 Agent - Task Execution"])
def complete_command(command_id: int, completion_data: dict, db: Session = Depends(get_db)):
    """Mark command as completed by agent"""
    import json

    command = db.query(models.AgentCommand).filter(models.AgentCommand.id == command_id).first()

    if not command:
        raise HTTPException(status_code=404, detail="Command not found")

    success = completion_data.get("success", False)
    result = completion_data.get("result", "")

    command.status = "completed" if success else "failed"
    command.result = json.dumps({"success": success, "message": result}) if result else None
    command.completed_at = datetime.now()
    db.commit()

    return {"success": True, "message": "Command completed"}

# ==============================================
# RELEASE PICKUP ENDPOINTS (Agent Communication)
# ==============================================

@app.get("/releases/pickup/pending", tags=["🤖 Agent - Release Execution"])
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

@app.post("/releases/pickup/{pickup_id}/acknowledge", tags=["🤖 Agent - Release Execution"])
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

@app.post("/releases/pickup/{pickup_id}/start", tags=["🤖 Agent - Release Execution"])
def start_release_execution(pickup_id: int, db: Session = Depends(get_db)):
    """Agent starts executing the release"""
    pickup = db.query(models.ReleasePickup).filter(models.ReleasePickup.id == pickup_id).first()

    if not pickup:
        raise HTTPException(status_code=404, detail="Pickup not found")

    pickup.status = "in_progress"
    pickup.started_at = datetime.now()
    db.commit()

    return {"success": True, "message": "Release execution started"}

@app.post("/releases/pickup/{pickup_id}/complete", tags=["🤖 Agent - Release Execution"])
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

@app.post("/releases/pickup/{pickup_id}/log", tags=["🤖 Agent - Release Execution"])
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

# ==============================================
# PIPELINE PICKUP ENDPOINTS (Agent Polling)
# ==============================================

@app.get("/pipelines/pickup/pending", tags=["🤖 Agent - Pipeline Execution"])
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

@app.post("/pipelines/pickup/{pickup_id}/acknowledge", tags=["🤖 Agent - Pipeline Execution"])
def acknowledge_pipeline_pickup(pickup_id: int, db: Session = Depends(get_db)):
    """Agent acknowledges picking up a pipeline execution"""
    pickup = db.query(models.PipelinePickup).filter(models.PipelinePickup.id == pickup_id).first()

    if not pickup:
        raise HTTPException(status_code=404, detail="Pickup not found")

    pickup.status = "picked_up"
    pickup.picked_up_at = datetime.now()

    db.commit()

    return {"success": True, "message": "Pickup acknowledged"}

@app.post("/pipelines/pickup/{pickup_id}/start", tags=["🤖 Agent - Pipeline Execution"])
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

@app.post("/pipelines/pickup/{pickup_id}/complete", tags=["🤖 Agent - Pipeline Execution"])
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

@app.get("/pipelines/pickup/{pickup_id}/status", tags=["🤖 Agent - Pipeline Execution"])
def get_pipeline_pickup_status(pickup_id: int, db: Session = Depends(get_db)):
    """Agent checks if a pipeline pickup has been cancelled"""
    pickup = db.query(models.PipelinePickup).filter(models.PipelinePickup.id == pickup_id).first()

    if not pickup:
        raise HTTPException(status_code=404, detail="Pickup not found")

    return {"pickup_id": pickup_id, "status": pickup.status}

@app.post("/pipelines/pickup/{pickup_id}/log", tags=["🤖 Agent - Pipeline Execution"])
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

# ==============================================
# USER MANAGEMENT ENDPOINTS
# ==============================================

@app.get("/users", tags=["👥 Users"])
def get_users(
    customer_id: Optional[int] = Query(None, description="Filter by customer"),
    db: Session = Depends(get_db)
):
    """Get all users, optionally filtered by customer"""
    query = db.query(models.User)

    if customer_id:
        # Get users assigned to this customer
        query = query.join(models.UserCustomer).filter(models.UserCustomer.customer_id == customer_id)

    users = query.all()

    # Convert to dict and remove password
    result = []
    for user in users:
        user_dict = {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "is_active": user.is_active,
            "is_superuser": user.is_superuser,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "updated_at": user.updated_at.isoformat() if user.updated_at else None,
            "last_login": user.last_login.isoformat() if user.last_login else None
        }
        result.append(user_dict)

    return result

@app.post("/users", tags=["👥 Users"])
def create_user(
    username: str = Form(...),
    email: str = Form(...),
    full_name: str = Form(...),
    password: str = Form(...),
    is_superuser: bool = Form(False),
    db: Session = Depends(get_db)
):
    """Create a new user"""
    # Check if username or email already exists
    existing = db.query(models.User).filter(
        (models.User.username == username) | (models.User.email == email)
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists")

    # Hash password (simple hash for now - should use proper password hashing in production)
    import hashlib
    hashed_password = hashlib.sha256(password.encode()).hexdigest()

    new_user = models.User(
        username=username,
        email=email,
        full_name=full_name,
        password_hash=hashed_password,
        is_active=True,
        is_superuser=is_superuser
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "id": new_user.id,
        "username": new_user.username,
        "email": new_user.email,
        "full_name": new_user.full_name,
        "is_active": new_user.is_active,
        "is_superuser": new_user.is_superuser
    }

@app.put("/users/{user_id}", tags=["👥 Users"])
def update_user(
    user_id: int,
    email: Optional[str] = Form(None),
    full_name: Optional[str] = Form(None),
    is_active: Optional[bool] = Form(None),
    is_superuser: Optional[bool] = Form(None),
    db: Session = Depends(get_db)
):
    """Update user details"""
    user = db.query(models.User).filter(models.User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if email:
        user.email = email
    if full_name:
        user.full_name = full_name
    if is_active is not None:
        user.is_active = is_active
    if is_superuser is not None:
        user.is_superuser = is_superuser

    db.commit()
    db.refresh(user)

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "is_active": user.is_active,
        "is_superuser": user.is_superuser
    }

@app.delete("/users/{user_id}", tags=["👥 Users"])
def delete_user(user_id: int, db: Session = Depends(get_db)):
    """Delete a user"""
    user = db.query(models.User).filter(models.User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()

    return {"success": True, "message": "User deleted"}


# ==============================================
# ROLES & PERMISSIONS ENDPOINTS
# ==============================================

@app.get("/roles", tags=["🛡️ Roles"])
def get_roles(db: Session = Depends(get_db)):
    """Get all roles"""
    roles = db.query(models.Role).all()
    return [{
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "permissions": role.permissions,
        "is_system": role.is_system,
        "created_at": role.created_at,
        "updated_at": role.updated_at
    } for role in roles]


@app.get("/roles/{role_id}", tags=["🛡️ Roles"])
def get_role(role_id: int, db: Session = Depends(get_db)):
    """Get a specific role"""
    role = db.query(models.Role).filter(models.Role.id == role_id).first()

    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    return {
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "permissions": role.permissions,
        "is_system": role.is_system,
        "created_at": role.created_at,
        "updated_at": role.updated_at
    }

@app.delete("/roles/{role_id}", tags=["🛡️ Roles"])
def delete_role(role_id: int, db: Session = Depends(get_db)):
    """Delete a role (only custom roles, not system roles)"""
    role = db.query(models.Role).filter(models.Role.id == role_id).first()

    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if role.is_system:
        raise HTTPException(status_code=403, detail="Cannot delete system roles")

    db.delete(role)
    db.commit()

    return {"message": f"Role '{role.name}' deleted successfully"}


# ==============================================
# AUDIT LOGS ENDPOINTS
# ==============================================

@app.get("/audit-logs", tags=["📋 Audit Logs"])
def get_audit_logs(
    limit: int = Query(100, description="Maximum number of logs to return"),
    offset: int = Query(0, description="Number of logs to skip"),
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    db: Session = Depends(get_db)
):
    """Get audit logs with pagination and filters"""
    query = db.query(models.AuditLog)

    if user_id:
        query = query.filter(models.AuditLog.user_id == user_id)

    if resource_type:
        query = query.filter(models.AuditLog.resource_type == resource_type)

    logs = query.order_by(models.AuditLog.created_at.desc()).offset(offset).limit(limit).all()

    return [{
        "id": log.id,
        "user_id": log.user_id,
        "action": log.action,
        "resource_type": log.resource_type,
        "resource_id": log.resource_id,
        "details": log.details,
        "ip_address": log.ip_address,
        "user_agent": log.user_agent,
        "created_at": log.created_at
    } for log in logs]


# ==============================================
# ROLLBACK SCRIPT MANAGEMENT ENDPOINTS
# ==============================================

@app.post("/rollback/upload", tags=["📜 Rollback Scripts"])
async def upload_rollback_script(
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    uploaded_by: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """Upload a SQL rollback/migration script for analysis"""
    import os
    from pathlib import Path
    from datetime import datetime

    # Validate file extension
    if not file.filename.endswith('.sql'):
        raise HTTPException(status_code=400, detail="Only .sql files are allowed")

    # Create rollback scripts folder if it doesn't exist
    rollback_folder = Path("../NFSShared/rollback")
    rollback_folder.mkdir(parents=True, exist_ok=True)

    # Generate unique filename with timestamp to avoid overwriting
    # Format: originalname_YYYYMMDD_HHMMSS.sql
    original_filename = file.filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename_without_ext = original_filename.rsplit('.', 1)[0]
    file_extension = original_filename.rsplit('.', 1)[1] if '.' in original_filename else 'sql'
    unique_filename = f"{filename_without_ext}_{timestamp}.{file_extension}"

    # Save file with unique name
    file_path = rollback_folder / unique_filename
    content = await file.read()
    file_size = len(content)

    with open(file_path, "wb") as f:
        f.write(content)

    # Create database record - store original filename for display/download
    script = models.RollbackScript(
        filename=original_filename,  # Store original filename
        file_path=str(file_path),     # Store actual file path with timestamp
        description=description,
        uploaded_by=uploaded_by,
        file_size=file_size,
        analysis_status='pending'
    )

    db.add(script)
    db.commit()
    db.refresh(script)

    return {
        "id": script.id,
        "filename": script.filename,
        "file_size": script.file_size,
        "uploaded_at": script.uploaded_at,
        "analysis_status": script.analysis_status
    }


@app.get("/rollback/scripts", tags=["📜 Rollback Scripts"])
def get_rollback_scripts(db: Session = Depends(get_db)):
    """Get all uploaded rollback scripts"""
    scripts = db.query(models.RollbackScript).order_by(models.RollbackScript.uploaded_at.desc()).all()

    result = []
    for script in scripts:
        result.append({
            "id": script.id,
            "script_name": script.filename,  # Frontend expects script_name
            "filename": script.filename,  # Keep for backward compatibility
            "description": script.description,
            "uploaded_by": script.uploaded_by,
            "uploaded_at": script.uploaded_at,
            "created_at": script.uploaded_at,  # Frontend expects created_at
            "updated_at": script.analysis_completed_at or script.uploaded_at,  # Frontend expects updated_at
            "file_size": script.file_size,
            "file_size_bytes": script.file_size,  # Frontend expects file_size_bytes
            "analysis_status": script.analysis_status,
            "analysis_started_at": script.analysis_started_at,
            "analysis_completed_at": script.analysis_completed_at,
            "error_message": script.error_message,
            "object_count": len(script.database_objects)
        })

    return result


@app.get("/rollback/{script_id}", tags=["📜 Rollback Scripts"])
def get_rollback_script_details(script_id: int, db: Session = Depends(get_db)):
    """Get detailed information about a specific script including identified objects"""
    script = db.query(models.RollbackScript).filter(models.RollbackScript.id == script_id).first()

    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    # Group objects by database and type
    objects_by_db = {}
    for obj in script.database_objects:
        db_name = obj.database_name or "default"
        if db_name not in objects_by_db:
            objects_by_db[db_name] = {
                "tables": [],
                "stored_procedures": [],
                "functions": [],
                "views": [],
                "triggers": [],
                "indexes": [],
                "user_types": [],
                "table_types": []
            }

        if obj.object_type == "table":
            objects_by_db[db_name]["tables"].append(obj.object_name)
        elif obj.object_type == "stored_procedure":
            objects_by_db[db_name]["stored_procedures"].append(obj.object_name)
        elif obj.object_type == "function":
            objects_by_db[db_name]["functions"].append(obj.object_name)
        elif obj.object_type == "view":
            objects_by_db[db_name]["views"].append(obj.object_name)
        elif obj.object_type == "trigger":
            objects_by_db[db_name]["triggers"].append(obj.object_name)
        elif obj.object_type == "index":
            objects_by_db[db_name]["indexes"].append(obj.object_name)
        elif obj.object_type == "user_type":
            objects_by_db[db_name]["user_types"].append(obj.object_name)
        elif obj.object_type == "table_type":
            objects_by_db[db_name]["table_types"].append(obj.object_name)

    return {
        "id": script.id,
        "filename": script.filename,
        "description": script.description,
        "uploaded_by": script.uploaded_by,
        "uploaded_at": script.uploaded_at,
        "file_size": script.file_size,
        "analysis_status": script.analysis_status,
        "analysis_started_at": script.analysis_started_at,
        "analysis_completed_at": script.analysis_completed_at,
        "error_message": script.error_message,
        "database_objects": objects_by_db
    }


@app.post("/rollback/{script_id}/analyze", tags=["📜 Rollback Scripts"])
async def analyze_rollback_script(script_id: int, db: Session = Depends(get_db)):
    """Analyze a script using Claude AI to identify database objects"""
    from claude_service import ClaudeAIService
    from datetime import datetime

    script = db.query(models.RollbackScript).filter(models.RollbackScript.id == script_id).first()

    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    # Update status to analyzing
    script.analysis_status = 'analyzing'
    script.analysis_started_at = datetime.utcnow()
    db.commit()

    try:
        # Read script content
        with open(script.file_path, 'r', encoding='utf-8') as f:
            script_content = f.read()

        # Analyze with Claude AI
        claude_service = ClaudeAIService()
        analysis_result = await claude_service.analyze_database_script(script_content)

        # Clear existing objects
        db.query(models.RollbackDatabaseObject).filter(
            models.RollbackDatabaseObject.script_id == script_id
        ).delete()

        # Store identified objects
        if "DbDetails" in analysis_result:
            for db_detail in analysis_result["DbDetails"]:
                db_name = db_detail.get("DbName", "")

                # Tables
                for table_name in db_detail.get("TableNames", []):
                    obj = models.RollbackDatabaseObject(
                        script_id=script_id,
                        database_name=db_name,
                        object_type="table",
                        object_name=table_name
                    )
                    db.add(obj)

                # Stored Procedures
                for sp_name in db_detail.get("SpNames", []):
                    obj = models.RollbackDatabaseObject(
                        script_id=script_id,
                        database_name=db_name,
                        object_type="stored_procedure",
                        object_name=sp_name
                    )
                    db.add(obj)

                # Functions
                for func_name in db_detail.get("FunctionNames", []):
                    obj = models.RollbackDatabaseObject(
                        script_id=script_id,
                        database_name=db_name,
                        object_type="function",
                        object_name=func_name
                    )
                    db.add(obj)

                # Views
                for view_name in db_detail.get("Views", []):
                    obj = models.RollbackDatabaseObject(
                        script_id=script_id,
                        database_name=db_name,
                        object_type="view",
                        object_name=view_name
                    )
                    db.add(obj)

                # Triggers
                for trigger_name in db_detail.get("Triggers", []):
                    obj = models.RollbackDatabaseObject(
                        script_id=script_id,
                        database_name=db_name,
                        object_type="trigger",
                        object_name=trigger_name
                    )
                    db.add(obj)

                # Indexes
                for index_name in db_detail.get("Indexes", []):
                    obj = models.RollbackDatabaseObject(
                        script_id=script_id,
                        database_name=db_name,
                        object_type="index",
                        object_name=index_name
                    )
                    db.add(obj)

                # User Types
                for user_type in db_detail.get("UserTypes", []):
                    obj = models.RollbackDatabaseObject(
                        script_id=script_id,
                        database_name=db_name,
                        object_type="user_type",
                        object_name=user_type
                    )
                    db.add(obj)

                # Table Types
                for table_type in db_detail.get("TableTypes", []):
                    obj = models.RollbackDatabaseObject(
                        script_id=script_id,
                        database_name=db_name,
                        object_type="table_type",
                        object_name=table_type
                    )
                    db.add(obj)

        # Update script status
        script.analysis_status = 'completed'
        script.analysis_completed_at = datetime.utcnow()
        script.error_message = None
        db.commit()

        return {"success": True, "message": "Analysis completed", "objects_found": len(script.database_objects)}

    except Exception as e:
        script.analysis_status = 'failed'
        script.analysis_completed_at = datetime.utcnow()
        script.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/rollback/{script_id}/download", tags=["📜 Rollback Scripts"])
def download_rollback_script(script_id: int, db: Session = Depends(get_db)):
    """Download the original SQL script file"""
    from fastapi.responses import FileResponse

    script = db.query(models.RollbackScript).filter(models.RollbackScript.id == script_id).first()

    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    if not os.path.exists(script.file_path):
        raise HTTPException(status_code=404, detail="Script file not found on disk")

    return FileResponse(
        path=script.file_path,
        filename=script.filename,
        media_type='application/sql'
    )


@app.delete("/rollback/{script_id}", tags=["📜 Rollback Scripts"])
def delete_rollback_script(script_id: int, db: Session = Depends(get_db)):
    """Delete a rollback script and its file"""
    script = db.query(models.RollbackScript).filter(models.RollbackScript.id == script_id).first()

    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    # Delete file
    if os.path.exists(script.file_path):
        os.remove(script.file_path)

    # Delete database record (cascade will delete related objects)
    db.delete(script)
    db.commit()

    return {"success": True, "message": "Script deleted"}


# ==============================================
# EMAIL ALERTS ENDPOINTS
# ==============================================

class EmailAlertCreate(BaseModel):
    subject: str
    sender: str
    sender_email: str
    preview: Optional[str] = None
    body: Optional[str] = None
    category: str = "inbox"
    priority: str = "medium"
    has_attachment: bool = False
    customer_id: Optional[int] = None

class EmailAlertUpdate(BaseModel):
    category: Optional[str] = None
    is_read: Optional[bool] = None
    is_starred: Optional[bool] = None
    priority: Optional[str] = None

def format_email_alert(email):
    """Format email alert for API response"""
    return {
        "id": email.id,
        "subject": email.subject,
        "sender": email.sender,
        "senderEmail": email.sender_email,
        "preview": email.preview,
        "body": email.body,
        "receivedAt": email.received_at.isoformat() if email.received_at else None,
        "category": email.category,
        "isRead": email.is_read,
        "isStarred": email.is_starred,
        "hasAttachment": email.has_attachment,
        "priority": email.priority,
        "customerId": email.customer_id
    }

@app.get("/email-alerts", tags=["📧 Email Alerts"])
def get_email_alerts(
    customer_id: Optional[int] = None,
    category: Optional[str] = None,
    is_read: Optional[bool] = None,
    is_starred: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """Get all email alerts with optional filters"""
    query = db.query(models.EmailAlert)

    if customer_id is not None:
        query = query.filter(models.EmailAlert.customer_id == customer_id)
    if category is not None:
        query = query.filter(models.EmailAlert.category == category)
    if is_read is not None:
        query = query.filter(models.EmailAlert.is_read == is_read)
    if is_starred is not None:
        query = query.filter(models.EmailAlert.is_starred == is_starred)

    emails = query.order_by(models.EmailAlert.received_at.desc()).all()
    return [format_email_alert(email) for email in emails]

@app.get("/email-alerts/{email_id}", tags=["📧 Email Alerts"])
def get_email_alert(email_id: int, db: Session = Depends(get_db)):
    """Get a specific email alert by ID"""
    email = db.query(models.EmailAlert).filter(models.EmailAlert.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email alert not found")
    return format_email_alert(email)

@app.post("/email-alerts", tags=["📧 Email Alerts"])
def create_email_alert(email_data: EmailAlertCreate, db: Session = Depends(get_db)):
    """Create a new email alert"""
    email = models.EmailAlert(
        subject=email_data.subject,
        sender=email_data.sender,
        sender_email=email_data.sender_email,
        preview=email_data.preview,
        body=email_data.body,
        category=email_data.category,
        priority=email_data.priority,
        has_attachment=email_data.has_attachment,
        customer_id=email_data.customer_id
    )
    db.add(email)
    db.commit()
    db.refresh(email)
    return format_email_alert(email)

@app.patch("/email-alerts/{email_id}", tags=["📧 Email Alerts"])
def update_email_alert(email_id: int, email_data: EmailAlertUpdate, db: Session = Depends(get_db)):
    """Update an email alert (category, read status, starred status, priority)"""
    email = db.query(models.EmailAlert).filter(models.EmailAlert.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email alert not found")

    if email_data.category is not None:
        if email_data.category not in ['inbox', 'ignorable', 'moderate', 'critical', 'resolved']:
            raise HTTPException(status_code=400, detail="Invalid category")
        email.category = email_data.category
    if email_data.is_read is not None:
        email.is_read = email_data.is_read
    if email_data.is_starred is not None:
        email.is_starred = email_data.is_starred
    if email_data.priority is not None:
        if email_data.priority not in ['low', 'medium', 'high']:
            raise HTTPException(status_code=400, detail="Invalid priority")
        email.priority = email_data.priority

    db.commit()
    db.refresh(email)
    return format_email_alert(email)

@app.delete("/email-alerts/{email_id}", tags=["📧 Email Alerts"])
def delete_email_alert(email_id: int, db: Session = Depends(get_db)):
    """Delete an email alert"""
    email = db.query(models.EmailAlert).filter(models.EmailAlert.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email alert not found")

    db.delete(email)
    db.commit()
    return {"success": True, "message": "Email alert deleted"}

@app.get("/email-alerts/stats/summary", tags=["📧 Email Alerts"])
def get_email_alerts_stats(customer_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Get email alerts statistics summary"""
    query = db.query(models.EmailAlert)
    if customer_id is not None:
        query = query.filter(models.EmailAlert.customer_id == customer_id)

    emails = query.all()

    stats = {
        "total": len(emails),
        "unread": sum(1 for e in emails if not e.is_read),
        "starred": sum(1 for e in emails if e.is_starred),
        "byCategory": {
            "inbox": sum(1 for e in emails if e.category == "inbox"),
            "ignorable": sum(1 for e in emails if e.category == "ignorable"),
            "moderate": sum(1 for e in emails if e.category == "moderate"),
            "critical": sum(1 for e in emails if e.category == "critical"),
            "resolved": sum(1 for e in emails if e.category == "resolved")
        },
        "byPriority": {
            "high": sum(1 for e in emails if e.priority == "high"),
            "medium": sum(1 for e in emails if e.priority == "medium"),
            "low": sum(1 for e in emails if e.priority == "low")
        }
    }

    return stats


# ==============================================
# EMAIL CONFIGURATION ENDPOINTS
# ==============================================

from email_service import (
    encrypt_password, decrypt_password, test_email_connection,
    fetch_emails_imap, fetch_emails_pop3
)

class EmailConfigCreate(BaseModel):
    name: str
    email_address: str
    server_type: str = "imap"
    server_host: str
    server_port: int = 993
    username: str
    password: str
    use_ssl: bool = True
    folder: str = "INBOX"
    customer_id: Optional[int] = None

class EmailConfigUpdate(BaseModel):
    name: Optional[str] = None
    email_address: Optional[str] = None
    server_type: Optional[str] = None
    server_host: Optional[str] = None
    server_port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    use_ssl: Optional[bool] = None
    folder: Optional[str] = None
    is_active: Optional[bool] = None

def format_email_config(config, include_password: bool = False):
    """Format email config for API response"""
    result = {
        "id": config.id,
        "name": config.name,
        "emailAddress": config.email_address,
        "serverType": config.server_type,
        "serverHost": config.server_host,
        "serverPort": config.server_port,
        "username": config.username,
        "useSsl": config.use_ssl,
        "folder": config.folder,
        "isActive": config.is_active,
        "lastSyncAt": config.last_sync_at.isoformat() if config.last_sync_at else None,
        "lastSyncStatus": config.last_sync_status,
        "lastSyncMessage": config.last_sync_message,
        "customerId": config.customer_id,
        "createdAt": config.created_at.isoformat() if config.created_at else None
    }
    if include_password:
        result["password"] = "********"  # Never expose actual password
    return result

@app.get("/email-configs", tags=["📧 Email Configuration"])
def get_email_configs(customer_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Get all email configurations"""
    query = db.query(models.EmailConfig)
    if customer_id is not None:
        query = query.filter(models.EmailConfig.customer_id == customer_id)
    configs = query.all()
    return [format_email_config(c) for c in configs]

@app.get("/email-configs/{config_id}", tags=["📧 Email Configuration"])
def get_email_config(config_id: int, db: Session = Depends(get_db)):
    """Get a specific email configuration"""
    config = db.query(models.EmailConfig).filter(models.EmailConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Email configuration not found")
    return format_email_config(config)

@app.post("/email-configs", tags=["📧 Email Configuration"])
def create_email_config(config_data: EmailConfigCreate, db: Session = Depends(get_db)):
    """Create a new email configuration"""
    # Encrypt password before storing
    encrypted_password = encrypt_password(config_data.password)

    config = models.EmailConfig(
        name=config_data.name,
        email_address=config_data.email_address,
        server_type=config_data.server_type,
        server_host=config_data.server_host,
        server_port=config_data.server_port,
        username=config_data.username,
        password_encrypted=encrypted_password,
        use_ssl=config_data.use_ssl,
        folder=config_data.folder,
        customer_id=config_data.customer_id
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return format_email_config(config)

@app.put("/email-configs/{config_id}", tags=["📧 Email Configuration"])
def update_email_config(config_id: int, config_data: EmailConfigUpdate, db: Session = Depends(get_db)):
    """Update an email configuration"""
    config = db.query(models.EmailConfig).filter(models.EmailConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Email configuration not found")

    if config_data.name is not None:
        config.name = config_data.name
    if config_data.email_address is not None:
        config.email_address = config_data.email_address
    if config_data.server_type is not None:
        config.server_type = config_data.server_type
    if config_data.server_host is not None:
        config.server_host = config_data.server_host
    if config_data.server_port is not None:
        config.server_port = config_data.server_port
    if config_data.username is not None:
        config.username = config_data.username
    if config_data.password is not None:
        config.password_encrypted = encrypt_password(config_data.password)
    if config_data.use_ssl is not None:
        config.use_ssl = config_data.use_ssl
    if config_data.folder is not None:
        config.folder = config_data.folder
    if config_data.is_active is not None:
        config.is_active = config_data.is_active

    db.commit()
    db.refresh(config)
    return format_email_config(config)

@app.delete("/email-configs/{config_id}", tags=["📧 Email Configuration"])
def delete_email_config(config_id: int, db: Session = Depends(get_db)):
    """Delete an email configuration"""
    config = db.query(models.EmailConfig).filter(models.EmailConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Email configuration not found")

    db.delete(config)
    db.commit()
    return {"success": True, "message": "Email configuration deleted"}

@app.post("/email-configs/test-connection", tags=["📧 Email Configuration"])
def test_email_config_connection(config_data: EmailConfigCreate):
    """Test email server connection without saving"""
    result = test_email_connection(
        server_type=config_data.server_type,
        host=config_data.server_host,
        port=config_data.server_port,
        username=config_data.username,
        password=config_data.password,
        use_ssl=config_data.use_ssl
    )
    return result

@app.post("/email-configs/{config_id}/test", tags=["📧 Email Configuration"])
def test_saved_email_config(config_id: int, db: Session = Depends(get_db)):
    """Test a saved email configuration"""
    config = db.query(models.EmailConfig).filter(models.EmailConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Email configuration not found")

    # Decrypt password for testing
    password = decrypt_password(config.password_encrypted)

    result = test_email_connection(
        server_type=config.server_type,
        host=config.server_host,
        port=config.server_port,
        username=config.username,
        password=password,
        use_ssl=config.use_ssl
    )
    return result

@app.post("/email-configs/{config_id}/sync", tags=["📧 Email Configuration"])
def sync_emails_from_config(
    config_id: int,
    limit: int = Query(50, description="Maximum number of emails to fetch"),
    db: Session = Depends(get_db)
):
    """Fetch emails from configured email server and store them"""
    config = db.query(models.EmailConfig).filter(models.EmailConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Email configuration not found")

    if not config.is_active:
        raise HTTPException(status_code=400, detail="Email configuration is not active")

    try:
        # Decrypt password
        password = decrypt_password(config.password_encrypted)

        # Fetch emails based on server type
        if config.server_type == 'imap':
            emails = fetch_emails_imap(
                host=config.server_host,
                port=config.server_port,
                username=config.username,
                password=password,
                use_ssl=config.use_ssl,
                folder=config.folder,
                limit=limit
            )
        else:
            emails = fetch_emails_pop3(
                host=config.server_host,
                port=config.server_port,
                username=config.username,
                password=password,
                use_ssl=config.use_ssl,
                limit=limit
            )

        # Store emails in database
        new_count = 0
        updated_count = 0

        for email_data in emails:
            # Check if email already exists (by message_id or subject+sender+date)
            existing = db.query(models.EmailAlert).filter(
                models.EmailAlert.subject == email_data['subject'],
                models.EmailAlert.sender_email == email_data['sender_email'],
                models.EmailAlert.customer_id == config.customer_id
            ).first()

            if existing:
                # Update existing email if needed
                if not existing.body and email_data['body']:
                    existing.body = email_data['body']
                    updated_count += 1
            else:
                # Create new email alert
                new_email = models.EmailAlert(
                    subject=email_data['subject'],
                    sender=email_data['sender'],
                    sender_email=email_data['sender_email'],
                    preview=email_data['preview'],
                    body=email_data['body'],
                    received_at=datetime.fromisoformat(email_data['received_at'].replace('Z', '+00:00')) if email_data['received_at'] else datetime.now(),
                    category='inbox',
                    is_read=email_data['is_read'],
                    is_starred=False,
                    has_attachment=email_data['has_attachment'],
                    priority=email_data['priority'],
                    customer_id=config.customer_id
                )
                db.add(new_email)
                new_count += 1

        # Update sync status
        config.last_sync_at = datetime.now()
        config.last_sync_status = 'success'
        config.last_sync_message = f'Fetched {len(emails)} emails. {new_count} new, {updated_count} updated.'

        db.commit()

        return {
            "success": True,
            "message": config.last_sync_message,
            "totalFetched": len(emails),
            "newEmails": new_count,
            "updatedEmails": updated_count
        }

    except Exception as e:
        # Update sync status with error
        config.last_sync_at = datetime.now()
        config.last_sync_status = 'failed'
        config.last_sync_message = str(e)
        db.commit()

        raise HTTPException(status_code=500, detail=f"Failed to sync emails: {str(e)}")

@app.get("/email-configs/presets/common", tags=["📧 Email Configuration"])
def get_common_email_presets():
    """Get common email server presets for easy configuration"""
    return [
        {
            "name": "Gmail",
            "serverType": "imap",
            "serverHost": "imap.gmail.com",
            "serverPort": 993,
            "useSsl": True,
            "note": "Enable 'Less secure app access' or use App Password"
        },
        {
            "name": "Outlook/Office 365",
            "serverType": "imap",
            "serverHost": "outlook.office365.com",
            "serverPort": 993,
            "useSsl": True,
            "note": "Use your Microsoft account credentials"
        },
        {
            "name": "Yahoo Mail",
            "serverType": "imap",
            "serverHost": "imap.mail.yahoo.com",
            "serverPort": 993,
            "useSsl": True,
            "note": "Generate an App Password in Yahoo settings"
        },
        {
            "name": "iCloud Mail",
            "serverType": "imap",
            "serverHost": "imap.mail.me.com",
            "serverPort": 993,
            "useSsl": True,
            "note": "Generate an App-Specific Password"
        },
        {
            "name": "Zoho Mail",
            "serverType": "imap",
            "serverHost": "imap.zoho.com",
            "serverPort": 993,
            "useSsl": True,
            "note": "Enable IMAP in Zoho settings"
        },
        {
            "name": "Custom IMAP",
            "serverType": "imap",
            "serverHost": "",
            "serverPort": 993,
            "useSsl": True,
            "note": "Enter your custom IMAP server details"
        },
        {
            "name": "Custom POP3",
            "serverType": "pop3",
            "serverHost": "",
            "serverPort": 995,
            "useSsl": True,
            "note": "Enter your custom POP3 server details"
        }
    ]


# ==============================================
# K8S / ARGOCD / PROMETHEUS
# ==============================================

# In-memory store for K8s metrics.
# Keys are "{agent_uuid}:{cluster_name}" to support multiple clusters per agent.
_k8s_metrics_store: dict = {}        # latest snapshot per (agent, cluster)
_k8s_metrics_history: dict = {}      # trimmed sparkline history per (agent, cluster) — max 60 points
_k8s_metrics_full_history: dict = {} # full snapshot history per (agent, cluster) — max 120 points for datetime filter

# In-memory store for service log file content (keyed by "{agent_uuid}:{service_name}:{file_name}").
# Content is pushed by the agent via a dedicated endpoint to avoid routing large
# payloads through the generic command-result mechanism (which can hit IIS body limits).
_service_log_content_store: dict = {}

@app.post("/agents/service-log-content", tags=["🤖 Agent - File Logs"])
def receive_service_log_content(agent_uuid: str = Depends(get_agent_uuid), payload: dict = Body(...), db: Session = Depends(get_db)):
    """Agent pushes log file content here. Stored in memory so the UI can retrieve it."""
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    service_name = payload.get("service_name", "")
    file_name = payload.get("file_name", "")
    if not service_name or not file_name:
        raise HTTPException(status_code=400, detail="service_name and file_name are required")
    key = f"{agent_uuid}:{service_name}:{file_name}"
    _service_log_content_store[key] = payload
    return {"success": True}

@app.get("/agents/service-log-content", tags=["🌐 UI - File Logs"])
def get_service_log_content(
    agent_uuid: str = Depends(get_agent_uuid),
    service_name: str = Query(...),
    file_name: str = Query(...),
    db: Session = Depends(get_db)
):
    """UI retrieves log file content that the agent previously pushed."""
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    key = f"{agent_uuid}:{service_name}:{file_name}"
    data = _service_log_content_store.pop(key, None)  # consume once — free memory
    if data is None:
        raise HTTPException(status_code=404, detail="Content not available yet")
    return data

@app.post("/agents/k8s-metrics", tags=["🤖 Agent - K8s"])
def receive_k8s_metrics(agent_uuid: str = Depends(get_agent_uuid), payload: dict = Body(...), db: Session = Depends(get_db)):
    """Receive K8s observability snapshot from a Prometheus-enabled agent. Payload must include cluster_name."""
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    cluster_name = payload.get("cluster_name") or "default"
    key = f"{agent_uuid}:{cluster_name}"

    _k8s_metrics_store[key] = payload

    # Full snapshot history for datetime filter (max 120 points per cluster)
    if key not in _k8s_metrics_full_history:
        _k8s_metrics_full_history[key] = []
    full_hist = _k8s_metrics_full_history[key]
    full_hist.append(payload)
    if len(full_hist) > 120:
        full_hist.pop(0)

    # Trimmed sparkline history (max 60 points per cluster)
    if key not in _k8s_metrics_history:
        _k8s_metrics_history[key] = []
    history = _k8s_metrics_history[key]
    history.append({
        "collected_at": payload.get("collected_at"),
        "cluster_name": cluster_name,
        "namespace_cpu_usage_cores": payload.get("namespace_cpu_usage_cores", 0),
        "namespace_memory_usage_bytes": payload.get("namespace_memory_usage_bytes", 0),
        "pod_count": len(payload.get("pods", [])),
        "node_count": len(payload.get("nodes", [])),
        "alert_count": len(payload.get("firing_alerts", [])),
    })
    if len(history) > 60:
        history.pop(0)

    return {"success": True}

_K8S_EMPTY_SNAPSHOT = {
    "collected_at": None,
    "nodes": [], "pods": [], "deployments": [], "firing_alerts": [],
    "cluster_cpu_cores_total": 0, "cluster_memory_bytes_total": 0,
    "namespace_cpu_usage_cores": 0, "namespace_cpu_requests_cores": 0, "namespace_cpu_limits_cores": 0,
    "namespace_memory_usage_bytes": 0, "namespace_memory_requests_bytes": 0, "namespace_memory_limits_bytes": 0,
    "resource_counts": {},
    "pod_phase_running": 0, "pod_phase_pending": 0, "pod_phase_failed": 0,
    "pod_phase_succeeded": 0, "pod_phase_unknown": 0,
    "containers_running": 0, "containers_waiting": 0, "containers_terminated": 0,
    "container_restarts_last30m": 0,
    "network_receive_bytes_per_sec": 0, "network_transmit_bytes_per_sec": 0,
    "disk_read_bytes_per_sec": 0, "disk_write_bytes_per_sec": 0,
    "jobs_succeeded": 0, "jobs_active": 0, "jobs_failed": 0,
    "nodes_total": 0, "nodes_unschedulable": 0,
}

@app.get("/agents/k8s-clusters", tags=["🌐 UI - K8s"])
def get_k8s_clusters(agent_uuid: str = Depends(get_agent_uuid), db: Session = Depends(get_db)):
    """List all cluster names that have reported metrics for this agent."""
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    prefix = f"{agent_uuid}:"
    clusters = sorted({k[len(prefix):] for k in _k8s_metrics_store if k.startswith(prefix)})
    return clusters

@app.get("/agents/k8s-metrics", tags=["🌐 UI - K8s"])
def get_k8s_metrics(
    agent_uuid: str = Depends(get_agent_uuid),
    cluster_name: Optional[str] = Query(None, description="Cluster name. Omit to get the first available cluster."),
    at: Optional[str] = Query(None, description="ISO datetime to retrieve closest historical snapshot"),
    db: Session = Depends(get_db)
):
    """Get latest K8s observability snapshot for an agent + cluster, or closest snapshot to a given datetime."""
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Resolve cluster key — fall back to first available if not specified
    if cluster_name:
        key = f"{agent_uuid}:{cluster_name}"
    else:
        prefix = f"{agent_uuid}:"
        candidates = [k for k in _k8s_metrics_store if k.startswith(prefix)]
        key = candidates[0] if candidates else f"{agent_uuid}:default"

    if at:
        try:
            target_dt = datetime.fromisoformat(at.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid datetime format. Use ISO 8601.")

        full_hist = _k8s_metrics_full_history.get(key, [])
        if not full_hist:
            return {**_K8S_EMPTY_SNAPSHOT, "collected_at": None, "_historical_note": "No history available"}

        def parse_dt(snap):
            try:
                ts = snap.get("collected_at", "")
                if not ts:
                    return datetime.min
                return datetime.fromisoformat(str(ts).replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                return datetime.min

        target_naive = target_dt.replace(tzinfo=None)
        closest = min(full_hist, key=lambda s: abs((parse_dt(s) - target_naive).total_seconds()))
        return {**_K8S_EMPTY_SNAPSHOT, **closest}

    return {**_K8S_EMPTY_SNAPSHOT, **_k8s_metrics_store.get(key, {})}

@app.get("/agents/k8s-metrics/history", tags=["🌐 UI - K8s"])
def get_k8s_metrics_history(
    agent_uuid: str = Depends(get_agent_uuid),
    cluster_name: Optional[str] = Query(None, description="Cluster name. Omit to get the first available cluster."),
    db: Session = Depends(get_db)
):
    """Get time-series history of K8s metrics for sparklines."""
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if cluster_name:
        key = f"{agent_uuid}:{cluster_name}"
    else:
        prefix = f"{agent_uuid}:"
        candidates = [k for k in _k8s_metrics_history if k.startswith(prefix)]
        key = candidates[0] if candidates else f"{agent_uuid}:default"

    return _k8s_metrics_history.get(key, [])

@app.post("/agents/k8s-onboard", tags=["🌐 UI - K8s"])
def k8s_onboard_application(agent_uuid: str = Depends(get_agent_uuid), payload: dict = Body(...), db: Session = Depends(get_db)):
    """
    Send a k8s_onboard command to an agent — creates an ArgoCD Application for a new workload.
    payload: { app_name, namespace, helm_repo_url, helm_chart_name, helm_chart_version,
               image_repository, image_tag, replicas, helm_values }
    """
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    import json as _json
    command = models.AgentCommand(
        agent_id=agent.id,
        command_type="k8s_onboard",
        command_data=_json.dumps(payload),
        status="pending"
    )
    db.add(command)
    db.commit()
    db.refresh(command)
    return {"success": True, "command_id": command.id}

@app.post("/agents/k8s-sync", tags=["🌐 UI - K8s"])
def k8s_sync_application(agent_uuid: str = Depends(get_agent_uuid), payload: dict = Body(...), db: Session = Depends(get_db)):
    """
    Send a k8s_argocd_sync command to an agent — updates image tag and triggers ArgoCD sync.
    payload: { app_name, image_repository, image_tag }
    """
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    import json as _json
    command = models.AgentCommand(
        agent_id=agent.id,
        command_type="k8s_argocd_sync",
        command_data=_json.dumps(payload),
        status="pending"
    )
    db.add(command)
    db.commit()
    db.refresh(command)
    return {"success": True, "command_id": command.id}


# ==============================================
# ALERT SETTINGS & SUMMARY
# ==============================================

_ALERT_DEFAULTS = {
    "cpu_alert_threshold": "80",
    "ram_alert_threshold": "80",
    "alert_refresh_interval": "30",
}

def _get_alert_settings(db: Session) -> dict:
    rows = db.query(models.AlertSettings).all()
    settings = dict(_ALERT_DEFAULTS)
    for row in rows:
        settings[row.key] = row.value
    return settings

def _upsert_setting(db: Session, key: str, value: str):
    row = db.query(models.AlertSettings).filter(models.AlertSettings.key == key).first()
    if row:
        row.value = value
    else:
        db.add(models.AlertSettings(key=key, value=value))

@app.get("/settings/alerts", tags=["🌐 UI - Dashboard"])
def get_alert_settings_endpoint(db: Session = Depends(get_db)):
    """Get alert threshold settings."""
    raw = _get_alert_settings(db)
    return {
        "cpu_alert_threshold": int(raw["cpu_alert_threshold"]),
        "ram_alert_threshold": int(raw["ram_alert_threshold"]),
        "alert_refresh_interval": int(raw["alert_refresh_interval"]),
    }

class AlertSettingsUpdate(BaseModel):
    cpu_alert_threshold: Optional[int] = None
    ram_alert_threshold: Optional[int] = None
    alert_refresh_interval: Optional[int] = None

@app.put("/settings/alerts", tags=["🌐 UI - Dashboard"])
def update_alert_settings(body: AlertSettingsUpdate, db: Session = Depends(get_db)):
    """Update alert threshold settings."""
    if body.cpu_alert_threshold is not None:
        _upsert_setting(db, "cpu_alert_threshold", str(body.cpu_alert_threshold))
    if body.ram_alert_threshold is not None:
        _upsert_setting(db, "ram_alert_threshold", str(body.ram_alert_threshold))
    if body.alert_refresh_interval is not None:
        _upsert_setting(db, "alert_refresh_interval", str(body.alert_refresh_interval))
    db.commit()
    return get_alert_settings_endpoint(db)

@app.get("/alerts/summary", tags=["🌐 UI - Dashboard"])
def get_alerts_summary(db: Session = Depends(get_db)):
    """Return all agents that have at least one active alert (CPU, RAM, stopped services, failed/evicted pods)."""
    raw = _get_alert_settings(db)
    cpu_threshold = int(raw["cpu_alert_threshold"])
    ram_threshold = int(raw["ram_alert_threshold"])

    agents = db.query(models.Agent).all()

    result = []
    for agent in agents:
        alerts: dict = {}

        # CPU
        if agent.cpu is not None and agent.cpu > cpu_threshold:
            alerts["cpu"] = {"value": agent.cpu, "threshold": cpu_threshold}

        # RAM
        if agent.memory is not None and agent.memory > ram_threshold:
            alerts["ram"] = {"value": agent.memory, "threshold": ram_threshold}

        # Stopped Windows services (latest report per agent)
        stopped = (
            db.query(models.AgentWindowsService)
            .filter(
                models.AgentWindowsService.agent_id == agent.id,
                models.AgentWindowsService.status == "Stopped",
            )
            .all()
        )
        if stopped:
            alerts["stopped_services"] = [
                {"name": s.service_name, "display_name": s.display_name}
                for s in stopped
            ]

        # Failed / Evicted pods from in-memory K8s store
        agent_prefix = f"{agent.uuid}:"
        failed_pods = []
        for key, payload in _k8s_metrics_store.items():
            if not key.startswith(agent_prefix):
                continue
            cluster_name = key[len(agent_prefix):]
            for pod in payload.get("pods", []):
                phase = pod.get("phase", "")
                reason = pod.get("reason", "")
                if phase in ("Failed", "Unknown") or reason == "Evicted":
                    failed_pods.append({
                        "cluster": cluster_name,
                        "namespace": pod.get("namespace"),
                        "name": pod.get("name"),
                        "phase": phase,
                        "reason": reason,
                    })
        if failed_pods:
            alerts["failed_pods"] = failed_pods

        if not alerts:
            continue

        customer = db.query(models.Customer).filter(models.Customer.id == agent.customer_id).first()
        result.append({
            "agent_id": agent.id,
            "agent_uuid": agent.uuid,
            "agent_name": agent.name,
            "agent_status": agent.status,
            "customer_id": agent.customer_id,
            "customer_name": customer.display_name if customer else "Unknown",
            "last_seen": agent.last_seen.isoformat() if agent.last_seen else None,
            "alerts": alerts,
        })

    return result


# ==============================================
# RUN SERVER
# ==============================================

if __name__ == "__main__":
    # Run server with settings from config
    uvicorn.run(
        "main:app",
        host=app_config.get_server_host(),
        port=app_config.get_server_port(),
        reload=app_config.get_server_reload()
    )
