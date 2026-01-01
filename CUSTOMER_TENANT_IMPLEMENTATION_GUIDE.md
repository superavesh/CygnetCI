# CygnetCI Customer/Tenant-Based Architecture Implementation Guide

## Overview

This guide documents the implementation of multi-tenant customer support in CygnetCI. With this architecture, you can now:

- **Group all resources by customer/tenant**
- **One customer can have multiple agents**
- **One agent can have multiple pipelines**
- **One release can have multiple pipelines**
- **Clear visibility and segregation per customer in the Next.js app**

## Architecture Changes

### Database Schema

#### New Tables

1. **customers** - Customer/tenant master table
   - `id` (PK)
   - `name` (unique customer identifier/slug)
   - `display_name` (friendly name for UI)
   - `description`
   - `contact_email`
   - `contact_phone`
   - `address`
   - `is_active` (for soft delete)
   - `logo_url` (customer branding)
   - `settings` (JSONB for customer-specific config)
   - `created_at`, `updated_at`, `created_by`

2. **user_customers** - Many-to-many user-customer mapping
   - `id` (PK)
   - `user_id` (FK to users)
   - `customer_id` (FK to customers)
   - `is_default` (default customer for user)
   - `assigned_at`, `assigned_by`

#### Updated Tables

All core tables now include `customer_id`:
- `agents.customer_id` (FK to customers, NOT NULL, indexed)
- `pipelines.customer_id` (FK to customers, NOT NULL, indexed)
- `releases.customer_id` (FK to customers, NOT NULL, indexed)
- `services.customer_id` (FK to customers, NOT NULL, indexed)

### Data Relationships

```
Customer (1) ──< (N) Agents
                  │
                  └──< (N) Pipelines
                          │
                          └──< (N) Pipeline Executions

Customer (1) ──< (N) Releases
                  │
                  └──< (N) Release Stages
                          │
                          └──< (N) Stage Executions

Customer (1) ──< (N) Services

User (N) ─────< UserCustomer >───── (N) Customer
```

## Implementation Steps

### Step 1: Database Migration

Run the migration script to create the customer tables and update existing tables:

```bash
psql -U your_user -d cygnetci_db -f CygnetCI.Database/001_add_customer_tenant_support.sql
```

**What this does:**
1. Creates `customers` and `user_customers` tables
2. Adds `customer_id` columns to `agents`, `pipelines`, `releases`, `services`
3. Creates a default customer and migrates existing data to it
4. Sets up indexes for performance
5. Creates a `customer_statistics` view for dashboard

### Step 2: Update Backend API

#### 2.1 Update main.py to include customer router

Add to your `main.py`:

```python
# Import customer API
from customer_api import router as customer_router

# Include customer router
app.include_router(customer_router)
```

#### 2.2 Update existing API endpoints to filter by customer

**Example for agents endpoint:**

```python
@app.get("/agents")
async def get_agents(
    customer_id: Optional[int] = Query(None, description="Filter by customer ID"),
    db: Session = Depends(get_db)
):
    query = db.query(models.Agent)

    if customer_id:
        query = query.filter(models.Agent.customer_id == customer_id)

    agents = query.all()
    return agents
```

**Apply similar changes to:**
- `/pipelines` - Filter by customer_id
- `/releases` - Filter by customer_id
- `/services` - Filter by customer_id
- `/pipeline-executions` - Join through pipeline.customer_id
- `/release-executions` - Join through release.customer_id

#### 2.3 Update create endpoints to require customer_id

**Example for creating agent:**

```python
class AgentCreate(BaseModel):
    customer_id: int  # Add this field
    name: str
    description: Optional[str] = None
    uuid: str
    location: str

@app.post("/agents")
async def create_agent(agent: AgentCreate, db: Session = Depends(get_db)):
    # Validate customer exists
    customer = db.query(models.Customer).filter(
        models.Customer.id == agent.customer_id
    ).first()

    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Create agent with customer_id
    new_agent = models.Agent(
        customer_id=agent.customer_id,
        name=agent.name,
        # ... rest of fields
    )
    # ...
```

### Step 3: Update C# Agent

#### 3.1 Update appsettings.json

Add `CustomerId` to the agent configuration:

```json
{
  "AgentConfiguration": {
    "ServerUrl": "http://localhost:8000",
    "AgentUuid": "agent-001",
    "AgentName": "Production Agent 1",
    "Location": "AWS US-East-1",
    "CustomerId": 1,
    "HeartbeatIntervalSeconds": 30,
    ...
  }
}
```

#### 3.2 Update agent registration

When registering the agent, include the customer_id:

```csharp
var agentData = new
{
    customer_id = _configuration.CustomerId,
    name = _configuration.AgentName,
    uuid = _configuration.AgentUuid,
    location = _configuration.Location
};
```

### Step 4: Update Next.js Frontend

#### 4.1 Create Customer Context

Create `lib/contexts/CustomerContext.tsx`:

