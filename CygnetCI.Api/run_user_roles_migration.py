"""
Script to add the user_roles table and reconcile user_customers columns.
Idempotent — safe to run multiple times.
"""
from sqlalchemy import create_engine, text
from config import app_config

engine = create_engine(app_config.get_database_url())

print("Applying user_roles migration...")

with engine.begin() as conn:
    try:
        sql_file_path = '../CygnetCI.Database/003_add_user_roles.sql'
        with open(sql_file_path, 'r') as f:
            sql_commands = f.read()

        # Strip the verification SELECT (not needed for programmatic execution)
        sql_commands = sql_commands.replace("SELECT 'user_roles table ready' AS status;", "")

        conn.execute(text(sql_commands))
        print("\n[SUCCESS] user_roles table created and user_customers reconciled.")

        result = conn.execute(text("SELECT COUNT(*) FROM user_roles"))
        print(f"Rows in user_roles: {result.scalar()}")
    except Exception as e:
        print(f"\n[ERROR] Migration failed: {str(e)}")
        raise
