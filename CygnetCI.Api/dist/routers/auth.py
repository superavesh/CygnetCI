"""Authentication endpoints: login, logout, current user, forgot/reset password."""
import bcrypt
import hashlib
import secrets
import threading
import time
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models
import auth as auth_lib
import email_publisher
from deps import get_current_user, _get_real_ip
from notifications import _get_setting

router = APIRouter()

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]


# ==================== AUTHENTICATION ====================

# SECURITY: simple in-memory brute-force throttle for login.
# Tracks recent failed attempts per (client-ip, username) and locks out after a threshold.
_LOGIN_MAX_ATTEMPTS = 5
_LOGIN_WINDOW_SECONDS = 300   # attempts are counted within a rolling 5-minute window
_LOGIN_LOCKOUT_SECONDS = 300  # lockout duration once the threshold is exceeded
_login_attempts: dict = defaultdict(list)  # key -> list[timestamp of failed attempts]
_login_attempts_lock = threading.Lock()

def _login_key(request: Request, username: str) -> str:
    return f"{_get_real_ip(request)}|{(username or '').lower()}"

def _login_is_locked(key: str) -> bool:
    now = time.time()
    with _login_attempts_lock:
        attempts = [t for t in _login_attempts.get(key, []) if now - t < _LOGIN_LOCKOUT_SECONDS]
        _login_attempts[key] = attempts
        return len(attempts) >= _LOGIN_MAX_ATTEMPTS

def _login_record_failure(key: str):
    now = time.time()
    with _login_attempts_lock:
        attempts = [t for t in _login_attempts.get(key, []) if now - t < _LOGIN_WINDOW_SECONDS]
        attempts.append(now)
        _login_attempts[key] = attempts

def _login_reset(key: str):
    with _login_attempts_lock:
        _login_attempts.pop(key, None)


@router.post("/auth/login", response_model=LoginResponse, tags=["🔐 Authentication"])
def login(credentials: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """
    Authenticate user with username and password
    Returns access token and user information
    """
    # SECURITY: throttle repeated failed attempts before doing any work
    attempt_key = _login_key(request, credentials.username)
    if _login_is_locked(attempt_key):
        raise HTTPException(
            status_code=429,
            detail="Too many failed login attempts. Please try again in a few minutes."
        )

    # Find user by username
    user = db.query(models.User).filter(models.User.username.ilike(credentials.username)).first()

    if not user:
        _login_record_failure(attempt_key)
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Verify password - support both bcrypt and SHA256 for backward compatibility
    password_valid = False

    # Check if password hash starts with $2b$ (bcrypt format)
    if user.password_hash.startswith('$2b$') or user.password_hash.startswith('$2a$'):
        # Use bcrypt verification
        password_valid = bcrypt.checkpw(
            credentials.password.encode('utf-8'),
            user.password_hash.encode('utf-8')
        )
    else:
        # Fallback to SHA256 for legacy passwords
        hashed_password = hashlib.sha256(credentials.password.encode()).hexdigest()
        password_valid = user.password_hash == hashed_password

    if not password_valid:
        _login_record_failure(attempt_key)
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Check if user is active
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is disabled")

    # Successful login — clear the failed-attempt counter
    _login_reset(attempt_key)

    # Update last login timestamp
    user.last_login = datetime.now()
    db.commit()

    # Create a server-side session; the returned raw token is validated on every
    # subsequent request by security_middleware.
    access_token = auth_lib.create_session(db, user.id)

    # Return user data (without password) + roles/permissions so the UI can gate itself
    user_data = {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "is_active": user.is_active,
        "is_superuser": user.is_superuser,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login": user.last_login.isoformat() if user.last_login else None,
        **auth_lib.permissions_payload(user),
    }

    return LoginResponse(
        access_token=access_token,
        user=user_data
    )


@router.post("/auth/logout", tags=["🔐 Authentication"])
def logout(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    """Invalidate the current session token."""
    token = auth_lib.bearer_from_header(authorization)
    auth_lib.delete_token(db, token)
    return {"success": True}


@router.get("/auth/me", tags=["🔐 Authentication"])
def get_me(current_user: models.User = Depends(get_current_user)):
    """Return the currently authenticated user with roles and permissions."""
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "is_active": current_user.is_active,
        "is_superuser": current_user.is_superuser,
        "last_login": current_user.last_login.isoformat() if current_user.last_login else None,
        **auth_lib.permissions_payload(current_user),
    }


PASSWORD_RESET_TTL_MINUTES = 60


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/auth/forgot-password", tags=["🔐 Authentication"])
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Queue a password-reset email. Always returns success (no account enumeration)."""
    email = (body.email or "").strip()
    if email:
        user = db.query(models.User).filter(models.User.email.ilike(email)).first()
        if user and user.is_active:
            # Invalidate any previous unused tokens for this user
            db.query(models.PasswordResetToken).filter(
                models.PasswordResetToken.user_id == user.id,
                models.PasswordResetToken.used_at.is_(None),
            ).delete(synchronize_session=False)

            raw = secrets.token_urlsafe(48)
            token_hash = hashlib.sha256(raw.encode()).hexdigest()
            db.add(models.PasswordResetToken(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=datetime.now() + timedelta(minutes=PASSWORD_RESET_TTL_MINUTES),
            ))
            db.commit()

            base = _get_setting(db, "web_base_url", "http://localhost").rstrip("/")
            reset_url = f"{base}/reset-password?token={raw}"
            email_publisher.publish_email(
                email_type="password_reset",
                to=[user.email],
                template="password_reset",
                data={
                    "full_name": user.full_name or user.username,
                    "reset_url": reset_url,
                    "ttl_minutes": PASSWORD_RESET_TTL_MINUTES,
                },
            )
    return {"success": True, "message": "If that email exists, a reset link has been sent."}


@router.post("/auth/reset-password", tags=["🔐 Authentication"])
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Complete a password reset using a valid, unexpired, single-use token."""
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    token_hash = hashlib.sha256((body.token or "").encode()).hexdigest()
    prt = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.token_hash == token_hash
    ).first()
    if not prt or prt.used_at is not None or prt.expires_at <= datetime.now():
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    user = db.query(models.User).filter(models.User.id == prt.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    user.password_hash = bcrypt.hashpw(body.new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    prt.used_at = datetime.now()
    # Security: invalidate all existing sessions for this user
    db.query(models.UserSession).filter(models.UserSession.user_id == user.id).delete(synchronize_session=False)
    db.commit()
    return {"success": True, "message": "Password has been reset. Please sign in."}