```typescript
import React, { createContext, useContext, useState, useEffect } from 'react';

interface Customer {
  id: number;
  name: string;
  display_name: string;
  is_active: boolean;
}

interface CustomerContextType {
  selectedCustomer: Customer | null;
  customers: Customer[];
  setSelectedCustomer: (customer: Customer) => void;
  isLoading: boolean;
}

const CustomerContext = createContext<CustomerContextType | undefined>(undefined);

export const CustomerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await fetch('http://localhost:8000/customers/?active_only=true');
      const data = await response.json();
      setCustomers(data);

      // Set first customer as default if available
      if (data.length > 0 && !selectedCustomer) {
        setSelectedCustomer(data[0]);
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <CustomerContext.Provider value={{ selectedCustomer, customers, setSelectedCustomer, isLoading }}>
      {children}
    </CustomerContext.Provider>
  );
};

export const useCustomer = () => {
  const context = useContext(CustomerContext);
  if (!context) {
    throw new Error('useCustomer must be used within CustomerProvider');
  }
  return context;
};
```

#### 4.2 Create Customer Selector Component

Create `components/CustomerSelector.tsx`:

```typescript
'use client';

import { useCustomer } from '@/lib/contexts/CustomerContext';

export default function CustomerSelector() {
  const { selectedCustomer, customers, setSelectedCustomer, isLoading } = useCustomer();

  if (isLoading) {
    return <div className="animate-pulse bg-gray-200 h-10 w-48 rounded"></div>;
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="customer-select" className="text-sm font-medium text-gray-700">
        Customer:
      </label>
      <select
        id="customer-select"
        value={selectedCustomer?.id || ''}
        onChange={(e) => {
          const customer = customers.find(c => c.id === parseInt(e.target.value));
          if (customer) setSelectedCustomer(customer);
        }}
        className="block w-48 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
      >
        {customers.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.display_name}
          </option>
        ))}
      </select>
    </div>
  );
}
```

#### 4.3 Update Layout to Include Customer Context

Update `app/layout.tsx`:

```typescript
import { CustomerProvider } from '@/lib/contexts/CustomerContext';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CustomerProvider>
          {children}
        </CustomerProvider>
      </body>
    </html>
  );
}
```

#### 4.4 Add Customer Selector to Header

Update your header component:

```typescript
import CustomerSelector from '@/components/CustomerSelector';

export default function Header() {
  return (
    <header className="bg-white shadow">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <h1>CygnetCI</h1>
        <CustomerSelector />
      </div>
    </header>
  );
}
```

#### 4.5 Update Data Fetching to Use Selected Customer

Update your API calls to include customer filter:

```typescript
import { useCustomer } from '@/lib/contexts/CustomerContext';

export default function AgentsPage() {
  const { selectedCustomer } = useCustomer();
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    if (selectedCustomer) {
      fetchAgents(selectedCustomer.id);
    }
  }, [selectedCustomer]);

  const fetchAgents = async (customerId: number) => {
    const response = await fetch(`http://localhost:8000/agents?customer_id=${customerId}`);
    const data = await response.json();
    setAgents(data);
  };

  // ... rest of component
}
```

#### 4.6 Create Customer Management Page

Create `app/customers/page.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';

