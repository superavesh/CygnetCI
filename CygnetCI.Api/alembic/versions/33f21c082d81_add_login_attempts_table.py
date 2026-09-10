"""add login_attempts table

Backs the brute-force login lockout (see routers/auth.py and
login_attempt_repository.py) with shared storage instead of an in-memory
per-pod counter, so the threshold applies correctly across multiple API
replicas. This table is deliberately NOT an ORM model on models.Base — see
login_attempt_repository.py's module docstring for why.

Revision ID: 33f21c082d81
Revises: e56a0c445b8a
Create Date: 2026-09-10 18:23:38.773978

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '33f21c082d81'
down_revision: Union[str, None] = 'e56a0c445b8a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "login_attempts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("attempt_key", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP, server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(
        "ix_login_attempts_key_created",
        "login_attempts",
        ["attempt_key", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_login_attempts_key_created", table_name="login_attempts")
    op.drop_table("login_attempts")
