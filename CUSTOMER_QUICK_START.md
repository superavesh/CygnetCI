# CygnetCI Customer/Tenant Support - Quick Start Guide

## 🚀 Quick Implementation Steps

### 1️⃣ Database Setup (5 minutes)

```bash
# Run the migration script
psql -U postgres -d cygnetci_db -f CygnetCI.Database/001_add_customer_tenant_support.sql
```

**What happens:**
- ✅ Creates `customers` and `user_customers` tables
- ✅ Adds `customer_id` to agents, pipelines, releases, services
- ✅ Creates default customer and migrates existing data
- ✅ Sets up indexes and views

### 2️⃣ Backend API Setup (2 minutes)

Update `main.py`:

```python
# Add this import at the top
from customer_api import router as customer_router

# Add this after creating the app
app.include_router(customer_router)
```

**Restart your API server:**
```bash
cd CygnetCI.Api
python main.py
```

### 3️⃣ Test API (1 minute)

```bash
# List customers
curl http://localhost:8000/customers/

# Create a new customer
curl -X POST http://localhost:8000/customers/ \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-customer",
    "display_name": "Test Customer",
    "description": "Test customer for demo"
  }'
```

### 4️⃣ Update C# Agent Config (1 minute)

Edit `appsettings.json`:

```json
{
  "AgentConfiguration": {
    "CustomerId": 1,  // ← Add this line
    "ServerUrl": "http://localhost:8000",
    // ... rest of config
  }
}
```

**Rebuild and restart agent:**
```bash
cd CygnetCI.Agent
dotnet build
dotnet run
```

### 5️⃣ Frontend Setup (10 minutes)

#### Create Customer Context

Create `lib/contexts/CustomerContext.tsx`:
```typescript
// See full implementation in CUSTOMER_TENANT_IMPLEMENTATION_GUIDE.md
```

#### Create Customer Selector Component

Create `components/CustomerSelector.tsx`:
```typescript
// See full implementation in CUSTOMER_TENANT_IMPLEMENTATION_GUIDE.md
```

#### Update Layout

Update `app/layout.tsx`:
```typescript
import { CustomerProvider } from '@/lib/contexts/CustomerContext';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <CustomerProvider>
          {children}
        </CustomerProvider>
      </body>
    </html>
  );
}
```

#### Add Customer Selector to Header

```typescript
import CustomerSelector from '@/components/CustomerSelector';

export default function Header() {
  return (
    <header>
      <h1>CygnetCI</h1>
      <CustomerSelector />  {/* ← Add this */}
    </header>
  );
}
```

### 6️⃣ Update Data Fetching (per page)

In each page (agents, pipelines, releases):

```typescript
import { useCustomer } from '@/lib/contexts/CustomerContext';

export default function AgentsPage() {
  const { selectedCustomer } = useCustomer();

  useEffect(() => {
    if (selectedCustomer) {
      fetch(`http://localhost:8000/agents?customer_id=${selectedCustomer.id}`)
        .then(res => res.json())
        .then(data => setAgents(data));
    }
  }, [selectedCustomer]);
}
```

## 📊 Customer Hierarchy

```
Customer (Acme Corp)
├── Agent 1 (Production)
│   ├── Pipeline: Build API
│   │   └── Executions
│   └── Pipeline: Deploy Web
│       └── Executions
├── Agent 2 (Staging)
│   └── Pipeline: Integration Tests
├── Release: v1.0
│   ├── Stage: Development
│   ├── Stage: QA
│   └── Stage: Production
└── Services
    ├── API Health Check
    └── Database Monitor
```

## 🎯 Key API Endpoints

### Customer Management
```bash
GET    /customers/                          # List all
GET    /customers/{id}                      # Get one
GET    /customers/{id}/statistics           # Get stats
POST   /customers/                          # Create
PUT    /customers/{id}                      # Update
DELETE /customers/{id}                      # Delete
POST   /customers/{id}/activate             # Activate
POST   /customers/{id}/deactivate           # Deactivate
```

### User Assignment
```bash
GET    /customers/{id}/users                # Get customer users
POST   /customers/{id}/users                # Assign user
DELETE /customers/{id}/users/{user_id}     # Remove user
POST   /customers/{id}/users/{user_id}/set-default  # Set default
```

### Resource Filtering
```bash
GET /agents?customer_id=1          # Filter agents
GET /pipelines?customer_id=1       # Filter pipelines
GET /releases?customer_id=1        # Filter releases
GET /services?customer_id=1        # Filter services
```

## 🧪 Testing Customer Isolation

### Create Two Customers

```bash
# Customer 1: Acme Corp
curl -X POST http://localhost:8000/customers/ \
  -H "Content-Type: application/json" \
  -d '{
    "name": "acme-corp",
    "display_name": "Acme Corporation",
    "contact_email": "admin@acme.com"
  }'

