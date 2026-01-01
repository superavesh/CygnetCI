"""
Script to add customer_id columns to existing tables
"""
from sqlalchemy import create_engine, text
from config import app_config

# Connect to database
engine = create_engine(app_config.get_database_url())

print("Adding customer_id columns to existing tables...")

with engine.begin() as conn:
    try:
        # Add customer_id to agents if it doesn't exist
        print("  - Adding customer_id to agents...")
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='agents' AND column_name='customer_id'
                ) THEN
                    ALTER TABLE agents ADD COLUMN customer_id INTEGER;
                END IF;
            END $$;
        """))

        # Add customer_id to pipelines
        print("  - Adding customer_id to pipelines...")
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='pipelines' AND column_name='customer_id'
                ) THEN
                    ALTER TABLE pipelines ADD COLUMN customer_id INTEGER;
                END IF;
            END $$;
        """))

        # Add customer_id to releases
        print("  - Adding customer_id to releases...")
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='releases' AND column_name='customer_id'
                ) THEN
                    ALTER TABLE releases ADD COLUMN customer_id INTEGER;
                END IF;
            END $$;
        """))

        # Add customer_id to services
        print("  - Adding customer_id to services...")
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='services' AND column_name='customer_id'
                ) THEN
                    ALTER TABLE services ADD COLUMN customer_id INTEGER;
                END IF;
            END $$;
        """))

        # Get default customer ID
        result = conn.execute(text("SELECT id FROM customers WHERE name = 'default' LIMIT 1"))
        row = result.fetchone()

        if row:
            default_customer_id = row[0]
            print(f"\nDefault customer ID: {default_customer_id}")
        else:
            print("\nCreating default customer...")
            result = conn.execute(text("""
                INSERT INTO customers (name, display_name, description, is_active)
                VALUES ('default', 'Default Customer', 'Default customer for existing data', TRUE)
                RETURNING id
            """))
            default_customer_id = result.fetchone()[0]
            print(f"Default customer created with ID: {default_customer_id}")

        # Update existing records
        print("\nMigrating existing data to default customer...")

        result = conn.execute(text(f"UPDATE agents SET customer_id = {default_customer_id} WHERE customer_id IS NULL"))
        print(f"  - Updated {result.rowcount} agents")

        result = conn.execute(text(f"UPDATE pipelines SET customer_id = {default_customer_id} WHERE customer_id IS NULL"))
        print(f"  - Updated {result.rowcount} pipelines")

        result = conn.execute(text(f"UPDATE releases SET customer_id = {default_customer_id} WHERE customer_id IS NULL"))
        print(f"  - Updated {result.rowcount} releases")

        result = conn.execute(text(f"UPDATE services SET customer_id = {default_customer_id} WHERE customer_id IS NULL"))
        print(f"  - Updated {result.rowcount} services")

        # Add foreign key constraints and make columns NOT NULL
        print("\nAdding constraints...")

        conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='customer_id' AND is_nullable='YES') THEN
                    ALTER TABLE agents ALTER COLUMN customer_id SET NOT NULL;
                    ALTER TABLE agents ADD CONSTRAINT fk_agents_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
                    CREATE INDEX IF NOT EXISTS idx_agents_customer_id ON agents(customer_id);
                END IF;
            END $$;
        """))

        conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pipelines' AND column_name='customer_id' AND is_nullable='YES') THEN
                    ALTER TABLE pipelines ALTER COLUMN customer_id SET NOT NULL;
                    ALTER TABLE pipelines ADD CONSTRAINT fk_pipelines_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
                    CREATE INDEX IF NOT EXISTS idx_pipelines_customer_id ON pipelines(customer_id);
                END IF;
            END $$;
        """))

        conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='releases' AND column_name='customer_id' AND is_nullable='YES') THEN
                    ALTER TABLE releases ALTER COLUMN customer_id SET NOT NULL;
                    ALTER TABLE releases ADD CONSTRAINT fk_releases_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
                    CREATE INDEX IF NOT EXISTS idx_releases_customer_id ON releases(customer_id);
                END IF;
            END $$;
        """))

        conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='customer_id' AND is_nullable='YES') THEN
                    ALTER TABLE services ALTER COLUMN customer_id SET NOT NULL;
                    ALTER TABLE services ADD CONSTRAINT fk_services_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
                    CREATE INDEX IF NOT EXISTS idx_services_customer_id ON services(customer_id);
                END IF;
            END $$;
        """))

        print("\n[SUCCESS] Customer columns migration completed!")
        print("\nYou can now:")
        print("1. Restart the API server")
        print("2. Test the customer API: curl http://localhost:8000/customers/")
        print("3. View all agents with customer: curl http://localhost:8000/agents?customer_id=1")

    except Exception as e:
        print(f"\n[ERROR] Migration failed: {str(e)}")
        raise
