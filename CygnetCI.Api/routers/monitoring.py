"""Monitoring endpoints: agent metrics, services, drives, website pings, service logs, and agent report."""
import json
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models
from deps import get_agent_uuid, require_permission, get_allowed_customer_ids, require_customer_access
from routers.k8s import _k8s_metrics_store  # shared in-memory store (by reference)

router = APIRouter()

# ==================== MONITORING ====================

@router.get("/monitoring/agents/metrics", tags=["🌐 UI - Monitoring"])
def get_agents_metrics(
    customer_id: int = None,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("monitoring", "read")),
    allowed: Optional[list] = Depends(get_allowed_customer_ids),
):
    """Get current metrics for all agents, scoped to the caller's assigned customers"""
    if customer_id is not None:
        require_customer_access(customer_id, allowed)

    query = db.query(models.Agent)
    if customer_id is not None:
        query = query.filter(models.Agent.customer_id == customer_id)
    elif allowed is not None:
        query = query.filter(models.Agent.customer_id.in_(allowed))
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

@router.get("/monitoring/agents/metrics/history", tags=["🌐 UI - Monitoring"])
def get_agent_metrics_history(
    agent_uuid: str = Depends(get_agent_uuid),
    hours: int = Query(1, ge=1, le=24),
    db: Session = Depends(get_db)
):
    """Get historical metrics for an agent (last N hours).

    NOTE: called by the UI with the agent identified via the X-Agent-UUID header (not a
    path/query param) — the security middleware treats ANY request carrying that header as
    agent traffic and never populates request.state.auth, so require_permission() cannot be
    used here without a middleware redesign. See routers/k8s.py for the same constraint."""
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

@router.delete("/monitoring/agents/metrics/history", tags=["🌐 UI - Monitoring"])
def delete_agent_metrics_history(
    agent_uuid: str = Depends(get_agent_uuid),
    start_date: str = Query(..., description="Start datetime in ISO format"),
    end_date: str = Query(..., description="End datetime in ISO format"),
    db: Session = Depends(get_db)
):
    """Delete historical metrics for an agent within a date range.

    NOTE: identified via X-Agent-UUID header — see get_agent_metrics_history for why
    require_permission() can't be applied here without a middleware redesign."""
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

@router.get("/monitoring/api/ping", tags=["🌐 UI - Monitoring"])
def ping_api():
    """API health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0",
        "uptime": "running"
    }

@router.post("/monitoring/agents/report", tags=["🤖 Agent - Monitoring"])
def report_monitoring_data(agent_uuid: str = Depends(get_agent_uuid), data: dict = Body(...), db: Session = Depends(get_db)):
    """Agent reports its monitoring data (Windows services, drives, pings)"""
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        # Clear old data (keep only last 24 hours)
        cutoff_time = datetime.now() - timedelta(hours=24)

        # Store Windows Services.
        # Use a single bulk insert instead of hundreds of individual ORM adds — a server
        # with many services would otherwise block this (single-process) endpoint long
        # enough to make the reverse proxy return 502. Values are coalesced/truncated to the
        # column limits so one bad service entry can't fail the whole report.
        if "windows_services" in data:
            db.query(models.AgentWindowsService)\
                .filter(models.AgentWindowsService.agent_id == agent.id)\
                .delete(synchronize_session=False)

            services = data.get("windows_services") or []
            rows = []
            for s in services:
                name = (s.get("name") or "").strip()
                if not name:
                    continue  # service_name is required
                rows.append({
                    "agent_id": agent.id,
                    "service_name": name[:255],
                    "display_name": ((s.get("display_name") or name)[:255]),
                    "status": ((s.get("status") or "unknown")[:50]),
                    "description": s.get("description") or "",
                })
            if rows:
                db.bulk_insert_mappings(models.AgentWindowsService, rows)

        # Store Drive Info
        if "drives" in data:
            db.query(models.AgentDriveInfo)\
                .filter(models.AgentDriveInfo.agent_id == agent.id)\
                .delete(synchronize_session=False)

            for drive in (data.get("drives") or []):
                if not drive.get("letter"):
                    continue
                db.add(models.AgentDriveInfo(
                    agent_id=agent.id,
                    drive_letter=str(drive["letter"])[:10],
                    drive_label=(drive.get("label") or "")[:255],
                    total_gb=drive.get("total_gb", 0),
                    used_gb=drive.get("used_gb", 0),
                    free_gb=drive.get("free_gb", 0),
                    percent_used=drive.get("percent_used", 0),
                ))

        # Store Website Pings
        if "website_pings" in data:
            # Delete all existing pings for this agent so URL changes take effect immediately
            db.query(models.AgentWebsitePing)\
                .filter(models.AgentWebsitePing.agent_id == agent.id)\
                .delete(synchronize_session=False)

            for ping in (data.get("website_pings") or []):
                if not ping.get("url"):
                    continue
                db.add(models.AgentWebsitePing(
                    agent_id=agent.id,
                    url=str(ping["url"])[:500],
                    name=(ping.get("name") or "")[:255],
                    status=(ping.get("status") or "unknown")[:50],
                    response_time_ms=ping.get("response_time_ms", 0),
                ))

        db.commit()
        return {"success": True, "message": "Monitoring data received"}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/monitoring/agents/windows-services", tags=["🌐 UI - Monitoring"])
def get_agent_windows_services(
    agent_uuid: str = Depends(get_agent_uuid),
    db: Session = Depends(get_db)
):
    """Get Windows services starting with 'CI' for an agent.

    NOTE: identified via X-Agent-UUID header — see get_agent_metrics_history for why
    require_permission() can't be applied here without a middleware redesign."""
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

