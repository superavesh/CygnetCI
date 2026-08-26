"""Roles & permissions endpoints."""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models
from deps import require_permission

router = APIRouter(tags=["🛡️ Roles"])


class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    permissions: Dict[str, Any] = {}


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[Dict[str, Any]] = None


def _serialize_role(role) -> dict:
    return {
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "permissions": role.permissions,
        "is_system": role.is_system,
        "created_at": role.created_at,
        "updated_at": role.updated_at,
    }


@router.get("/roles")
def get_roles(db: Session = Depends(get_db),
              _perm: dict = Depends(require_permission("roles", "read"))):
    """Get all roles"""
    roles = db.query(models.Role).all()
    return [_serialize_role(role) for role in roles]


@router.get("/roles/{role_id}")
def get_role(role_id: int, db: Session = Depends(get_db),
             _perm: dict = Depends(require_permission("roles", "read"))):
    """Get a specific role"""
    role = db.query(models.Role).filter(models.Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return _serialize_role(role)


@router.post("/roles", status_code=201)
def create_role(role: RoleCreate, db: Session = Depends(get_db),
                _perm: dict = Depends(require_permission("roles", "create"))):
    """Create a new custom role"""
    if not role.name or not role.name.strip():
        raise HTTPException(status_code=400, detail="Role name is required")

    existing = db.query(models.Role).filter(models.Role.name == role.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="A role with this name already exists")

    db_role = models.Role(
        name=role.name.strip(),
        description=role.description,
        permissions=role.permissions or {},
        is_system=False,
    )
    db.add(db_role)
    db.commit()
    db.refresh(db_role)
    return _serialize_role(db_role)


@router.put("/roles/{role_id}")
def update_role(role_id: int, role: RoleUpdate, db: Session = Depends(get_db),
                _perm: dict = Depends(require_permission("roles", "update"))):
    """Update a role (system roles cannot be modified)"""
    db_role = db.query(models.Role).filter(models.Role.id == role_id).first()
    if not db_role:
        raise HTTPException(status_code=404, detail="Role not found")
    if db_role.is_system:
        raise HTTPException(status_code=403, detail="Cannot modify system roles")

    update_data = role.model_dump(exclude_unset=True)

    new_name = update_data.get("name")
    if new_name is not None and new_name != db_role.name:
        if not new_name.strip():
            raise HTTPException(status_code=400, detail="Role name is required")
        existing = db.query(models.Role).filter(models.Role.name == new_name).first()
        if existing:
            raise HTTPException(status_code=400, detail="A role with this name already exists")
        db_role.name = new_name.strip()

    if "description" in update_data:
        db_role.description = update_data["description"]
    if update_data.get("permissions") is not None:
        db_role.permissions = update_data["permissions"]

    db.commit()
    db.refresh(db_role)
    return _serialize_role(db_role)


@router.delete("/roles/{role_id}")
def delete_role(role_id: int, db: Session = Depends(get_db),
                _perm: dict = Depends(require_permission("roles", "delete"))):
    """Delete a role (only custom roles, not system roles)"""
    role = db.query(models.Role).filter(models.Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system:
        raise HTTPException(status_code=403, detail="Cannot delete system roles")

    db.delete(role)
    db.commit()
    return {"message": f"Role '{role.name}' deleted successfully"}
