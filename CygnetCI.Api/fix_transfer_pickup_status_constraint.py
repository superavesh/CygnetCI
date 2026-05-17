"""
Migration: fix transfer_file_pickup status check constraint to include 'downloading'

The production DB has constraint 'transfer_file_pickup_status_check' which only
allows ('pending', 'downloaded', 'failed'). The download endpoint sets status to
'downloading' as an intermediate state, causing a CheckViolation 500 error.

This script drops the old constraint and recreates it with 'downloading' included.
"""
from sqlalchemy import create_engine, text
from config import app_config

engine = create_engine(app_config.get_database_url())

print("Fixing transfer_file_pickup status check constraint...")

with engine.begin() as conn:
    # Drop the old constraint (whichever name it was created with)
    conn.execute(text("""
        DO $$
        BEGIN
            -- Drop old constraint if it exists (original name)
            IF EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE table_name = 'transfer_file_pickup'
                AND constraint_name = 'transfer_file_pickup_status_check'
            ) THEN
                ALTER TABLE transfer_file_pickup DROP CONSTRAINT transfer_file_pickup_status_check;
                RAISE NOTICE 'Dropped constraint: transfer_file_pickup_status_check';
            END IF;

            -- Drop new-name constraint if it exists (from model definition)
            IF EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE table_name = 'transfer_file_pickup'
                AND constraint_name = 'check_pickup_status'
            ) THEN
                ALTER TABLE transfer_file_pickup DROP CONSTRAINT check_pickup_status;
                RAISE NOTICE 'Dropped constraint: check_pickup_status';
            END IF;

            -- Add the correct constraint with all valid statuses
            ALTER TABLE transfer_file_pickup
                ADD CONSTRAINT transfer_file_pickup_status_check
                CHECK (status IN ('pending', 'downloading', 'downloaded', 'failed'));
            RAISE NOTICE 'Created constraint: transfer_file_pickup_status_check';
        END $$;
    """))

print("Done. Constraint updated to allow: pending, downloading, downloaded, failed")
