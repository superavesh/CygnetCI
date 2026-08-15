"""
Run database migration for release_pickup table
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
    """Execute the release_pickup_schema.sql migration"""
    try:
        # Read the SQL file
        sql_file_path = r'd:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Database\release_pickup_schema.sql'
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