@router.post("/monitoring/agents/windows-services/control", tags=["🌐 UI - Monitoring"])
def control_windows_service(
    agent_uuid: str = Depends(get_agent_uuid),
    service_name: str = None,
    action: str = None,
    db: Session = Depends(get_db)
):
    """Control Windows service (start/stop) - queues command for agent to execute.

    NOTE: identified via X-Agent-UUID header — see get_agent_metrics_history for why
    require_permission() can't be applied here without a middleware redesign."""
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

@router.get("/monitoring/agents/drive-info", tags=["🌐 UI - Monitoring"])
def get_agent_drive_info(
    agent_uuid: str = Depends(get_agent_uuid),
    db: Session = Depends(get_db)
):
    """Get drive information for an agent.

    NOTE: identified via X-Agent-UUID header — see get_agent_metrics_history for why
    require_permission() can't be applied here without a middleware redesign."""
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

@router.get("/monitoring/agents/website-ping", tags=["🌐 UI - Monitoring"])
def get_agent_website_ping(
    agent_uuid: str = Depends(get_agent_uuid),
    db: Session = Depends(get_db)
):
    """Get website/API ping status from agent (from agent's appsettings.json configuration).

    NOTE: identified via X-Agent-UUID header — see get_agent_metrics_history for why
    require_permission() can't be applied here without a middleware redesign."""
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

@router.get("/monitoring/agents/logs/{service_name}", tags=["🌐 UI - Monitoring"])
def get_service_logs(
    agent_uuid: str = Depends(get_agent_uuid),
    service_name: str = None,
    date: Optional[str] = None,
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """Get logs for a specific service on an agent.

    NOTE: identified via X-Agent-UUID header — see get_agent_metrics_history for why
    require_permission() can't be applied here without a middleware redesign."""
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

@router.get("/commands/{command_id}", tags=["🌐 UI - Monitoring"])
def get_command_result(
    command_id: int,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("monitoring", "read")),
    allowed: Optional[list] = Depends(get_allowed_customer_ids),
):
    """Poll the status and result of an agent command"""
    command = db.query(models.AgentCommand).filter(models.AgentCommand.id == command_id).first()
    if not command:
        raise HTTPException(status_code=404, detail="Command not found")
    if allowed is not None:
        agent = db.query(models.Agent).filter(models.Agent.id == command.agent_id).first()
        require_customer_access(agent.customer_id if agent else None, allowed)

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

@router.post("/monitoring/agents/service-log-files/{service_name}", tags=["🌐 UI - Monitoring"])
def request_service_log_list(
    agent_uuid: str = Depends(get_agent_uuid),
    service_name: str = None,
    db: Session = Depends(get_db)
):
    """Ask the agent to list log files for a service. Returns command_id to poll.

    NOTE: identified via X-Agent-UUID header — see get_agent_metrics_history for why
    require_permission() can't be applied here without a middleware redesign."""
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

@router.post("/monitoring/agents/service-log-read/{service_name}", tags=["🌐 UI - Monitoring"])
def request_service_log_read(
    agent_uuid: str = Depends(get_agent_uuid),
    service_name: str = None,
    file_name: str = Query(...),
    max_kb: int = Query(512, ge=1, le=4096),
    db: Session = Depends(get_db)
):
    """Ask the agent to read a specific log file. Returns command_id to poll.

    NOTE: identified via X-Agent-UUID header — see get_agent_metrics_history for why
    require_permission() can't be applied here without a middleware redesign."""
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
