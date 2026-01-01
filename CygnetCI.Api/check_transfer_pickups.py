from database import engine
from sqlalchemy import text

def check_transfer_pickups():
    with engine.connect() as conn:
        # Check transfer files
        print("\nTransfer Files:")
        result = conn.execute(text("""
            SELECT id, file_name, file_type, version, created_at
            FROM transfer_files
            ORDER BY id DESC
            LIMIT 5
        """))
        files = result.fetchall()
        if files:
            for file in files:
                print(f"  File ID: {file[0]}, Name: {file[1]}, Type: {file[2]}, Version: {file[3]}")
        else:
            print("  No files found")

        # Check transfer pickups
        print("\nTransfer Pickups:")
        result = conn.execute(text("""
            SELECT id, transfer_file_id, agent_name, status, requested_at, downloaded_at
            FROM transfer_file_pickup
            ORDER BY id DESC
            LIMIT 10
        """))
        pickups = result.fetchall()
        if pickups:
            for pickup in pickups:
                print(f"  Pickup ID: {pickup[0]}, File ID: {pickup[1]}, Agent: {pickup[2]}, Status: {pickup[3]}, Requested: {pickup[4]}, Downloaded: {pickup[5]}")
        else:
            print("  No pickups found")

if __name__ == "__main__":
    check_transfer_pickups()
