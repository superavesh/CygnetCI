"""Agent-facing task and command execution endpoints (agent polling)."""
import json
from datetime import datetime

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models
from deps import get_agent_uuid

router = APIRouter()

# ==============================================
# AGENT COMMUNICATION ENDPOINTS
# ==============================================

# Agent heartbeat moved to routers/agents.py

@router.get("/tasks/agent/pending", tags=["🤖 Agent - Task Execution"])
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

@router.post("/tasks/{task_id}/logs", tags=["🤖 Agent - Task Execution"])
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

@router.post("/tasks/{task_id}/complete", tags=["🤖 Agent - Task Execution"])
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

@router.get("/commands/agent/pending", tags=["🤖 Agent - Task Execution"])
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

@router.post("/commands/{command_id}/start", tags=["🤖 Agent - Task Execution"])
def start_command(command_id: int, db: Session = Depends(get_db)):
    """Mark command as started by agent"""
    command = db.query(models.AgentCommand).filter(models.AgentCommand.id == command_id).first()

    if not command:
        raise HTTPException(status_code=404, detail="Command not found")

    command.status = "in_progress"
    command.started_at = datetime.now()
    db.commit()

    return {"success": True, "message": "Command started"}

@router.post("/commands/{command_id}/complete", tags=["🤖 Agent - Task Execution"])
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

# Release pickup endpoints moved to routers/releases.py

# Pipeline pickup endpoints moved to routers/pipelines.py

# User management endpoints moved to routers/users.py

# Roles & permissions endpoints moved to routers/roles.py

# Audit log endpoints moved to routers/audit.py

# Rollback script endpoints moved to routers/rollback.py

# Email alerts + configuration endpoints moved to routers/email.py

# Ticketing endpoints moved to routers/tickets.py
