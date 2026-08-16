"""Pytest fixtures for the CygnetCI API router tests.

These are integration tests that run against the database configured in config.ini
(read-only / validation-only — they never mutate data). They require DB connectivity
and at least one active superuser account.
"""
import os
import sys

# Make the API package importable (tests live in CygnetCI.Api/tests)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

import main
import auth as auth_lib
from database import SessionLocal
import models


@pytest.fixture(scope="session")
def app():
    return main.app


@pytest.fixture(scope="session")
def client(app):
    return TestClient(app)


@pytest.fixture(scope="session")
def su_token():
    """Mint a real session token for an existing superuser, cleaned up afterward."""
    db = SessionLocal()
    try:
        su = (
            db.query(models.User)
            .filter(models.User.is_superuser.is_(True), models.User.is_active.is_(True))
            .first()
        )
        if not su:
            pytest.skip("no active superuser in the configured database")
        token = auth_lib.create_session(db, su.id)
    finally:
        db.close()

    yield token

    db = SessionLocal()
    try:
        auth_lib.delete_token(db, token)
    finally:
        db.close()


@pytest.fixture
def su_headers(su_token):
    return {"Authorization": f"Bearer {su_token}"}
