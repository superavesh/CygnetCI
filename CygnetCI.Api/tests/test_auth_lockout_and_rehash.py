"""Tests for the DB-backed brute-force lockout and legacy-password rehash in
routers/auth.py's login().

The login_attempts table doesn't exist yet on the configured database (its
Alembic migration hasn't been applied — see alembic/versions/33f21c082d81_*)
so every test here mocks login_attempt_repository's three functions rather
than hitting it for real; these tests verify login()'s decision logic (when
each function gets called, and in what order relative to the password/active
checks), not the repository's SQL. The rehash behavior is verified against
the real (existing) users table via the db_session fixture's rolled-back
transaction — nothing here is ever committed to the real database.
"""
import uuid
from unittest.mock import patch

import bcrypt
import pytest
from fastapi import HTTPException, Request

import models
import routers.auth as auth_router
from routers.auth import LoginRequest, login


def _make_request() -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/auth/login",
        "headers": [],
        "client": ("127.0.0.1", 12345),
    }
    return Request(scope)


def _make_user(db, password_hash, is_active=True, username=None):
    user = models.User(
        username=username or f"testuser-{uuid.uuid4().hex[:8]}",
        email=f"{uuid.uuid4().hex[:8]}@example.com",
        password_hash=password_hash,
        is_active=is_active,
        is_superuser=False,
    )
    db.add(user)
    db.flush()
    return user


# ---------------------------------------------------------------------------
# Lockout decision logic
# ---------------------------------------------------------------------------

def test_locked_key_rejected_before_any_db_lookup(db_session):
    with patch.object(auth_router.login_attempt_repository, "is_locked", return_value=True) as mock_locked, \
         patch.object(db_session, "query") as mock_query:
        with pytest.raises(HTTPException) as exc_info:
            login(LoginRequest(username="anyone", password="x"), _make_request(), db_session)

    assert exc_info.value.status_code == 429
    mock_locked.assert_called_once()
    mock_query.assert_not_called()  # locked out before even looking up the user


def test_unknown_user_records_failure(db_session):
    with patch.object(auth_router.login_attempt_repository, "is_locked", return_value=False), \
         patch.object(auth_router.login_attempt_repository, "record_failure") as mock_record:
        with pytest.raises(HTTPException) as exc_info:
            login(LoginRequest(username="no-such-user-xyz", password="x"), _make_request(), db_session)

    assert exc_info.value.status_code == 401
    mock_record.assert_called_once()


def test_wrong_bcrypt_password_records_failure(db_session):
    hash_ = bcrypt.hashpw(b"correct-password", bcrypt.gensalt()).decode()
    user = _make_user(db_session, hash_)

    with patch.object(auth_router.login_attempt_repository, "is_locked", return_value=False), \
         patch.object(auth_router.login_attempt_repository, "record_failure") as mock_record:
        with pytest.raises(HTTPException) as exc_info:
            login(LoginRequest(username=user.username, password="wrong-password"), _make_request(), db_session)

    assert exc_info.value.status_code == 401
    mock_record.assert_called_once()
    assert user.password_hash == hash_  # untouched on failure


def test_correct_password_resets_lockout(db_session):
    hash_ = bcrypt.hashpw(b"correct-password", bcrypt.gensalt()).decode()
    user = _make_user(db_session, hash_)

    with patch.object(auth_router.login_attempt_repository, "is_locked", return_value=False), \
         patch.object(auth_router.login_attempt_repository, "reset") as mock_reset, \
         patch.object(auth_router.auth_lib, "create_session", return_value="fake-token"):
        result = login(LoginRequest(username=user.username, password="correct-password"), _make_request(), db_session)

    assert result.access_token == "fake-token"
    mock_reset.assert_called_once()


def test_inactive_user_correct_password_does_not_reset_lockout(db_session):
    """Matches pre-existing behavior: the 403 for a disabled account is raised
    BEFORE the lockout counter is reset, unlike the active-user success path."""
    hash_ = bcrypt.hashpw(b"correct-password", bcrypt.gensalt()).decode()
    user = _make_user(db_session, hash_, is_active=False)

    with patch.object(auth_router.login_attempt_repository, "is_locked", return_value=False), \
         patch.object(auth_router.login_attempt_repository, "reset") as mock_reset:
        with pytest.raises(HTTPException) as exc_info:
            login(LoginRequest(username=user.username, password="correct-password"), _make_request(), db_session)

    assert exc_info.value.status_code == 403
    mock_reset.assert_not_called()


# ---------------------------------------------------------------------------
# Legacy SHA-256 -> bcrypt rehash
# ---------------------------------------------------------------------------

def test_legacy_sha256_password_is_rehashed_to_bcrypt_on_success(db_session):
    import hashlib
    legacy_hash = hashlib.sha256(b"legacy-password").hexdigest()
    user = _make_user(db_session, legacy_hash)

    with patch.object(auth_router.login_attempt_repository, "is_locked", return_value=False), \
         patch.object(auth_router.login_attempt_repository, "reset"), \
         patch.object(auth_router.auth_lib, "create_session", return_value="fake-token"):
        result = login(LoginRequest(username=user.username, password="legacy-password"), _make_request(), db_session)

    assert result.access_token == "fake-token"
    assert user.password_hash != legacy_hash
    assert user.password_hash.startswith("$2b$") or user.password_hash.startswith("$2a$")
    # The new hash must actually verify the same password.
    assert bcrypt.checkpw(b"legacy-password", user.password_hash.encode())


def test_legacy_sha256_wrong_password_is_not_rehashed(db_session):
    import hashlib
    legacy_hash = hashlib.sha256(b"legacy-password").hexdigest()
    user = _make_user(db_session, legacy_hash)

    with patch.object(auth_router.login_attempt_repository, "is_locked", return_value=False), \
         patch.object(auth_router.login_attempt_repository, "record_failure"):
        with pytest.raises(HTTPException) as exc_info:
            login(LoginRequest(username=user.username, password="wrong-password"), _make_request(), db_session)

    assert exc_info.value.status_code == 401
    assert user.password_hash == legacy_hash  # unchanged — never verified correct


def test_rehashed_password_still_logs_in_on_a_later_attempt(db_session):
    """Confirms the rehash doesn't break the next login: same plaintext
    password, now verified via the new bcrypt hash instead of the old SHA-256 path."""
    import hashlib
    legacy_hash = hashlib.sha256(b"legacy-password").hexdigest()
    user = _make_user(db_session, legacy_hash)

    with patch.object(auth_router.login_attempt_repository, "is_locked", return_value=False), \
         patch.object(auth_router.login_attempt_repository, "reset"), \
         patch.object(auth_router.auth_lib, "create_session", return_value="fake-token"):
        login(LoginRequest(username=user.username, password="legacy-password"), _make_request(), db_session)
        # Second login, now against the bcrypt hash written by the first call.
        result = login(LoginRequest(username=user.username, password="legacy-password"), _make_request(), db_session)

    assert result.access_token == "fake-token"
