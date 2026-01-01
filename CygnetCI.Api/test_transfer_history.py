import requests
import json
import sys
from database import engine
from sqlalchemy import text

# Fix unicode encoding for Windows console
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

API_BASE = "http://127.0.0.1:8000"

def test_transfer_history():
    """Test the transfer history by pushing a file and checking the history"""

    print("=" * 80)
    print("TRANSFER HISTORY FIX VERIFICATION")
    print("=" * 80)

    # Step 1: Get list of files
    print("\n1. Checking available transfer files...")
    response = requests.get(f"{API_BASE}/transfer/files")
    if response.status_code == 200:
        files = response.json()
        if not files:
            print("   ❌ No transfer files found. Please upload a file first.")
            return

        file = files[0]  # Use first available file
        print(f"   ✓ Found file: {file['file_name']} (ID: {file['id']}, Version: {file['version']})")
    else:
        print(f"   ❌ Failed to fetch files: {response.status_code}")
        return

    # Step 2: Get list of agents
    print("\n2. Checking available agents...")
    response = requests.get(f"{API_BASE}/agents")
    if response.status_code == 200:
        agents = response.json()
        if not agents:
            print("   ❌ No agents found. Please start an agent first.")
            return

        agent = agents[0]  # Use first available agent
        print(f"   ✓ Found agent: {agent['name']} (UUID: {agent['uuid'][:16]}...)")
    else:
        print(f"   ❌ Failed to fetch agents: {response.status_code}")
        return

    # Step 3: Check current transfer history
    print(f"\n3. Checking current transfer history for file {file['id']}...")
    response = requests.get(f"{API_BASE}/transfer/files/{file['id']}/history")
    if response.status_code == 200:
        history = response.json()
        print(f"   Current statistics:")
        print(f"   - Total downloads: {history['statistics']['total_downloads']}")
        print(f"   - Successful: {history['statistics']['successful']}")
        print(f"   - Failed: {history['statistics']['failed']}")
        print(f"   - Pending: {history['statistics']['pending']}")

    # Step 4: Push file to agent
    print(f"\n4. Pushing file {file['id']} to agent {agent['name']}...")
    push_data = {
        "transfer_file_id": file['id'],
        "agent_uuid": agent['uuid'],
        "agent_name": agent['name'],
        "requested_by": "test_script"
    }
    response = requests.post(f"{API_BASE}/transfer/push", json=push_data)
    if response.status_code == 200:
        result = response.json()
        print(f"   ✓ {result['message']}")
        pickup_id = result['pickup_id']
        print(f"   Pickup ID: {pickup_id}")
    else:
        print(f"   ❌ Failed to push file: {response.status_code} - {response.text}")
        return

    # Step 5: Wait for agent to download (check database)
    print(f"\n5. Checking if pickup record was created in database...")
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT id, status, agent_name, requested_at, downloaded_at, acknowledged_at
            FROM transfer_file_pickup
            WHERE id = :pickup_id
        """), {"pickup_id": pickup_id})
        pickup = result.fetchone()

        if pickup:
            print(f"   ✓ Pickup record found:")
            print(f"     - Status: {pickup[1]}")
            print(f"     - Agent: {pickup[2]}")
            print(f"     - Requested: {pickup[3]}")
            print(f"     - Downloaded: {pickup[4]}")
            print(f"     - Acknowledged: {pickup[5]}")
        else:
            print(f"   ❌ Pickup record not found in database!")
            return

    # Step 6: Check updated transfer history
    print(f"\n6. Checking updated transfer history...")
    response = requests.get(f"{API_BASE}/transfer/files/{file['id']}/history")
    if response.status_code == 200:
        history = response.json()
        print(f"   Updated statistics:")
        print(f"   - Total downloads: {history['statistics']['total_downloads']}")
        print(f"   - Successful: {history['statistics']['successful']}")
        print(f"   - Failed: {history['statistics']['failed']}")
        print(f"   - Pending: {history['statistics']['pending']}")

        if history['history']:
            print(f"\n   Recent history entries:")
            for entry in history['history'][:3]:
                print(f"   - {entry['agent_name']}: {entry['status']} at {entry['requested_at']}")

    # Step 7: Summary
    print("\n" + "=" * 80)
    print("✓ VERIFICATION COMPLETE")
    print("=" * 80)
    print("\nKEY FIX:")
    print("- Pickup records are now KEPT in the database after acknowledgment")
    print("- Previously, they were DELETED, which prevented transfer history")
    print("- Now when agent acknowledges download, record is marked with acknowledged_at")
    print("- This preserves full transfer history for all file downloads")
    print("\nNOTE:")
    print("- Wait for the agent to download the file (polls every 10 seconds)")
    print("- The pickup status will change from 'pending' to 'downloaded'")
    print("- After agent acknowledges, the record will have acknowledged_at timestamp")
    print("- The record will remain in database for historical tracking")

if __name__ == "__main__":
    test_transfer_history()
