"""
Script to add parent_agent_id column to agents table
"""
from sqlalchemy import create_engine, text
from config import app_config

engine = create_engine(app_config.get_database_url())

print("Adding parent_agent_id column to agents table...")

with engine.begin() as conn:
    try:
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='agents' AND column_name='parent_agent_id'
                ) THEN
                    ALTER TABLE agents ADD COLUMN parent_agent_id INTEGER;
                    ALTER TABLE agents ADD CONSTRAINT fk_agents_parent_agent
                        FOREIGN KEY (parent_agent_id) REFERENCES agents(id) ON DELETE SET NULL;
                    CREATE INDEX IF NOT EXISTS idx_agents_parent_agent_id ON agents(parent_agent_id);
                    RAISE NOTICE 'parent_agent_id column added successfully.';
                ELSE
                    RAISE NOTICE 'parent_agent_id column already exists, skipping.';
                END IF;
            END $$;
        """))

        print("[SUCCESS] Migration completed — parent_agent_id column is ready.")
        print("Restart the API server to apply changes.")

    except Exception as e:
        print(f"[ERROR] Migration failed: {str(e)}")
        raise