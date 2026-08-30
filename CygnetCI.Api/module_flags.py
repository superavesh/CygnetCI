"""Deployment-level module toggles (see models.SystemModule).

Kept separate from main.py (rather than alongside the similar _security_cache there) so
that routers/modules.py can invalidate the cache after a toggle without a circular import.

Ordered most-specific-first in _MODULE_PATH_MAP: a path is matched against the first
prefix it starts with, so overlapping prefixes (e.g. "/agents/k8s-metrics" vs "/agents")
must have the more specific one listed first. This is only consulted for Bearer-
authenticated UI requests (see security_middleware in main.py) — agent-to-server traffic
(heartbeat, pickup, monitoring push, etc.) is never affected, since disabling a UI module
must never stop the underlying agents from reporting in.
"""
import threading
import time
from typing import Optional

import models

_MODULE_PATH_MAP = [
    ("/pipeline-executions", "pipelines"),
    ("/pipelines", "pipelines"),
    ("/ticket-attachments", "tickets"),
    ("/ticket-comments", "tickets"),
    ("/ticket-approvals", "tickets"),
    ("/tickets-stats", "tickets"),
    ("/tickets", "tickets"),
    ("/ai-settings", "tickets"),
    ("/environments", "releases"),
    ("/release-executions", "releases"),
    ("/stage-executions", "releases"),
    ("/releases", "releases"),
    ("/agents/k8s-", "k8s"),
    ("/agents/service-log-content", "monitoring"),
    ("/agents", "agents"),
    ("/monitoring", "monitoring"),
    ("/commands", "monitoring"),
    ("/transfer", "transfer"),
    ("/rollback", "rollback"),
    ("/services", "services"),
    ("/email-alerts", "email"),
    ("/email-configs", "email"),
    ("/tasks", "tasks"),
]


def resolve_module_for_path(path: str) -> Optional[str]:
    for prefix, module_key in _MODULE_PATH_MAP:
        if path.startswith(prefix):
            return module_key
    return None


_module_cache: dict = {}
_module_cache_ts = 0.0
_module_cache_lock = threading.Lock()
_MODULE_CACHE_TTL = 30  # seconds — toggling a module takes effect within this window at most,
                         # or immediately via invalidate_module_cache()


def get_enabled_modules() -> dict:
    """Returns {module_key: enabled}."""
    global _module_cache, _module_cache_ts
    with _module_cache_lock:
        if _module_cache and (time.time() - _module_cache_ts) < _MODULE_CACHE_TTL:
            return _module_cache

    from database import SessionLocal
    db = SessionLocal()
    try:
        rows = db.query(models.SystemModule).all()
        fresh = {r.key: r.enabled for r in rows}
    finally:
        db.close()

    with _module_cache_lock:
        _module_cache = fresh
        _module_cache_ts = time.time()
    return fresh


def invalidate_module_cache():
    global _module_cache_ts
    with _module_cache_lock:
        _module_cache_ts = 0.0