interface Customer {
  id: number;
  name: string;
  display_name: string;
  description: string;
  contact_email: string;
  is_active: boolean;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    const response = await fetch('http://localhost:8000/customers/');
    const data = await response.json();
    setCustomers(data);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Customer Management</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Add Customer
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {customers.map((customer) => (
          <div key={customer.id} className="border rounded-lg p-4 shadow">
            <h3 className="text-lg font-semibold">{customer.display_name}</h3>
            <p className="text-sm text-gray-600">{customer.name}</p>
            <p className="text-sm mt-2">{customer.description}</p>
            <p className="text-sm text-gray-500 mt-1">{customer.contact_email}</p>
            <div className="mt-4">
              <span className={`px-2 py-1 rounded text-xs ${customer.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {customer.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Step 5: Create Dashboard with Customer Visibility

Create a customer-specific dashboard that shows statistics:

```typescript
'use client';

import { useCustomer } from '@/lib/contexts/CustomerContext';
import { useState, useEffect } from 'react';

interface CustomerStats {
  total_agents: number;
  online_agents: number;
  total_pipelines: number;
  successful_pipelines: number;
  total_releases: number;
  total_services: number;
}

export default function Dashboard() {
  const { selectedCustomer } = useCustomer();
  const [stats, setStats] = useState<CustomerStats | null>(null);

  useEffect(() => {
    if (selectedCustomer) {
      fetchStats(selectedCustomer.id);
    }
  }, [selectedCustomer]);

  const fetchStats = async (customerId: number) => {
    const response = await fetch(`http://localhost:8000/customers/${customerId}/statistics`);
    const data = await response.json();
    setStats(data);
  };

  if (!stats) return <div>Loading...</div>;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">
        Dashboard - {selectedCustomer?.display_name}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Agents" value={stats.total_agents} subtitle={`${stats.online_agents} online`} />
        <StatCard title="Total Pipelines" value={stats.total_pipelines} subtitle={`${stats.successful_pipelines} successful`} />
        <StatCard title="Total Releases" value={stats.total_releases} />
        <StatCard title="Total Services" value={stats.total_services} />
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: number; subtitle?: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-sm font-medium text-gray-600">{title}</h3>
      <p className="text-3xl font-bold mt-2">{value}</p>
      {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}
```

## API Endpoints Reference

### Customer Management

- `GET /customers/` - List all customers
- `GET /customers/{customer_id}` - Get customer details
- `GET /customers/{customer_id}/statistics` - Get customer statistics
- `POST /customers/` - Create new customer
- `PUT /customers/{customer_id}` - Update customer
- `DELETE /customers/{customer_id}` - Delete customer
- `POST /customers/{customer_id}/activate` - Activate customer
- `POST /customers/{customer_id}/deactivate` - Deactivate customer

### User-Customer Assignment

- `GET /customers/{customer_id}/users` - Get users for customer
- `POST /customers/{customer_id}/users` - Assign user to customer
- `DELETE /customers/{customer_id}/users/{user_id}` - Remove user from customer
- `POST /customers/{customer_id}/users/{user_id}/set-default` - Set default customer
- `GET /customers/users/{user_id}/customers` - Get customers for user

### Existing Endpoints (Updated)

All existing endpoints now support `customer_id` query parameter:
- `GET /agents?customer_id=1` - Filter agents by customer
- `GET /pipelines?customer_id=1` - Filter pipelines by customer
- `GET /releases?customer_id=1` - Filter releases by customer
- `GET /services?customer_id=1` - Filter services by customer

## Testing the Implementation

### 1. Create Test Customers

```bash
curl -X POST http://localhost:8000/customers/ \
  -H "Content-Type: application/json" \
  -d '{
    "name": "acme-corp",
    "display_name": "Acme Corporation",
    "description": "Main customer account",
    "contact_email": "admin@acme.com"
  }'
```

### 2. Create Agent for Customer

```bash
curl -X POST http://localhost:8000/agents \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": 1,
    "name": "Acme Agent 1",
    "uuid": "acme-agent-001",
    "location": "Production"
  }'
```

### 3. Verify Customer Isolation

```bash
# Get agents for customer 1
curl http://localhost:8000/agents?customer_id=1

# Get agents for customer 2
curl http://localhost:8000/agents?customer_id=2
```

## Security Considerations

1. **Row-Level Security**: Implement middleware to ensure users can only access customers they're assigned to
2. **Customer Context**: Always validate customer_id in API requests
3. **Audit Logging**: Log all customer-switching events
4. **Data Isolation**: Ensure queries always filter by customer_id

## Performance Optimization

1. **Indexes**: All customer_id columns are indexed for fast filtering
2. **Caching**: Cache customer list in frontend context
3. **Query Optimization**: Use joins instead of N+1 queries
4. **Database Views**: Use `customer_statistics` view for dashboard

## Migration Checklist

- [ ] Run database migration script
- [ ] Verify default customer created
- [ ] Verify existing data migrated to default customer
- [ ] Update backend models (models.py)
- [ ] Add customer API endpoints (customer_api.py)
- [ ] Update main.py to include customer router
- [ ] Update existing API endpoints with customer filtering
- [ ] Update C# Agent configuration with CustomerId
- [ ] Create CustomerContext in Next.js
- [ ] Create CustomerSelector component
- [ ] Update all data fetching to use selected customer
- [ ] Create customer management page
- [ ] Update dashboard with customer visibility
- [ ] Test customer isolation
- [ ] Assign users to customers
- [ ] Update documentation

## Troubleshooting

### Issue: Existing agents not showing up

**Solution**: Check if they have customer_id set. Run:
```sql
SELECT id, name, customer_id FROM agents WHERE customer_id IS NULL;
```

### Issue: Cannot create new resources

**Solution**: Ensure customer_id is being sent in create requests and that the customer exists.

### Issue: User sees multiple customers but shouldn't

**Solution**: Check user_customers table and ensure only authorized assignments exist.

## Future Enhancements

1. **Customer-specific branding**: Use logo_url and custom themes
2. **Customer quotas**: Limit agents/pipelines per customer
3. **Billing integration**: Track usage per customer
4. **Customer-specific permissions**: Fine-grained access control
5. **Customer analytics**: Advanced reporting per customer
6. **Multi-region support**: Deploy customers in different regions
7. **Customer API keys**: Customer-specific API authentication

## Support

For questions or issues with the customer/tenant implementation, please refer to:
- Database schema: `models.py`
- API documentation: `customer_api.py`
- Migration script: `CygnetCI.Database/001_add_customer_tenant_support.sql`
- Frontend context: `lib/contexts/CustomerContext.tsx`

---

**Last Updated**: 2025-12-31
**Version**: 1.0.0
