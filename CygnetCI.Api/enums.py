"""Shared API enums (moved out of main.py so routers can import them)."""
from enum import Enum


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
