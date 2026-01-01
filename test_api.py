import sys
sys.path.insert(0, r'd:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Api')
from database import SessionLocal
from models import Agent

# This simulates what the API endpoint does
def get_agents(customer_id):
    db = SessionLocal()
    query = db.query(Agent)

    print(f"\nBefore filter: {query}")

    if customer_id:
        print(f"Applying filter for customer_id={customer_id}")
        query = query.filter(Agent.customer_id == customer_id)

    print(f"After filter: {query}")
    print(f"SQL: {query.statement}")

    agents = query.all()
    db.close()
    return agents

# Test with customer_id=3
result = get_agents(customer_id=3)
print(f"\nResult count: {len(result)}")
for agent in result:
    print(f"  Agent: {agent.id}, {agent.name}, customer_id={agent.customer_id}")
