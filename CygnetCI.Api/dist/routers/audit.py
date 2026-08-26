"""Audit log endpoints."""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
import models
from deps import require_superuser

router = APIRouter(tags=["📋 Audit Logs"])


@router.get("/audit-logs")
def get_audit_logs(
    limit: int = Query(100, description="Maximum number of logs to return"),
    offset: int = Query(0, description="Number of logs to skip"),
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_superuser),
):
    """Get audit logs with pagination and filters"""
    query = db.query(models.AuditLog)

    if user_id:
        query = query.filter(models.AuditLog.user_id == user_id)
    if resource_type:
        query = query.filter(models.AuditLog.resource_type == resource_type)

    logs = query.order_by(models.AuditLog.created_at.desc()).offset(offset).limit(limit).all()

    user_ids = list({log.user_id for log in logs if log.user_id})
    users_map = {}
    if user_ids:
        users = db.query(models.User).filter(models.User.id.in_(user_ids)).all()
        users_map = {u.id: (u.full_name or u.username) for u in users}

    return [{
        "id": log.id,
        "user_id": log.user_id,
        "user_name": users_map.get(log.user_id, "Unknown"),
        "action": log.action,
        "resource_type": log.resource_type,
        "resource_id": log.resource_id,
        "details": log.details,
        "ip_address": log.ip_address,
        "user_agent": log.user_agent,
        "created_at": log.created_at.isoformat() if log.created_at else None
    } for log in logs]
