"""Create the user_sessions table. Idempotent — safe to re-run.
Works both in the repo (../CygnetCI.Database) and in the deployed package
(./CygnetCI.Database bundled by build_for_iis.ps1)."""
import os
import sys

# Embeddable Python (._pth) does not add the script's own directory to sys.path
# when run by path, so ensure local modules (config, ...) are importable.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text
from config import app_config


def _find_sql(name: str) -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    for cand in (
        os.path.join(here, "CygnetCI.Database", name),      # deployed package
        os.path.join(here, "..", "CygnetCI.Database", name),  # repo layout
        os.path.join(here, name),
    ):
        if os.path.exists(cand):
            return cand
    raise FileNotFoundError(f"Could not locate {name}")


engine = create_engine(app_config.get_database_url())
print("Applying user_sessions migration...")
with engine.begin() as conn:
    sql = open(_find_sql("004_add_user_sessions.sql")).read()
    sql = sql.replace("SELECT 'user_sessions table ready' AS status;", "")
    conn.execute(text(sql))
    print("[SUCCESS] user_sessions table ready.")
