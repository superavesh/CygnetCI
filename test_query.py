import sys
sys.path.insert(0, r'd:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Api')
from database import SessionLocal
from models import Agent

db = SessionLocal()

print("All agents:")
all_agents = db.query(Agent).all()
for agent in all_agents:
    print(f"  ID: {agent.id}, Name: {agent.name}, Customer ID: {agent.customer_id}")

print("\nAgents for customer_id=1:")
agents_1 = db.query(Agent).filter(Agent.customer_id == 1).all()
for agent in agents_1:
    print(f"  ID: {agent.id}, Name: {agent.name}, Customer ID: {agent.customer_id}")

print("\nAgents for customer_id=3:")
agents_3 = db.query(Agent).filter(Agent.customer_id == 3).all()
for agent in agents_3:
    print(f"  ID: {agent.id}, Name: {agent.name}, Customer ID: {agent.customer_id}")

db.close()
