# 🚀 CygnetCI FastAPI + PostgreSQL Setup Guide

## 📋 Prerequisites

- Python 3.8 or higher
- PostgreSQL 12 or higher
- pip (Python package manager)

---

## 🗂️ Project Structure

```
cygnetci-api/
├── main.py              # FastAPI application
├── models.py            # SQLAlchemy ORM models
├── database.py          # Database configuration
├── requirements.txt     # Python dependencies
├── .env                 # Environment variables
└── README.md           # Documentation
```

---

## 📦 Step 1: Install PostgreSQL

### On Ubuntu/Debian:
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### On macOS (using Homebrew):
```bash
brew install postgresql
brew services start postgresql
```

### On Windows:
Download and install from: https://www.postgresql.org/download/windows/

---

## 🔧 Step 2: Create Database

```bash
# Login to PostgreSQL
sudo -u postgres psql

# Or on Windows/macOS:
psql -U postgres

# Create database and user
CREATE DATABASE cygnetci;
CREATE USER cygnetci_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE cygnetci TO cygnetci_user;

# Exit
\q
```

---

## 📝 Step 3: Create Python Project

```bash
# Create project directory
mkdir cygnetci-api
cd cygnetci-api

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Linux/macOS:
source venv/bin/activate

# On Windows:
venv\Scripts\activate
```

---

## 📦 Step 4: Create requirements.txt

Create a file named `requirements.txt` with the following content:

```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
sqlalchemy==2.0.23
psycopg2-binary==2.9.9
python-dotenv==1.0.0
pydantic==2.5.0
alembic==1.12.1
```

Install dependencies:
```bash
pip install -r requirements.txt
```

---

## 🔐 Step 5: Create .env File

Create a file named `.env`:

```env
DATABASE_URL=postgresql://cygnetci_user:your_secure_password@localhost:5432/cygnetci
API_HOST=0.0.0.0
API_PORT=8000
DEBUG=True
```

---

## 🗄️ Step 6: Create database.py

Create a file named `database.py`:

```python
# database.py
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

# Database URL
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost:5432/cygnetci")

# Create engine
engine = create_engine(DATABASE_URL)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

---

## 📊 Step 7: Initialize Database Schema

```bash
# Run the SQL schema file
psql -U cygnetci_user -d cygnetci -f database_schema.sql

# Or connect and paste the SQL
psql -U cygnetci_user -d cygnetci
# Then paste the contents of database_schema.sql
```

---

## 🔄 Step 8: Update main.py with Database Integration

Add database dependency to your endpoints:

```python
from sqlalchemy.orm import Session
from database import get_db
import models

@app.get("/agents", response_model=List[Agent])
def get_agents(db: Session = Depends(get_db)):
    """Get all agents"""
    agents = db.query(models.Agent).all()
    
    # Format data for frontend
    result = []
    for agent in agents:
        result.append({
            "id": agent.id,
            "name": agent.name,
            "status": agent.status,
            "lastSeen": relative_time(agent.last_seen),
            "jobs": agent.jobs,
            "location": agent.location,
            "cpu": agent.cpu,
            "memory": agent.memory,
            "resourceData": []
        })
    
    return result
```

---

## ⚡ Step 9: Run the API

```bash
# Make sure virtual environment is activated
# Start the server
python main.py

# Or use uvicorn directly
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at:
- API: http://localhost:8000
- Swagger Docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

---

## 🧪 Step 10: Test the API

### Using curl:

```bash
# Get all agents
curl http://localhost:8000/agents

# Get dashboard data
curl http://localhost:8000/data

# Create an agent
curl -X POST http://localhost:8000/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Agent",
    "uuid": "550e8400-e29b-41d4-a716-446655440005",
    "location": "Server-5",
    "description": "Test agent"
  }'
```

### Using Python requests:

```python
import requests

# Get agents
response = requests.get("http://localhost:8000/agents")
print(response.json())

# Create agent
data = {
    "name": "Test Agent",
    "uuid": "550e8400-e29b-41d4-a716-446655440005",
    "location": "Server-5"
}
response = requests.post("http://localhost:8000/agents", json=data)
print(response.json())
```

