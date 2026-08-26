"""Agent endpoints: UI agent management, registration, and heartbeat."""
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models
from enums import LogLevel
from formatters import format_agent
from deps import get_agent_uuid, require_permission, get_allowed_customer_ids, require_customer_access

router = APIRouter()

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


# ==================== AGENTS ====================

@router.get("/agents", tags=["🌐 UI - Agents"])
def get_agents(
    customer_id: int = None,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("agents", "read")),
    allowed: Optional[list] = Depends(get_allowed_customer_ids),
):
    """Get all agents with automatic status update based on last heartbeat, scoped to
    the caller's assigned customers (superusers see all)"""
    if customer_id is not None:
        require_customer_access(customer_id, allowed)

    agents_query = db.query(models.Agent)
    if customer_id is not None:
        agents_query = agents_query.filter(models.Agent.customer_id == customer_id)
    elif allowed is not None:
        agents_query = agents_query.filter(models.Agent.customer_id.in_(allowed))
    agents = agents_query.all()

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

@router.post("/agents", tags=["🤖 Agent - Registration & Health"])
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

@router.get("/agents/{agent_id:int}", tags=["🌐 UI - Agents"])
def get_agent(
    agent_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("agents", "read")),
    allowed: Optional[list] = Depends(get_allowed_customer_ids),
):
    """Get agent by ID"""
    agent = db.query(models.Agent).filter(models.Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    require_customer_access(agent.customer_id, allowed)
    return format_agent(agent)

@router.put("/agents/{agent_id:int}", tags=["🌐 UI - Agents"])
def update_agent(
    agent_id: int,
    agent: AgentUpdate,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("agents", "update")),
    allowed: Optional[list] = Depends(get_allowed_customer_ids),
):
    """Update an existing agent"""
    db_agent = db.query(models.Agent).filter(models.Agent.id == agent_id).first()
    if not db_agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    require_customer_access(db_agent.customer_id, allowed)

    if agent.name is not None:
        db_agent.name = agent.name
    if agent.description is not None:
        db_agent.description = agent.description
    if agent.location is not None:
        db_agent.location = agent.location
    
    db.commit()
    db.refresh(db_agent)
    
    return format_agent(db_agent)

@router.delete("/agents/{agent_id:int}", tags=["🌐 UI - Agents"])
def delete_agent(
    agent_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("agents", "delete")),
    allowed: Optional[list] = Depends(get_allowed_customer_ids),
):
    """Delete an agent"""
    db_agent = db.query(models.Agent).filter(models.Agent.id == agent_id).first()
    if not db_agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    require_customer_access(db_agent.customer_id, allowed)

    db.delete(db_agent)
    db.commit()

    return {"success": True, "message": "Agent deleted successfully"}

@router.get("/agents/{agent_id:int}/logs", tags=["🌐 UI - Agents"])
def get_agent_logs(
    agent_id: int,
    limit: int = Query(50, ge=1, le=500),
    level: Optional[LogLevel] = None,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("agents", "read")),
    allowed: Optional[list] = Depends(get_allowed_customer_ids),
):
    """Get health logs for an agent"""
    agent = db.query(models.Agent).filter(models.Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    require_customer_access(agent.customer_id, allowed)

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


@router.post("/agents/heartbeat", tags=["🤖 Agent - Registration & Health"])
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
