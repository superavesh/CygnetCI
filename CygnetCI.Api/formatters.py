"""Response formatting helpers (moved out of main.py)."""
from datetime import datetime
from sqlalchemy.orm import Session

import models


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
    steps = db.query(models.PipelineStep)\
        .filter(models.PipelineStep.pipeline_id == pipeline.id)\
        .order_by(models.PipelineStep.step_order)\
        .all()

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
