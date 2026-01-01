from database import engine
from sqlalchemy import text

# Read SQL file
with open('../CygnetCI.Database/pipeline_pickup_schema.sql', 'r') as f:
    sql = f.read()

# Execute SQL
with engine.begin() as conn:
    conn.execute(text(sql))

print("Pipeline_pickup table created successfully")
