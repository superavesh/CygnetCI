"""
Check release pickups in database
"""
import psycopg2

DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'CygnetCI',
    'user': 'postgres',
    'password': 'Admin@123'
}

try:
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()

    # Check pickups
    cursor.execute("SELECT id, release_execution_id, stage_execution_id, agent_uuid, status, created_at FROM release_pickup ORDER BY created_at DESC LIMIT 10")
    pickups = cursor.fetchall()

    print("Recent release pickups:")
    if pickups:
        for p in pickups:
            print(f"  ID: {p[0]}, Release Exec: {p[1]}, Stage Exec: {p[2]}, Agent: {p[3]}, Status: {p[4]}, Created: {p[5]}")
    else:
        print("  No pickups found")

    # Check stage executions
    cursor.execute("SELECT id, release_execution_id, status, agent_id, agent_name FROM stage_executions ORDER BY id DESC LIMIT 5")
    stages = cursor.fetchall()

    print("\nRecent stage executions:")
    if stages:
        for s in stages:
            print(f"  ID: {s[0]}, Release Exec: {s[1]}, Status: {s[2]}, Agent ID: {s[3]}, Agent Name: {s[4]}")
    else:
        print("  No stage executions found")

    cursor.close()
    conn.close()

except Exception as e:
    print(f"Error: {e}")
