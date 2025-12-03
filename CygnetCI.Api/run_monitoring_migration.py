from database import engine
from sqlalchemy import text

def run_monitoring_migration():
    """Create tables for agent monitoring data"""

    with open('../CygnetCI.Database/agent_monitoring_data_schema.sql', 'r') as f:
        sql = f.read()

    with engine.begin() as conn:
        # Execute each statement separately
        statements = sql.split(';')
        for statement in statements:
            statement = statement.strip()
            if statement:
                print(f"Executing: {statement[:100]}...")
                conn.execute(text(statement))

        print("✓ Monitoring data tables created successfully!")

if __name__ == "__main__":
    run_monitoring_migration()
