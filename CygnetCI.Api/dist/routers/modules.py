"""Deployment-level module toggles (see models.SystemModule). Independent of per-user RBAC:
disabling a module here hides it for every user including superusers, since it represents
"not licensed/installed at this premise" rather than a permission decision. Enforcement
itself lives in main.py's security_middleware (via module_flags.py) — this router is just
the read/admin surface the frontend uses to know what to show and to flip the toggle."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models
from deps import require_superuser, get_current_auth
from module_flags import invalidate_module_cache

router = APIRouter(tags=["🧩 Modules"])


class ModuleResponse(BaseModel):
    key: str
    display_name: str
    enabled: bool

    class Config:
        from_attributes = True


class ModuleUpdate(BaseModel):
    enabled: bool


@router.get("/system/modules", response_model=list[ModuleResponse])
def list_modules(db: Session = Depends(get_db), _auth: dict = Depends(get_current_auth)):
    """List every toggleable module and its current enabled state. Any authenticated user
    (the frontend needs this to decide what to show in navigation) — not permission-gated,
    since knowing whether a module is licensed isn't itself sensitive."""
    return db.query(models.SystemModule).order_by(models.SystemModule.display_name).all()


@router.put("/system/modules/{key}", response_model=ModuleResponse)
def update_module(
    key: str,
    body: ModuleUpdate,
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_superuser),
):
    """Enable or disable a module (superuser only)."""
    row = db.query(models.SystemModule).filter(models.SystemModule.key == key).first()
    if not row:
        raise HTTPException(status_code=404, detail="Module not found")
    row.enabled = body.enabled
    db.commit()
    db.refresh(row)
    invalidate_module_cache()
    return row
