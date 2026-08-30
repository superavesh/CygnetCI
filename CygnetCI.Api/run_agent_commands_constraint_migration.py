"""
Widen the agent_commands.check_command_type constraint to include command types that were
added to the codebase (service_log_list, service_log_read, k8s_onboard, k8s_argocd_sync)
after the original migration was written — using any of them currently fails with a 500
(psycopg2.errors.CheckViolation) since the DB constraint never caught up with the code.

Purely additive (widens the allowed set, changes no existing rows). Safe to re-run.

Usage:
    python run_agent_commands_constraint_migration.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import engine
from sqlalchemy import text

NEW_CONSTRAINT_SQL = """
ALTER TABLE agent_commands DROP CONSTRAINT IF EXISTS check_command_type;
ALTER TABLE agent_commands ADD CONSTRAINT check_command_type CHECK (command_type IN (
    'service_control', 'execute_script', 'system_command',
    'service_log_list', 'service_log_read', 'k8s_onboard', 'k8s_argocd_sync'
));
"""

with engine.begin() as conn:
    conn.execute(text(NEW_CONSTRAINT_SQL))

print("check_command_type constraint updated successfully.")
