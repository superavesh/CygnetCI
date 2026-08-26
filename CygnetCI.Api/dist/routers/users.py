"""User management endpoints."""
import hashlib
from typing import List, Optional

import bcrypt
from fastapi import APIRouter, Depends, Form, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models
import email_publisher
from deps import require_permission, get_current_user
from notifications import _get_setting

router = APIRouter(tags=["👥 Users"])


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class UserAccessUpdate(BaseModel):
    role_ids: List[int] = []
    customer_ids: List[int] = []


@router.get("/users")
def get_users(
    customer_id: Optional[int] = Query(None, description="Filter by customer"),
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("users", "read")),
):
    """Get all users, optionally filtered by customer"""
    query = db.query(models.User)
    if customer_id:
        query = query.join(models.UserCustomer).filter(models.UserCustomer.customer_id == customer_id)

    users = query.all()

    result = []
    for user in users:
        roles = [{"id": ur.role.id, "name": ur.role.name}
                 for ur in user.user_roles if ur.role is not None]
        customers = [{"id": uc.customer.id, "name": uc.customer.name,
                      "display_name": uc.customer.display_name}
                     for uc in user.user_customers if uc.customer is not None]
        result.append({
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "is_active": user.is_active,
            "is_superuser": user.is_superuser,
            "roles": roles,
            "role_ids": [r["id"] for r in roles],
            "customers": customers,
            "customer_ids": [c["id"] for c in customers],
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "updated_at": user.updated_at.isoformat() if user.updated_at else None,
            "last_login": user.last_login.isoformat() if user.last_login else None
        })
    return result


@router.post("/users")
def create_user(
    username: str = Form(...),
    email: str = Form(...),
    full_name: str = Form(...),
    password: str = Form(...),
    is_superuser: bool = Form(False),
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("users", "create")),
):
    """Create a new user"""
    existing = db.query(models.User).filter(
        (models.User.username == username) | (models.User.email == email)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists")

    hashed_password = hashlib.sha256(password.encode()).hexdigest()

    new_user = models.User(
        username=username,
        email=email,
        full_name=full_name,
        password_hash=hashed_password,
        is_active=True,
        is_superuser=is_superuser
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Best-effort welcome email
    try:
        base = _get_setting(db, "web_base_url", "http://localhost").rstrip("/")
        email_publisher.publish_email(
            email_type="user_welcome",
            to=[new_user.email],
            template="user_welcome",
            data={
                "full_name": new_user.full_name or new_user.username,
                "username": new_user.username,
                "login_url": f"{base}/login",
            },
        )
    except Exception as _e:  # noqa: BLE001
        print(f"[user_welcome] failed to queue: {_e}")

    return {
        "id": new_user.id,
        "username": new_user.username,
        "email": new_user.email,
        "full_name": new_user.full_name,
        "is_active": new_user.is_active,
        "is_superuser": new_user.is_superuser
    }


@router.put("/users/me/password")
def change_my_password(
    body: PasswordChange,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Self-service: the logged-in user changes their OWN password."""
    ph = current_user.password_hash or ""
    if ph.startswith("$2b$") or ph.startswith("$2a$"):
        valid = bcrypt.checkpw(body.current_password.encode("utf-8"), ph.encode("utf-8"))
    else:
        valid = ph == hashlib.sha256(body.current_password.encode()).hexdigest()
    if not valid:
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    current_user.password_hash = bcrypt.hashpw(body.new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    db.commit()
    return {"success": True, "message": "Password updated"}


@router.put("/users/{user_id}")
def update_user(
    user_id: int,
    email: Optional[str] = Form(None),
    full_name: Optional[str] = Form(None),
    is_active: Optional[bool] = Form(None),
    is_superuser: Optional[bool] = Form(None),
    password: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    _perm: dict = Depends(require_permission("users", "update")),
):
    """Update user details"""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if email:
        user.email = email
    if full_name:
        user.full_name = full_name
    if is_active is not None:
        user.is_active = is_active
    if is_superuser is not None:
        user.is_superuser = is_superuser
    if password:
        user.password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    db.commit()
    db.refresh(user)

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "is_active": user.is_active,
        "is_superuser": user.is_superuser
    }


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db),
                _perm: dict = Depends(require_permission("users", "delete"))):
    """Delete a user"""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()
    return {"success": True, "message": "User deleted"}


@router.get("/users/{user_id}/access")
def get_user_access(user_id: int, db: Session = Depends(get_db),
                    _perm: dict = Depends(require_permission("users", "read"))):
    """Get the roles and customers currently assigned to a user."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    roles = [{"id": ur.role.id, "name": ur.role.name}
             for ur in user.user_roles if ur.role is not None]
    customers = [{"id": uc.customer.id, "name": uc.customer.name,
                  "display_name": uc.customer.display_name}
                 for uc in user.user_customers if uc.customer is not None]
    return {
        "user_id": user.id,
        "role_ids": [r["id"] for r in roles],
        "customer_ids": [c["id"] for c in customers],
        "roles": roles,
        "customers": customers,
    }


@router.put("/users/{user_id}/access")
def update_user_access(user_id: int, access: UserAccessUpdate, db: Session = Depends(get_db),
                       _perm: dict = Depends(require_permission("users", "update"))):
    """Replace the set of roles and customers assigned to a user."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    role_ids = list(dict.fromkeys(access.role_ids))
    customer_ids = list(dict.fromkeys(access.customer_ids))

    if role_ids:
        found = {r.id for r in db.query(models.Role.id).filter(models.Role.id.in_(role_ids)).all()}
        missing = [rid for rid in role_ids if rid not in found]
        if missing:
            raise HTTPException(status_code=400, detail=f"Unknown role id(s): {missing}")
    if customer_ids:
        found = {c.id for c in db.query(models.Customer.id).filter(models.Customer.id.in_(customer_ids)).all()}
        missing = [cid for cid in customer_ids if cid not in found]
        if missing:
            raise HTTPException(status_code=400, detail=f"Unknown customer id(s): {missing}")

    db.query(models.UserRole).filter(models.UserRole.user_id == user_id).delete(synchronize_session=False)
    for rid in role_ids:
        db.add(models.UserRole(user_id=user_id, role_id=rid))

    db.query(models.UserCustomer).filter(models.UserCustomer.user_id == user_id).delete(synchronize_session=False)
    for idx, cid in enumerate(customer_ids):
        db.add(models.UserCustomer(user_id=user_id, customer_id=cid, is_default=(idx == 0)))

    db.commit()

    return {
        "success": True,
        "user_id": user_id,
        "role_ids": role_ids,
        "customer_ids": customer_ids,
    }
