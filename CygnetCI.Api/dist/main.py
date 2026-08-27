# main.py - Complete FastAPI Implementation with Database
from fastapi import FastAPI, HTTPException, Depends, Query, Body, UploadFile, File, Form, Response, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import HTTPBearer
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from enum import Enum
from sqlalchemy.orm import Session
import uvicorn
import os
import hashlib
import hmac as hmac_lib
import time
import ipaddress
import shutil
import bcrypt
import uuid
import secrets
from collections import defaultdict

# Import database, models, and config
from database import get_db, engine
import models
from config import app_config
import customer_api
import auth as auth_lib
import email_publisher

# Shared building blocks extracted from this file
from enums import (
    AgentStatus, PipelineStatus, TaskStatus,
    ServiceType, ServiceStatus, ServiceCategory, LogLevel,
)
from formatters import (
    relative_time, format_agent, format_pipeline,
    format_task, format_service, format_pipeline_full,
)
from notifications import _get_setting, _publish_alert
from deps import (
    get_current_auth, get_current_user,
    require_permission, require_superuser, get_agent_uuid, _get_real_ip,
)

# Create tables
models.Base.metadata.create_all(bind=engine)

# Print configuration
app_config.print_config()

# ==============================================
# ENUMS
# ==============================================

# Enums moved to enums.py

# ==============================================
# PYDANTIC MODELS
# ==============================================

# Dashboard response models moved to routers/dashboard.py

# ==================== UPDATED PYDANTIC MODELS ====================

# Pipeline models moved to routers/pipelines.py

# ==============================================
# HELPER FUNCTIONS
# ==============================================

# Formatters moved to formatters.py
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

# Swagger "Authorize" support. This is a SCHEMA-ONLY declaration so Swagger shows the
# Authorize button and sends `Authorization: Bearer <token>` on requests. Actual auth is
# still enforced by security_middleware; auto_error=False keeps this a no-op at runtime
# (public + agent endpoints don't send a Bearer and must not be rejected here).
swagger_bearer = HTTPBearer(
    auto_error=False,
    description="Paste the access_token returned by POST /auth/login (no 'Bearer ' prefix).",
)

app = FastAPI(
    title="CygnetCI API",
    description="API for CygnetCI - CI/CD Management Platform",
    version="1.0.0",
    debug=app_config.get_debug_mode(),
    openapi_tags=tags_metadata,
    dependencies=[Depends(swagger_bearer)],
)