# Customer 2: TechStart Inc
curl -X POST http://localhost:8000/customers/ \
  -H "Content-Type: application/json" \
  -d '{
    "name": "techstart",
    "display_name": "TechStart Inc",
    "contact_email": "admin@techstart.com"
  }'
```

### Create Agents for Each

```bash
# Agent for Acme Corp (customer_id=1)
curl -X POST http://localhost:8000/agents \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": 1,
    "name": "Acme Agent 1",
    "uuid": "acme-001",
    "location": "Production"
  }'

# Agent for TechStart (customer_id=2)
curl -X POST http://localhost:8000/agents \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": 2,
    "name": "TechStart Agent 1",
    "uuid": "tech-001",
    "location": "Staging"
  }'
```

### Verify Isolation

```bash
# Get only Acme Corp agents
curl http://localhost:8000/agents?customer_id=1

# Get only TechStart agents
curl http://localhost:8000/agents?customer_id=2
```

## ✅ Verification Checklist

After implementation, verify:

- [ ] Can create new customers via API
- [ ] Can see customer selector in Next.js header
- [ ] Switching customers filters all data (agents, pipelines, releases)
- [ ] Creating new agent requires customer_id
- [ ] Cannot see other customer's data when switched
- [ ] Customer statistics show correct counts
- [ ] Agent configuration includes CustomerId
- [ ] Database has customer_id indexes
- [ ] Default customer exists with migrated data

## 🔍 Troubleshooting

### Problem: No customers showing in dropdown

**Check:**
```sql
SELECT * FROM customers;
```

**Fix:**
```sql
INSERT INTO customers (name, display_name, is_active)
VALUES ('default', 'Default Customer', TRUE);
```

### Problem: Agents not showing up

**Check:**
```sql
SELECT id, name, customer_id FROM agents;
```

**Fix:**
```sql
UPDATE agents SET customer_id = 1 WHERE customer_id IS NULL;
```

### Problem: Cannot create agent

**Error:** `customer_id violates not-null constraint`

**Fix:** Ensure you're passing `customer_id` in the request body.

## 📱 UI Features to Add

### Customer Management Page

Path: `app/customers/page.tsx`

Features:
- ✅ List all customers
- ✅ Create new customer
- ✅ Edit customer details
- ✅ Activate/deactivate customer
- ✅ View customer statistics
- ✅ Assign users to customer

### Dashboard Enhancements

- ✅ Customer selector in header
- ✅ Customer-specific statistics cards
- ✅ Customer logo display
- ✅ Quick switch between customers
- ✅ Recent activity per customer

### Agent Page Updates

- ✅ Filter agents by selected customer
- ✅ Show customer name in agent list
- ✅ Customer badge on agent cards
- ✅ Cannot create agent without customer

## 🚨 Important Notes

1. **Data Migration**: The migration script creates a "default" customer and assigns all existing data to it
2. **Cascade Deletes**: Deleting a customer will delete all its agents, pipelines, releases, and services
3. **User Access**: Users can be assigned to multiple customers via `user_customers` table
4. **Agent Config**: Each agent must be configured with a `CustomerId` in `appsettings.json`
5. **API Filtering**: Always pass `customer_id` when filtering resources

## 📚 Full Documentation

For complete implementation details, see:
[CUSTOMER_TENANT_IMPLEMENTATION_GUIDE.md](./CUSTOMER_TENANT_IMPLEMENTATION_GUIDE.md)

## 🎉 You're Done!

Your CygnetCI platform now supports multi-tenant customer segregation!

Switch between customers in the UI and watch as all data (agents, pipelines, releases, services) automatically filters to show only that customer's resources.

---

**Need Help?**
- Check the full implementation guide
- Review the database schema in `models.py`
- Inspect the API endpoints in `customer_api.py`
- Look at migration script: `001_add_customer_tenant_support.sql`
