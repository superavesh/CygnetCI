"""
Authentication & authorization helpers for CygnetCI.

- Opaque bearer tokens stored server-side as SHA-256 hashes (user_sessions table).
- Permission normalization that understands BOTH role-permission JSON shapes:
    Shape A: {"agents": ["read", "create"], ...}
    Shape B: {"Monitoring": {"read": true, "write": true, "edit": true, "delete": true}, ...}
"""
import hashlib
import secrets
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

import models

SESSION_TTL_DAYS = 7

# Map Shape-B boolean flags -> canonical actions
_SHAPE_B_MAP = {"read": "read", "write": "create", "edit": "update", "delete": "delete"}


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def create_session(db: Session, user_id: int, ttl_days: int = SESSION_TTL_DAYS) -> str:
    """Create a session row and return the RAW token (only the hash is stored)."""
    raw = secrets.token_urlsafe(48)
    session = models.UserSession(
        token_hash=hash_token(raw),
        user_id=user_id,
        expires_at=datetime.now() + timedelta(days=ttl_days),
    )
    db.add(session)
    db.commit()
    return raw


def validate_token(db: Session, raw_token: str):
    """Return the User for a valid, unexpired token, else None."""
    if not raw_token:
        return None
    session = (
        db.query(models.UserSession)
        .filter(models.UserSession.token_hash == hash_token(raw_token))
        .first()
    )
    if not session or session.expires_at <= datetime.now():
        return None
    user = db.query(models.User).filter(models.User.id == session.user_id).first()
    if not user or not user.is_active:
        return None
    return user


def delete_token(db: Session, raw_token: str) -> None:
    if not raw_token:
        return
    db.query(models.UserSession).filter(
        models.UserSession.token_hash == hash_token(raw_token)
    ).delete(synchronize_session=False)
    db.commit()


def bearer_from_header(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


def normalize_permissions(user) -> dict:
    """Merge all of the user's roles into {resource_lower: set(actions)}."""
    result: dict = {}
    for ur in getattr(user, "user_roles", []):
        role = getattr(ur, "role", None)
        if not role or not role.permissions:
            continue
        for key, val in role.permissions.items():
            bucket = result.setdefault(key.lower(), set())
            if isinstance(val, list):
                bucket.update(str(a).lower() for a in val)
            elif isinstance(val, dict):
                for flag, canonical in _SHAPE_B_MAP.items():
                    if val.get(flag):
                        bucket.add(canonical)
    return result


def user_can(user, resource: str, action: str) -> bool:
    """True if the user may perform `action` on `resource`."""
    if getattr(user, "is_superuser", False):
        return True
    allowed = normalize_permissions(user).get(resource.lower(), set())
    return action.lower() in allowed


def permissions_payload(user) -> dict:
    """Serializable roles + permissions for the login / /auth/me responses."""
    roles = [
        {"id": ur.role.id, "name": ur.role.name}
        for ur in getattr(user, "user_roles", [])
        if getattr(ur, "role", None) is not None
    ]
    perms = {res: sorted(acts) for res, acts in normalize_permissions(user).items()}
    return {
        "is_superuser": bool(user.is_superuser),
        "roles": roles,
        "role_ids": [r["id"] for r in roles],
        "permissions": perms,
    }
