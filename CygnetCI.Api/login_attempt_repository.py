"""Data access for brute-force login-lockout tracking (login_attempts table).

Deliberately raw SQL, NOT an ORM model registered on models.Base — main.py
calls models.Base.metadata.create_all() on every boot, which would silently
create this table as a side effect of just importing the app, bypassing the
Alembic migration (alembic/versions/<rev>_add_login_attempts_table.py) that is
meant to be the deliberate, reviewed way to add it. This is also just the more
correct pattern generally: schema changes should go through Alembic, not
through create_all()'s side effects.
"""
from datetime import datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session


def is_locked(db: Session, attempt_key: str, max_attempts: int, lockout_seconds: int) -> bool:
    cutoff = datetime.now() - timedelta(seconds=lockout_seconds)
    count = db.execute(
        text("SELECT COUNT(*) FROM login_attempts WHERE attempt_key = :key AND created_at > :cutoff"),
        {"key": attempt_key, "cutoff": cutoff},
    ).scalar()
    return count >= max_attempts


def record_failure(db: Session, attempt_key: str, window_seconds: int) -> None:
    # Self-cleaning: drop this key's own entries once they've aged out of the
    # window, so the table doesn't grow unbounded for repeatedly-attacked keys.
    # (Keys that never come back — e.g. a one-off scan — do linger; this isn't
    # a full cleanup job, just enough to bound the common case.)
    cutoff = datetime.now() - timedelta(seconds=window_seconds)
    db.execute(
        text("DELETE FROM login_attempts WHERE attempt_key = :key AND created_at <= :cutoff"),
        {"key": attempt_key, "cutoff": cutoff},
    )
    db.execute(
        text("INSERT INTO login_attempts (attempt_key, created_at) VALUES (:key, :now)"),
        {"key": attempt_key, "now": datetime.now()},
    )
    db.commit()


def reset(db: Session, attempt_key: str) -> None:
    db.execute(text("DELETE FROM login_attempts WHERE attempt_key = :key"), {"key": attempt_key})
    db.commit()
