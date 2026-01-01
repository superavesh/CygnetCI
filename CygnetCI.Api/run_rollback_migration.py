# Migration script to create rollback_scripts and rollback_database_objects tables

import psycopg2
from configparser import ConfigParser

def load_config():
    config = ConfigParser()
    config.read('config.ini')
    return config

def run_migration():
    config = load_config()

    # Database connection parameters
    db_config = {
        'host': config.get('database', 'host'),
        'port': config.getint('database', 'port'),
        'database': config.get('database', 'database'),
        'user': config.get('database', 'username'),
        'password': config.get('database', 'password').replace('%%40', '@')
    }

    # SQL statements to create tables
    create_rollback_scripts_table = """
    CREATE TABLE IF NOT EXISTS rollback_scripts (
        id SERIAL PRIMARY KEY,
        script_name VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        file_size_bytes BIGINT,
        checksum VARCHAR(255),
        uploaded_by VARCHAR(255),
        description TEXT,
        analysis_status VARCHAR(50) DEFAULT 'pending',
        analysis_result JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT check_analysis_status CHECK (analysis_status IN ('pending', 'analyzing', 'completed', 'failed'))
    );
    """

    create_rollback_database_objects_table = """
    CREATE TABLE IF NOT EXISTS rollback_database_objects (
        id SERIAL PRIMARY KEY,
        script_id INTEGER NOT NULL REFERENCES rollback_scripts(id) ON DELETE CASCADE,
        database_name VARCHAR(255) NOT NULL,
        object_type VARCHAR(50) NOT NULL,
        object_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT check_object_type CHECK (object_type IN ('table', 'stored_procedure', 'function', 'user_type', 'table_type', 'view', 'trigger', 'index'))
    );
    """

    create_indexes = """
    CREATE INDEX IF NOT EXISTS idx_rollback_scripts_status ON rollback_scripts(analysis_status);
    CREATE INDEX IF NOT EXISTS idx_rollback_database_objects_script_id ON rollback_database_objects(script_id);
    CREATE INDEX IF NOT EXISTS idx_rollback_database_objects_db_name ON rollback_database_objects(database_name);
    """

    conn = None
    cur = None

    try:
        # Connect to database
        print("Connecting to database...")
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor()

        # Create rollback_scripts table
        print("Creating rollback_scripts table...")
        cur.execute(create_rollback_scripts_table)

        # Create rollback_database_objects table
        print("Creating rollback_database_objects table...")
        cur.execute(create_rollback_database_objects_table)

        # Create indexes
        print("Creating indexes...")
        cur.execute(create_indexes)

        # Commit changes
        conn.commit()
        print("Migration completed successfully!")

    except Exception as e:
        print(f"Error during migration: {e}")
        if conn:
            conn.rollback()
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

if __name__ == "__main__":
    run_migration()
