"""
Script to run the customer/tenant database migration
"""
from sqlalchemy import create_engine, text
from config import app_config

# Read the migration SQL file
migration_file = r"d:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Database\001_add_customer_tenant_support.sql"

with open(migration_file, 'r', encoding='utf-8') as f:
    migration_sql = f.read()

# Connect to database using SQLAlchemy (uses the same connection string as the app)
engine = create_engine(app_config.get_database_url())
conn = engine.raw_connection()

try:
    print("Running customer/tenant migration...")
    cursor = conn.cursor()

    # Execute the migration
    cursor.execute(migration_sql)

    conn.commit()
    print("[SUCCESS] Migration completed successfully!")
    print("\nCustomer tables created:")
    print("  - customers")
    print("  - user_customers")
    print("\nColumns added:")
    print("  - agents.customer_id")
    print("  - pipelines.customer_id")
    print("  - releases.customer_id")
    print("  - services.customer_id")
    print("\nDefault customer created and existing data migrated.")

    # Verify default customer
    cursor.execute("SELECT id, name, display_name FROM customers WHERE name = 'default'")
    result = cursor.fetchone()
    if result:
        print(f"\nDefault customer: ID={result[0]}, Name={result[1]}, Display={result[2]}")

    cursor.close()

except Exception as e:
    conn.rollback()
    print(f"[ERROR] Migration failed: {str(e)}")
    raise

finally:
    conn.close()
