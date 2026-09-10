"""
Fix artifact_metadata column name mismatch
"""
import psycopg2

from config import app_config

def fix_metadata_column():
    """Rename metadata column to artifact_metadata if it exists"""
    try:
        print("Connecting to database...")
        conn = psycopg2.connect(
            host=app_config.get_db_host(),
            port=app_config.get_db_port(),
            database=app_config.get_db_name(),
            user=app_config.get_db_username(),
            password=app_config.get_db_password(),
        )
        conn.autocommit = True
        cursor = conn.cursor()

        # Check if 'metadata' column exists
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'artifacts' AND column_name = 'metadata'
        """)

        if cursor.fetchone():
            print("Found 'metadata' column, renaming to 'artifact_metadata'...")
            cursor.execute("ALTER TABLE artifacts RENAME COLUMN metadata TO artifact_metadata;")
            print("[SUCCESS] Column renamed successfully!")
        else:
            # Check if artifact_metadata already exists
            cursor.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'artifacts' AND column_name = 'artifact_metadata'
            """)

            if cursor.fetchone():
                print("[INFO] Column 'artifact_metadata' already exists. No action needed.")
            else:
                print("[WARNING] Neither 'metadata' nor 'artifact_metadata' column found!")

        cursor.close()
        conn.close()

    except psycopg2.Error as e:
        print(f"[ERROR] Database error: {e}")
    except Exception as e:
        print(f"[ERROR] Unexpected error: {e}")

if __name__ == "__main__":
    fix_metadata_column()
