"""Create EmailEngine tables (app_settings, email_templates, email_log,
password_reset_tokens) and seed defaults. Idempotent — safe to re-run.

Works in the repo (../CygnetCI.Database) and the deployed package
(./CygnetCI.Database bundled by build_for_iis.ps1)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text
from config import app_config


def _find_sql(name: str) -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    for cand in (
        os.path.join(here, "CygnetCI.Database", name),
        os.path.join(here, "..", "CygnetCI.Database", name),
        os.path.join(here, name),
    ):
        if os.path.exists(cand):
            return cand
    raise FileNotFoundError(f"Could not locate {name}")


engine = create_engine(app_config.get_database_url())
print("Applying email engine migration...")
with engine.begin() as conn:
    sql = open(_find_sql("005_add_email_engine.sql"), encoding="utf-8").read()
    sql = sql.replace("SELECT 'email engine tables ready' AS status;", "")
    conn.execute(text(sql))
print("[SUCCESS] Email engine tables ready (app_settings, email_templates, email_log, password_reset_tokens).")
