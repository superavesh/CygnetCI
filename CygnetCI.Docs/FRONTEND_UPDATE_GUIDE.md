# Frontend Customer Integration Guide

## Overview

This guide shows how to update each page to filter data by the selected customer.

## Pattern to Follow

All pages (agents, pipelines, releases, services) should follow this pattern:

### 1. Import useCustomer Hook

```typescript
import { useCustomer } from '@/lib/contexts/CustomerContext';
```

### 2. Get Selected Customer in Component

```typescript
export default function YourPage() {
  const { selectedCustomer, refreshStats } = useCustomer();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  // ... rest of component
}
```

### 3. Fetch Data with Customer Filter

```typescript
useEffect(() => {
  if (selectedCustomer) {
    fetchData(selectedCustomer.id);
  }
}, [selectedCustomer]);

const fetchData = async (customerId: number) => {
  setLoading(true);
  try {
    const response = await fetch(
      `${CONFIG.api.baseUrl}/your-endpoint?customer_id=${customerId}`
    );
    const data = await response.json();
    setData(data);
  } catch (error) {
    console.error('Failed to fetch data:', error);
  } finally {
    setLoading(false);
  }
};
```

### 4. Include Customer ID When Creating Resources

```typescript
const handleCreate = async (formData) => {
  const payload = {
    ...formData,
    customer_id: selectedCustomer?.id
  };

  const response = await fetch(`${CONFIG.api.baseUrl}/your-endpoint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  // ... handle response
};
```

## Example: Agents Page Update

Here's a complete example for the agents page:

\`\`\`typescript
// src/app/agents/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useCustomer } from '@/lib/contexts/CustomerContext';
import { CONFIG } from '@/lib/config';

export default function AgentsPage() {
  const { selectedCustomer, refreshStats } = useCustomer();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // Fetch agents when customer changes
  useEffect(() => {
    if (selectedCustomer) {
      fetchAgents(selectedCustomer.id);
    }
  }, [selectedCustomer]);

  const fetchAgents = async (customerId: number) => {
    setLoading(true);
    try {
      const response = await fetch(
        \`\${CONFIG.api.baseUrl}/agents?customer_id=\${customerId}\`
      );
      const data = await response.json();
      setAgents(data);
    } catch (error) {
      console.error('Failed to fetch agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAgent = async (agentData) => {
    if (!selectedCustomer) {
      alert('Please select a customer first');
      return;
    }

    try {
      const response = await fetch(\`\${CONFIG.api.baseUrl}/agents\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...agentData,
          customer_id: selectedCustomer.id
        })
      });

      if (!response.ok) {
        throw new Error('Failed to add agent');
      }

      // Refresh data
      fetchAgents(selectedCustomer.id);
      refreshStats(); // Update customer statistics
      setShowAddModal(false);
    } catch (error) {
      console.error('Error adding agent:', error);
      alert('Failed to add agent');
    }
  };

  const handleDeleteAgent = async (agentId: number) => {
    if (!confirm('Are you sure?')) return;

    try {
      const response = await fetch(\`\${CONFIG.api.baseUrl}/agents/\${agentId}\`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete agent');
      }

      // Refresh data
      if (selectedCustomer) {
        fetchAgents(selectedCustomer.id);
        refreshStats();
      }
    } catch (error) {
      console.error('Error deleting agent:', error);
      alert('Failed to delete agent');
    }
  };

  if (!selectedCustomer) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Please select a customer to view agents</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading agents...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-gray-600">
            Showing agents for {selectedCustomer.display_name}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Add Agent
        </button>
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <div key={agent.id} className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold">{agent.name}</h3>
            <p className="text-sm text-gray-600">{agent.location}</p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => handleDeleteAgent(agent.id)}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {agents.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-600">
            No agents found for {selectedCustomer.display_name}
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Add First Agent
          </button>
        </div>
      )}

      {/* Add Agent Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          {/* Modal content here */}
        </div>
      )}
    </div>
  );
}
\`\`\`

## Pages to Update

### 1. Agents Page
- File: \`src/app/agents/page.tsx\`
- Endpoint: \`GET /agents?customer_id={id}\`
- Create: \`POST /agents\` with \`customer_id\` in body

### 2. Pipelines Page
- File: \`src/app/pipelines/page.tsx\`
- Endpoint: \`GET /pipelines?customer_id={id}\`
- Create: \`POST /pipelines\` with \`customer_id\` in body

### 3. Releases Page
- File: \`src/app/releases/page.tsx\`
- Endpoint: \`GET /releases?customer_id={id}\`
- Create: \`POST /releases\` with \`customer_id\` in body

### 4. Services/Monitoring Page
- File: \`src/app/monitoring/page.tsx\`
- Endpoint: \`GET /services?customer_id={id}\`
- Create: \`POST /services\` with \`customer_id\` in body

## Important Notes

1. **Always Check for Selected Customer**
   - Before making API calls, ensure \`selectedCustomer\` is not null
   - Show a message if no customer is selected

2. **Refresh Customer Stats**
   - After creating/updating/deleting resources, call \`refreshStats()\`
   - This updates the customer statistics displayed in the customer selector

3. **Handle Customer Switching**
   - When user switches customers, the \`useEffect\` will automatically refetch data
   - Make sure to include \`selectedCustomer\` in dependency array

4. **Loading States**
   - Show loading indicator while fetching data
   - Show empty state when no data exists for customer

5. **Error Handling**
   - Show user-friendly error messages
   - Log errors to console for debugging

## Navigation Update

Add Customers link to navigation:

\`\`\`typescript
// src/components/layout/Navigation.tsx

const navItems = [
  { name: 'Dashboard', path: '/', icon: Home },
  { name: 'Agents', path: '/agents', icon: Server },
  { name: 'Pipelines', path: '/pipelines', icon: GitBranch },
  { name: 'Releases', path: '/releases', icon: Package },
  { name: 'Monitoring', path: '/monitoring', icon: Activity },
  { name: 'Customers', path: '/customers', icon: Users }, // Add this
  { name: 'Transfer', path: '/transfer', icon: Upload },
  // ... rest of items
];
\`\`\`

## Testing Checklist

- [ ] Customer selector appears in header
- [ ] Can switch between customers
- [ ] Agents page filters by selected customer
- [ ] Can create agent for selected customer
- [ ] Pipelines page filters by selected customer
- [ ] Releases page filters by selected customer
- [ ] Services page filters by selected customer
- [ ] Customer statistics update after CRUD operations
- [ ] Customer management page works (create, edit, activate/deactivate)
- [ ] Navigation includes Customers link

## Next Steps

1. Update each page following the pattern above
2. Test customer switching on each page
3. Verify data isolation (switching customers shows different data)
4. Test creating resources for different customers
5. Verify customer statistics are accurate

---

**Implementation Status**: Backend Complete ✅ | Frontend In Progress 🚧
