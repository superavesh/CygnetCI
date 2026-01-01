"""
Script to create users and user_customers tables
"""
from sqlalchemy import create_engine, text
from config import app_config

# Connect to database
engine = create_engine(app_config.get_database_url())

print("Creating users and user_customers tables...")

with engine.begin() as conn:
    try:
        # Read and execute the SQL migration file
        sql_file_path = '../CygnetCI.Database/002_add_users_table.sql'

        with open(sql_file_path, 'r') as f:
            sql_commands = f.read()

        # Execute the SQL (remove the verification queries for Python execution)
        sql_commands = sql_commands.replace("SELECT 'Users table created successfully' AS status;", "")
        sql_commands = sql_commands.replace("SELECT * FROM users;", "")
        sql_commands = sql_commands.replace("SELECT * FROM user_customers;", "")

        conn.execute(text(sql_commands))

        print("\n[SUCCESS] Users tables created successfully!")
        print("\nDefault admin user created:")
        print("  Username: admin")
        print("  Password: admin123")
        print("  Email: admin@cygnetci.com")
        print("\nYou can now:")
        print("1. Restart the API server")
        print("2. Test the users API: curl http://localhost:8000/users")
        print("3. Login with admin/admin123")

        # Verify tables were created
        result = conn.execute(text("SELECT COUNT(*) FROM users"))
        user_count = result.scalar()
        print(f"\nUsers in database: {user_count}")

    except Exception as e:
        print(f"\n[ERROR] Migration failed: {str(e)}")
        raise