---

## 🔗 Step 11: Connect Frontend to API

Update your Next.js frontend config:

```typescript
// src/lib/config.ts
export const CONFIG = {
  api: {
    baseUrl: 'http://localhost:8000',
    endpoints: {
      allData: '/data',
    },
  },
  app: {
    useRealAPI: true  // ← Set to true
  }
};
```

Restart your Next.js dev server:
```bash
npm run dev
```

---

## 📚 Useful Database Queries

### View all agents:
```sql
SELECT * FROM agents;
```

### View recent logs:
```sql
SELECT * FROM agent_logs 
WHERE agent_id = 1 
ORDER BY timestamp DESC 
LIMIT 50;
```

### Get active agents count:
```sql
SELECT COUNT(*) FROM agents WHERE status = 'online';
```

### Get pipeline statistics:
```sql
SELECT 
    status,
    COUNT(*) as count
FROM pipelines
GROUP BY status;
```

---

## 🔧 Troubleshooting

### Issue: "connection refused"
**Solution:** Check if PostgreSQL is running:
```bash
sudo systemctl status postgresql

# Or start it:
sudo systemctl start postgresql
```

### Issue: "authentication failed"
**Solution:** Check your .env file has correct credentials

### Issue: "relation does not exist"
**Solution:** Run the database schema SQL file again

### Issue: "port 8000 already in use"
**Solution:** Kill the process or use different port:
```bash
# Kill process on port 8000
lsof -ti:8000 | xargs kill -9

# Or use different port
uvicorn main:app --port 8001
```

---

## 🚀 Production Deployment

### Using Docker:

Create `Dockerfile`:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: cygnetci
      POSTGRES_USER: cygnetci_user
      POSTGRES_PASSWORD: your_secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://cygnetci_user:your_secure_password@db:5432/cygnetci
    depends_on:
      - db

volumes:
  postgres_data:
```

Run with Docker:
```bash
docker-compose up -d
```

---

## 📊 Database Migrations (Using Alembic)

Initialize Alembic:
```bash
alembic init alembic
```

Create migration:
```bash
alembic revision --autogenerate -m "Initial migration"
```

Apply migration:
```bash
alembic upgrade head
```

---

## 🔐 Security Best Practices

1. **Change default passwords** in production
2. **Use environment variables** for sensitive data
3. **Enable HTTPS** in production
4. **Add authentication** (JWT tokens)
5. **Rate limiting** to prevent abuse
6. **Input validation** on all endpoints
7. **SQL injection protection** (SQLAlchemy handles this)

---

## 📈 Performance Optimization

1. **Add database indexes** (already included in schema)
2. **Use connection pooling** (SQLAlchemy default)
3. **Cache frequently accessed data** (Redis)
4. **Paginate large result sets**
5. **Use async endpoints** for I/O operations

---

## 🎯 Next Steps

1. ✅ Implement all endpoint logic (currently stubs)
2. ✅ Add authentication/authorization
3. ✅ Implement real-time updates (WebSockets)
4. ✅ Add monitoring and logging
5. ✅ Write unit tests
6. ✅ Set up CI/CD pipeline
7. ✅ Deploy to production

---

## 📚 Additional Resources

- **FastAPI Docs:** https://fastapi.tiangolo.com/
- **SQLAlchemy Docs:** https://docs.sqlalchemy.org/
- **PostgreSQL Docs:** https://www.postgresql.org/docs/
- **Swagger/OpenAPI:** http://localhost:8000/docs

---

## ✅ Checklist

- [ ] PostgreSQL installed and running
- [ ] Database created
- [ ] Python virtual environment set up
- [ ] Dependencies installed
- [ ] .env file configured
- [ ] Database schema created
- [ ] API server running
- [ ] Tested endpoints via Swagger UI
- [ ] Frontend connected to API
- [ ] Sample data inserted

---

**You're all set! Start building your CI/CD platform! 🚀**