# Configure CORS from config file
app.add_middleware(
    CORSMiddleware,
    allow_origins=app_config.get_allowed_origins(),
    allow_credentials=app_config.get_allow_credentials(),
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================
# SECURITY: HMAC credential validation middleware
# ==============================================

import threading
import asyncio

# Cache agent security settings for 60 seconds to avoid a DB hit on every agent request
_security_cache: dict = {}
_security_cache_lock = threading.Lock()
_SECURITY_CACHE_TTL = 60  # seconds

def _get_cached_security(agent_uuid: str):
    with _security_cache_lock:
        entry = _security_cache.get(agent_uuid)
    if entry and (time.time() - entry["ts"]) < _SECURITY_CACHE_TTL:
        return entry["data"]
    return None

def _set_cached_security(agent_uuid: str, data):
    with _security_cache_lock:
        _security_cache[agent_uuid] = {"ts": time.time(), "data": data}

def _ip_in_allowlist(ip_str: str, allowlist: list) -> bool:
    """Check whether ip_str matches any entry in allowlist (IP, CIDR, or range)."""
    try:
        client_ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return False

    for entry in allowlist:
        entry = entry.strip()
        try:
            if "-" in entry and not entry.startswith("-"):
                # Range: 192.168.1.1-192.168.1.50
                start_str, end_str = entry.split("-", 1)
                start = ipaddress.ip_address(start_str.strip())
                end = ipaddress.ip_address(end_str.strip())
                if start <= client_ip <= end:
                    return True
            elif "/" in entry:
                # CIDR: 192.168.1.0/24
                if client_ip in ipaddress.ip_network(entry, strict=False):
                    return True
            else:
                # Exact IP
                if client_ip == ipaddress.ip_address(entry):
                    return True
        except ValueError:
            continue  # skip malformed entries

    return False

# Public (unauthenticated) UI/browser endpoints
_PUBLIC_EXACT = {"/", "/favicon.ico", "/openapi.json", "/docs", "/redoc", "/monitoring/api/ping"}
_PUBLIC_PREFIXES = ("/auth/login", "/auth/forgot-password", "/auth/reset-password", "/docs", "/redoc", "/static")


def _is_public_ui_path(path: str, method: str) -> bool:
    if path in _PUBLIC_EXACT:
        return True
    if any(path.startswith(p) for p in _PUBLIC_PREFIXES):
        return True
    # Agent registration may arrive before a UUID header is set
    if path == "/agents" and method == "POST":
        return True
    return False


def _auth_error(request: Request, detail: str):
    """401 JSONResponse with CORS headers (the CORS middleware doesn't wrap
    responses returned from this outer middleware)."""
    headers = {}
    origin = request.headers.get("origin")
    if origin and origin in app_config.get_allowed_origins():
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(status_code=401, content={"detail": detail}, headers=headers)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    # Always pass OPTIONS preflight through untouched so CORS middleware can handle it
    if request.method == "OPTIONS":
        return await call_next(request)

    agent_uuid = request.headers.get("X-Agent-UUID")
    bearer_token = auth_lib.bearer_from_header(request.headers.get("Authorization"))

    # A request carrying a Bearer token is always treated as a logged-in UI/browser call,
    # even when it also sends X-Agent-UUID — several monitoring/k8s endpoints use that
    # header purely to identify which agent's data to fetch, not to authenticate the
    # caller. The real .NET agent never sends an Authorization header to this API (only
    # X-Agent-UUID, and X-Client-ID/X-Client-Signature when HMAC is enabled), so treating
    # "has a bearer token" as authoritative for the session path cannot misclassify
    # genuine agent traffic.
    if not agent_uuid or bearer_token:
        # UI / browser request — require a valid user session (except public paths).
        if _is_public_ui_path(request.url.path, request.method):
            return await call_next(request)

        from database import SessionLocal
        db = SessionLocal()
        try:
            user = auth_lib.validate_token(db, bearer_token)
            if user is None:
                return _auth_error(request, "Not authenticated")
            # Capture identity + permissions as plain data, then close the DB
            # BEFORE call_next (call_next opens its own connection).
            request.state.auth = {
                "user_id": user.id,
                "username": user.username,
                **auth_lib.permissions_payload(user),
            }
        finally:
            db.close()
        return await call_next(request)

    if request.url.path == "/agents" and request.method == "POST":
        return await call_next(request)

    # Check cache first — no DB connection needed on a hit
    sec = _get_cached_security(agent_uuid)

    if sec is None:
        # Cache miss — open DB, query once, close BEFORE calling call_next
        # (call_next opens its own get_db connection; holding two simultaneously exhausts the pool)
        from database import SessionLocal
        db = SessionLocal()
        try:
            agent = db.query(models.Agent).filter(models.Agent.uuid == agent_uuid).first()
            if not agent or not agent.customer_id:
                _set_cached_security(agent_uuid, False)
                sec = False
            else:
                customer = db.query(models.Customer).filter(models.Customer.id == agent.customer_id).first()
                if not customer:
                    _set_cached_security(agent_uuid, False)
                    sec = False
                else:
                    sec = {
                        "credentials_enabled": customer.credentials_enabled,
                        "client_id": customer.client_id,
                        "client_secret": customer.client_secret,
                        "ip_restriction_enabled": customer.ip_restriction_enabled,
                        "ip_allowlist": customer.ip_allowlist,
                    }
                    _set_cached_security(agent_uuid, sec)
        finally:
            db.close()  # always closed before call_next runs

    # sec=False means agent/customer not found — pass through
    if not sec:
        return await call_next(request)

    # --- IP Restriction check ---
    if sec["ip_restriction_enabled"] and sec["ip_allowlist"]:
        real_ip = _get_real_ip(request)
        if not _ip_in_allowlist(real_ip, sec["ip_allowlist"]):
            return JSONResponse(
                status_code=403,
                content={"detail": f"Access denied: IP {real_ip} is not in the allowlist"}
            )

    # --- HMAC credential check ---
    if not sec["credentials_enabled"]:
        return await call_next(request)

    client_id = request.headers.get("X-Client-ID")
    signature = request.headers.get("X-Client-Signature")

    if not client_id or not signature:
        return JSONResponse(status_code=401, content={"detail": "Missing credentials headers"})

    if client_id != sec["client_id"]:
        return JSONResponse(status_code=401, content={"detail": "Invalid credentials"})

    current_minute = int(time.time() // 60)
    valid = False
    for minute in [current_minute, current_minute - 1]:
        msg = f"{client_id}:{minute}".encode()
        expected = hmac_lib.new(sec["client_secret"].encode(), msg, hashlib.sha256).hexdigest()
        if hmac_lib.compare_digest(expected, signature.lower()):
            valid = True
            break

    if not valid:
        return JSONResponse(status_code=401, content={"detail": "Invalid credentials"})

    return await call_next(request)

# Auth dependencies moved to deps.py

# Include customer API router
app.include_router(customer_api.router)

# Per-domain routers (extracted from this file)
from routers import roles as roles_router
from routers import audit as audit_router
from routers import settings as settings_router
from routers import services as services_router
from routers import rollback as rollback_router
from routers import tasks as tasks_router
from routers import email as email_router
from routers import users as users_router
from routers import tickets as tickets_router
from routers import pipelines as pipelines_router
from routers import releases as releases_router
from routers import agents as agents_router
from routers import monitoring as monitoring_router
from routers import k8s as k8s_router
from routers.k8s import _k8s_metrics_store  # shared store used by the dashboard endpoints below
from routers import transfer as transfer_router
from routers import agent_exec as agent_exec_router
from routers import auth as auth_api_router
from routers import dashboard as dashboard_router
app.include_router(auth_api_router.router)
app.include_router(dashboard_router.router)
app.include_router(roles_router.router)
app.include_router(agents_router.router)
app.include_router(monitoring_router.router)
app.include_router(k8s_router.router)
app.include_router(transfer_router.router)
app.include_router(agent_exec_router.router)
app.include_router(users_router.router)
app.include_router(tickets_router.router)
app.include_router(pipelines_router.router)
app.include_router(releases_router.router)
app.include_router(audit_router.router)
app.include_router(settings_router.router)
app.include_router(services_router.router)
app.include_router(rollback_router.router)
app.include_router(tasks_router.router)
app.include_router(email_router.router)


# Email/settings helpers moved to notifications.py

# ==============================================
# BACKGROUND: Proactive agent status checker
# ==============================================

async def _agent_status_checker():
    """Background task: marks agents offline when last_seen exceeds 2-minute threshold."""
    from database import SessionLocal
    while True:
        await asyncio.sleep(60)
        try:
            db = SessionLocal()
            try:
                offline_threshold = datetime.now() - timedelta(minutes=2)
                stale = (
                    db.query(models.Agent)
                    .filter(
                        models.Agent.status != "offline",
                        models.Agent.last_seen < offline_threshold,
                    )
                    .all()
                )
                if stale:
                    stale_info = [(a.name, a.id) for a in stale]
                    for agent in stale:
                        agent.status = "offline"
                    db.commit()
                    # Alert on each agent that just went offline
                    for name, aid in stale_info:
                        _publish_alert(
                            db,
                            alert_subject=f"Agent offline: {name}",
                            message=f"Agent '{name}' has stopped reporting and was marked offline.",
                            event="agent_offline",
                            resource=f"agent#{aid} {name}",
                        )
            finally:
                db.close()
        except Exception as e:
            # Never crash the loop, but don't swallow silently — surface the error in logs.
            print(f"[agent_status_checker] error: {type(e).__name__}: {e}")

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(_agent_status_checker())

# get_agent_uuid moved to deps.py

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

# Auth endpoints moved to routers/auth.py

# Settings (alert thresholds) endpoints moved to routers/settings.py

# Dashboard endpoints moved to routers/dashboard.py

# Alert settings/summary moved to routers/dashboard.py

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
