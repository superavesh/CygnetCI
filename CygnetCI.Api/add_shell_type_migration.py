from database import engine
from sqlalchemy import text

def run_migration():
    with engine.connect() as conn:
        # Start transaction
        trans = conn.begin()
        try:
            # Check if column already exists
            check_query = text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name='pipeline_steps' AND column_name='shell_type';
            """)
            result = conn.execute(check_query)
            if result.fetchone():
                print("shell_type column already exists, skipping migration")
                trans.rollback()
                return

            # Add shell_type column
            print("Adding shell_type column to pipeline_steps table...")
            conn.execute(text("""
                ALTER TABLE pipeline_steps
                ADD COLUMN shell_type VARCHAR(20) DEFAULT 'cmd';
            """))

            # Add check constraint
            print("Adding check constraint for shell_type...")
            conn.execute(text("""
                ALTER TABLE pipeline_steps
                ADD CONSTRAINT check_shell_type CHECK (shell_type IN ('powershell', 'cmd', 'bash'));
            """))

            # Commit transaction
            trans.commit()
            print("Migration completed successfully!")

        except Exception as e:
            print(f"Migration failed: {e}")
            trans.rollback()
            raise

if __name__ == "__main__":
    run_migration()
