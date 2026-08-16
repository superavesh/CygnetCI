"""Kubernetes / ArgoCD / Prometheus metrics + agent file-log content endpoints.

Holds the in-memory K8s metric stores (shared by reference with the monitoring
router and the dashboard, which import _k8s_metrics_store from here)."""
import json
import time
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
import models
from deps import get_agent_uuid

router = APIRouter()

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
# Entries expire after 10 minutes to prevent unbounded memory growth.
_service_log_content_store: dict = {}
_SERVICE_LOG_TTL = 600  # seconds

@router.post("/agents/service-log-content", tags=["🤖 Agent - File Logs"])
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
    _service_log_content_store[key] = {"payload": payload, "ts": time.time()}
    # Evict entries older than TTL to prevent unbounded memory growth
    now = time.time()
    expired = [k for k, v in _service_log_content_store.items() if now - v["ts"] > _SERVICE_LOG_TTL]
    for k in expired:
        del _service_log_content_store[k]
    return {"success": True}

@router.get("/agents/service-log-content", tags=["🌐 UI - File Logs"])
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
    entry = _service_log_content_store.pop(key, None)  # consume once — free memory
    if entry is None:
        raise HTTPException(status_code=404, detail="Content not available yet")
    return entry["payload"]

@router.post("/agents/k8s-metrics", tags=["🤖 Agent - K8s"])
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

@router.get("/agents/k8s-clusters", tags=["🌐 UI - K8s"])
def get_k8s_clusters(agent_uuid: str = Depends(get_agent_uuid), db: Session = Depends(get_db)):
    """List all cluster names that have reported metrics for this agent."""
    agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    prefix = f"{agent_uuid}:"
    clusters = sorted({k[len(prefix):] for k in _k8s_metrics_store if k.startswith(prefix)})
    return clusters

@router.get("/agents/k8s-metrics", tags=["🌐 UI - K8s"])
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

@router.get("/agents/k8s-metrics/history", tags=["🌐 UI - K8s"])
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

@router.post("/agents/k8s-onboard", tags=["🌐 UI - K8s"])
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

@router.post("/agents/k8s-sync", tags=["🌐 UI - K8s"])
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
