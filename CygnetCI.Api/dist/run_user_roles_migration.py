"""
Add the user_roles table and reconcile user_customers columns (is_default, assigned_at).
Idempotent — safe to run multiple times.

Works both in the repo (../CygnetCI.Database) and in the deployed package
(./CygnetCI.Database bundled by build_for_iis.ps1).
"""
import os
import sys

# Embeddable Python (._pth) does not add the script's own directory to sys.path
# when run by path, so ensure local modules (config, models, ...) are importable.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text
from config import app_config


def _find_sql(name: str) -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    for cand in (
        os.path.join(here, "CygnetCI.Database", name),        # deployed package
        os.path.join(here, "..", "CygnetCI.Database", name),  # repo layout
        os.path.join(here, name),
    ):
        if os.path.exists(cand):
            return cand
    raise FileNotFoundError(f"Could not locate {name}")


engine = create_engine(app_config.get_database_url())

print("Applying user_roles migration...")
with engine.begin() as conn:
    try:
        sql_commands = open(_find_sql("003_add_user_roles.sql")).read()
        sql_commands = sql_commands.replace("SELECT 'user_roles table ready' AS status;", "")
        conn.execute(text(sql_commands))
        print("\n[SUCCESS] user_roles table created and user_customers reconciled.")
        result = conn.execute(text("SELECT COUNT(*) FROM user_roles"))
        print(f"Rows in user_roles: {result.scalar()}")
    except Exception as e:
        print(f"\n[ERROR] Migration failed: {str(e)}")
        raise
