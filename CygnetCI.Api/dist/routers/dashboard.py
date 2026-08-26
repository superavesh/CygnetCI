"""Dashboard endpoints: aggregate /data, /stats, and alert settings/summary."""
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models
from formatters import format_agent, format_pipeline, format_task, format_service
from routers.k8s import _k8s_metrics_store
from deps import require_permission, get_allowed_customer_ids, require_customer_access

router = APIRouter()

class ResourceDataPoint(BaseModel):
    time: str
    cpu: int
    memory: int
    disk: int



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


# ==================== DASHBOARD ====================

@router.get("/data", tags=["🌐 UI - Dashboard"])
def get_dashboard_data(
    customer_id: int = None,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("overview", "read")),
    allowed: list = Depends(get_allowed_customer_ids),
):
    """Get all dashboard data, scoped to the caller's assigned customers (superusers see all)"""
    if customer_id is not None:
        require_customer_access(customer_id, allowed)

    # Get agents — ordered by creation (id) so order is stable across refreshes
    agents_query = db.query(models.Agent)
    if customer_id is not None:
        agents_query = agents_query.filter(models.Agent.customer_id == customer_id)
    elif allowed is not None:
        agents_query = agents_query.filter(models.Agent.customer_id.in_(allowed))
    agents = agents_query.order_by(models.Agent.id.asc()).all()
    agents_data = [format_agent(agent) for agent in agents]

    # Get pipelines
    pipelines_query = db.query(models.Pipeline).order_by(models.Pipeline.last_run.desc())
    if customer_id is not None:
        pipelines_query = pipelines_query.filter(models.Pipeline.customer_id == customer_id)
    elif allowed is not None:
        pipelines_query = pipelines_query.filter(models.Pipeline.customer_id.in_(allowed))
    pipelines = pipelines_query.all()
    pipelines_data = [format_pipeline(pipeline) for pipeline in pipelines]

    # Get tasks
    tasks_query = db.query(models.Task)
    if customer_id is not None:
        # Filter tasks by customer through pipeline relationship
        tasks_query = tasks_query.join(models.Pipeline).filter(models.Pipeline.customer_id == customer_id)
    elif allowed is not None:
        tasks_query = tasks_query.join(models.Pipeline).filter(models.Pipeline.customer_id.in_(allowed))
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
    elif allowed is not None:
        active_agents_query = active_agents_query.filter(models.Agent.customer_id.in_(allowed))
        running_pipelines_query = running_pipelines_query.filter(models.Pipeline.customer_id.in_(allowed))
        total_pipelines_query = total_pipelines_query.filter(models.Pipeline.customer_id.in_(allowed))
        successful_pipelines_query = successful_pipelines_query.filter(models.Pipeline.customer_id.in_(allowed))

    active_agents = active_agents_query.count()
    running_pipelines = running_pipelines_query.count()
    total_pipelines = total_pipelines_query.count()
    successful_pipelines = successful_pipelines_query.count()
    success_rate = round((successful_pipelines / total_pipelines * 100) if total_pipelines > 0 else 0, 2)

    # Get services
    services_query = db.query(models.Service)
    if customer_id is not None:
        services_query = services_query.filter(models.Service.customer_id == customer_id)
    elif allowed is not None:
        services_query = services_query.filter(models.Service.customer_id.in_(allowed))
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





# ==================== SERVICES ====================


# ==================== STATS ====================

@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("overview", "read")),
):
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
# ALERT SETTINGS & SUMMARY
# ==============================================

_ALERT_DEFAULTS = {
    "cpu_alert_threshold": "80",
    "ram_alert_threshold": "80",
    "disk_alert_threshold": "85",
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

@router.get("/settings/alerts", tags=["🌐 UI - Dashboard"])
def get_alert_settings_endpoint(
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("overview", "read")),
):
    """Get alert threshold settings."""
    raw = _get_alert_settings(db)
    return {
        "cpu_alert_threshold": int(raw["cpu_alert_threshold"]),
        "ram_alert_threshold": int(raw["ram_alert_threshold"]),
        "disk_alert_threshold": int(raw["disk_alert_threshold"]),
        "alert_refresh_interval": int(raw["alert_refresh_interval"]),
    }

class AlertSettingsUpdate(BaseModel):
    cpu_alert_threshold: Optional[int] = None
    ram_alert_threshold: Optional[int] = None
    disk_alert_threshold: Optional[int] = None
    alert_refresh_interval: Optional[int] = None

@router.put("/settings/alerts", tags=["🌐 UI - Dashboard"])
def update_alert_settings(
    body: AlertSettingsUpdate,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("overview", "update")),
):
    """Update alert threshold settings."""
    if body.cpu_alert_threshold is not None:
        _upsert_setting(db, "cpu_alert_threshold", str(body.cpu_alert_threshold))
    if body.ram_alert_threshold is not None:
        _upsert_setting(db, "ram_alert_threshold", str(body.ram_alert_threshold))
    if body.disk_alert_threshold is not None:
        _upsert_setting(db, "disk_alert_threshold", str(body.disk_alert_threshold))
    if body.alert_refresh_interval is not None:
        _upsert_setting(db, "alert_refresh_interval", str(body.alert_refresh_interval))
    db.commit()
    return get_alert_settings_endpoint(db)

@router.get("/alerts/summary", tags=["🌐 UI - Dashboard"])
def get_alerts_summary(
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("overview", "read")),
):
    """Return all agents that have at least one active alert (CPU, RAM, disk, stopped services, failed/evicted pods)."""
    raw = _get_alert_settings(db)
    cpu_threshold = int(raw["cpu_alert_threshold"])
    ram_threshold = int(raw["ram_alert_threshold"])
    disk_threshold = int(raw["disk_alert_threshold"])

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

        # Disk — check latest reported drives
        overloaded_drives = (
            db.query(models.AgentDriveInfo)
            .filter(
                models.AgentDriveInfo.agent_id == agent.id,
                models.AgentDriveInfo.percent_used > disk_threshold,
            )
            .all()
        )
        if overloaded_drives:
            alerts["disk"] = [
                {
                    "drive": d.drive_letter,
                    "label": d.drive_label,
                    "percent_used": d.percent_used,
                    "used_gb": d.used_gb,
                    "total_gb": d.total_gb,
                    "threshold": disk_threshold,
                }
                for d in overloaded_drives
            ]

        # Stopped Windows services
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
