"""
Run database migration for release_pickup table
"""
import os
import psycopg2
import sys

from config import app_config

def run_migration():
    """Execute the release_pickup_schema.sql migration"""
    try:
        # Read the SQL file
        sql_file_path = os.path.join(
            os.path.dirname(__file__), '..', 'CygnetCI.Database', 'release_pickup_schema.sql'
        )
        with open(sql_file_path, 'r') as f:
            sql_script = f.read()

        # Connect to database using the same config.ini the app uses
        print(f"Connecting to database {app_config.get_db_name()}...")
        conn = psycopg2.connect(
            host=app_config.get_db_host(),
            port=app_config.get_db_port(),
            database=app_config.get_db_name(),
            user=app_config.get_db_username(),
            password=app_config.get_db_password(),
        )
        conn.autocommit = True
        cursor = conn.cursor()

        # Execute the migration
        print("Running migration script...")
        cursor.execute(sql_script)

        print("[SUCCESS] Migration completed successfully!")
        print("\nCreated table:")
        print("  - release_pickup")
        print("\nIndexes created:")
        print("  - idx_release_pickup_agent_uuid")
        print("  - idx_release_pickup_status")
        print("  - idx_release_pickup_created_at")
        print("  - idx_release_pickup_agent_status")

        cursor.close()
        conn.close()

    except psycopg2.Error as e:
        print(f"[ERROR] Database error: {e}")
        sys.exit(1)
    except FileNotFoundError as e:
        print(f"[ERROR] SQL file not found: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_migration()
