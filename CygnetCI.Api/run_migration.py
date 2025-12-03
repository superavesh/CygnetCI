"""
Run database migration for execution logs schema
"""
import psycopg2
import sys

# Database configuration
DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'CygnetCI',
    'user': 'postgres',
    'password': 'Admin@123'
}

def run_migration():
    """Execute the execution_logs_schema.sql migration"""
    try:
        # Read the SQL file
        sql_file_path = r'd:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Database\execution_logs_schema.sql'
        with open(sql_file_path, 'r') as f:
            sql_script = f.read()

        # Connect to database
        print(f"Connecting to database {DB_CONFIG['database']}...")
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = True
        cursor = conn.cursor()

        # Execute the migration
        print("Running migration script...")
        cursor.execute(sql_script)

        print("[SUCCESS] Migration completed successfully!")
        print("\nCreated tables:")
        print("  - pipeline_execution_logs")
        print("  - stage_execution_logs")
        print("\nAdded columns:")
        print("  - release_stages.agent_id")
        print("  - stage_executions.agent_id, agent_name")
        print("  - pipeline_executions.agent_id, agent_name")

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
