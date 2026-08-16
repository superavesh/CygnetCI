"""Shared FastAPI dependencies (auth + agent identity), moved out of main.py.

The session token is validated by the security middleware in main.py, which sets
request.state.auth. These dependencies read/enforce from there."""
from typing import Optional

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from database import get_db
import models


def _get_real_ip(request: Request) -> str:
    """Extract the real client IP, checking proxy headers before falling back to direct connection."""
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip().split(",")[0].strip()
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.strip().split(",")[0].strip()
    return request.client.host if request.client else ""


def get_current_auth(request: Request) -> dict:
    """Return the authenticated identity dict set by the security middleware."""
    a = getattr(request.state, "auth", None)
    if not a:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return a


def get_current_user(request: Request, db: Session = Depends(get_db)) -> models.User:
    """Reload the ORM user for the current session."""
    a = get_current_auth(request)
    user = db.query(models.User).filter(models.User.id == a["user_id"]).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def require_permission(resource: str, action: str):
    """Dependency factory: 403 unless the current user is a superuser or the
    resource/action is granted by one of their roles."""
    def checker(request: Request) -> dict:
        a = get_current_auth(request)
        if a.get("is_superuser"):
            return a
        allowed = a.get("permissions", {}).get(resource.lower(), [])
        if action.lower() not in allowed:
            raise HTTPException(status_code=403, detail=f"Permission denied: {action} on {resource}")
        return a
    return checker


def require_superuser(request: Request) -> dict:
    """Dependency: 403 unless the current user is a superuser."""
    a = get_current_auth(request)
    if not a.get("is_superuser"):
        raise HTTPException(status_code=403, detail="Superuser required")
    return a


def get_agent_uuid(
    x_agent_uuid: str = Header(...,
        description="Agent UUID — must be passed as the X-Agent-UUID request header"),
    x_client_id: Optional[str] = Header(None,
        description="Client ID for HMAC-SHA256 authentication. Required when the customer has credentials enabled. "
                    "Set in the agent's appsettings.json under ClientId."),
    x_client_signature: Optional[str] = Header(None,
        description="HMAC-SHA256 signature: hex(HMAC-SHA256(key=ClientSecret, msg='{ClientId}:{unix_minutes}')). "
                    "Required when the customer has credentials enabled. Set ClientSecret in appsettings.json.")
):
    """Dependency that extracts the agent UUID from the X-Agent-UUID request header."""
    return x_agent_uuid
