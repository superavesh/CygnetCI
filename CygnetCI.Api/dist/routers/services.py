"""Monitored-services endpoints."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models
from enums import ServiceType, ServiceStatus, ServiceCategory
from formatters import format_service
from deps import require_permission

router = APIRouter(tags=["🌐 UI - Services"])


class ServiceCreate(BaseModel):
    name: str
    type: ServiceType
    url: str
    category: ServiceCategory = ServiceCategory.todo


class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[ServiceStatus] = None
    category: Optional[ServiceCategory] = None


class MoveCategoryRequest(BaseModel):
    category: ServiceCategory


@router.get("/services")
def get_services(
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("services", "read")),
):
    """Get all monitored services organized by categories"""
    services = db.query(models.Service).all()

    categories = {
        "todo": {"title": "To Monitor", "services": []},
        "monitoring": {"title": "Monitoring", "services": []},
        "issues": {"title": "Issues", "services": []},
        "healthy": {"title": "Healthy", "services": []}
    }

    for service in services:
        formatted_service = format_service(service)
        categories[service.category]["services"].append(formatted_service)

    return {"categories": categories}


@router.post("/services", status_code=201)
def create_service(
    service: ServiceCreate,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("services", "create")),
):
    """Add a new service to monitor"""
    service_id = f"svc-{datetime.now().timestamp()}"

    db_service = models.Service(
        id=service_id,
        name=service.name,
        type=service.type.value,
        url=service.url,
        status="unknown",
        category=service.category.value,
        last_check=datetime.now(),
        response_time="-",
        uptime=0.0
    )

    db.add(db_service)
    db.commit()
    db.refresh(db_service)

    return format_service(db_service)


@router.get("/services/{service_id}")
def get_service(
    service_id: str,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("services", "read")),
):
    """Get service by ID"""
    service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    return format_service(service)


@router.put("/services/{service_id}")
def update_service(
    service_id: str,
    service: ServiceUpdate,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("services", "update")),
):
    """Update an existing service"""
    db_service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not db_service:
        raise HTTPException(status_code=404, detail="Service not found")

    if service.name is not None:
        db_service.name = service.name
    if service.status is not None:
        db_service.status = service.status.value
    if service.category is not None:
        db_service.category = service.category.value

    db.commit()
    db.refresh(db_service)

    return format_service(db_service)


@router.delete("/services/{service_id}")
def delete_service(
    service_id: str,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("services", "delete")),
):
    """Delete a service"""
    db_service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not db_service:
        raise HTTPException(status_code=404, detail="Service not found")

    db.delete(db_service)
    db.commit()

    return {"success": True, "message": "Service deleted"}


@router.post("/services/{service_id}/move")
def move_service(
    service_id: str,
    request: MoveCategoryRequest,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("services", "update")),
):
    """Move service to a different monitoring category"""
    db_service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not db_service:
        raise HTTPException(status_code=404, detail="Service not found")

    db_service.category = request.category.value
    db.commit()

    return {"success": True, "message": "Service moved successfully"}
