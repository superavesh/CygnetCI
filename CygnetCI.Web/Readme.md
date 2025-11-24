# 🎓 CygnetCI Project - Complete Beginner's Guide

## Table of Contents

- [What Is This Project?](#what-is-this-project)
- [Project Structure](#project-structure)
- [Understanding Each Folder](#understanding-each-folder)
- [How Data Flows](#how-data-flows)
- [How to Make Changes](#how-to-make-changes)
- [Adding and Modifying Modules](#adding-and-modifying-modules)
- [Debugging Tips](#debugging-tips)
- [Quick Reference Card](#quick-reference-card)

---

## 🏗️ What Is This Project?

Imagine you have a **dashboard** (like a car's dashboard) that shows:

- 🖥️ **Agents** - These are like workers/computers that do tasks for you
- 🔄 **Pipelines** - These are like assembly lines that build your software
- ✅ **Tasks** - Individual jobs that need to be done
- 📊 **Monitoring** - Health checks to see if services are working

Think of it as a **control center** where you can see everything happening in your software deployment system.

---

## 📁 Project Structure (Like a Filing Cabinet)

```
Your Project
│
├── 📂 src/
│   ├── 📂 app/           ← PAGES (What you see in browser)
│   ├── 📂 components/    ← REUSABLE PIECES (Like LEGO blocks)
│   ├── 📂 lib/           ← BRAIN (Logic & helpers)
│   ├── 📂 types/         ← RULES (What data looks like)
│   └── 📂 data/          ← FAKE DATA (For testing)
```

---

## 🎯 Understanding Each Folder

### 1️⃣ **`src/app/`** - The Pages You See

Think of this as **different rooms in your house**:

```
app/
├── page.tsx           → Home/Overview page (/)
├── pipelines/         → Pipelines room (/pipelines)
├── agents/            → Agents room (/agents)
├── tasks/             → Tasks room (/tasks)
└── monitoring/        → Monitoring room (/monitoring)
```

**Example:** When you visit `localhost:3000/agents`, it shows `agents/page.tsx`

---

### 2️⃣ **`src/components/`** - Reusable LEGO Blocks

Like LEGO pieces you can use again and again:

```
components/
├── 📂 cards/          → Individual card pieces
│   ├── StatCard       → Shows numbers (like "3 Active Agents")
│   ├── AgentCard      → Shows one agent's info
│   └── ServiceCard    → Shows one service's info
│
├── 📂 tables/         → Table pieces
│   ├── PipelineTable  → Shows list of pipelines
│   └── TaskTable      → Shows list of tasks
│
├── 📂 common/         → Basic pieces used everywhere
│   ├── StatusBadge    → Colored badges (Online/Offline)
│   └── LoadingState   → "Loading..." spinner
│
├── 📂 agents/         → Agent-specific components
│   ├── AddAgentModal      → Modal for adding agents
│   ├── ConfigureAgentModal → Modal for editing agents
│   └── AgentLogsModal     → Modal for viewing logs
│
├── 📂 monitoring/     → Monitoring components
│   └── ServiceColumn  → Drag & drop columns
│
├── 📂 charts/         → Chart components
│   └── SimpleChart    → Resource usage charts
│
└── 📂 layout/         → Page structure pieces
    ├── Header         → Top bar with logo
    └── Navigation     → Menu tabs
```

**Analogy:** Like having a drawer of LEGO bricks. Instead of rebuilding a wheel each time, you grab the wheel piece!

---

### 3️⃣ **`src/lib/`** - The Brain

This is where the **thinking happens**:

```
lib/
├── 📂 api/
│   └── apiService.ts   → Talks to your backend server
│
├── 📂 hooks/
│   ├── useData.ts      → Fetches and manages data
│   └── useDragDrop.ts  → Handles drag & drop logic
│
└── config.ts           → Settings (like API URL)
```

**Analogy:** 

- **apiService** = Your phone - calls the server
- **useData** = Your memory - remembers what you fetched
- **config** = Your address book - stores important info

---

### 4️⃣ **`src/types/`** - The Rules

Defines what data **looks like**:

```typescript
// Example: What is an Agent?
interface Agent {
  id: number;           // Every agent has an ID
  name: string;         // Every agent has a name
  status: string;       // Every agent has a status
  // ... more fields
}
```

**Analogy:** Like a form at the DMV - it has specific fields you must fill out.

---

### 5️⃣ **`src/data/`** - Fake Data for Testing

Contains **dummy/sample data** so you can test without a real server:

```typescript
// Example dummy agent
{
  id: 1,
  name: "TotalEnergies",
  status: "online",
  cpu: 45,
  memory: 67
}
```

**Analogy:** Like a practice test with sample questions before the real exam.

---

## 🔄 How Data Flows (Simple Steps)

Let me explain how clicking a button shows you data:

### Step-by-Step Flow:

```
1. You click "Agents" tab
   ↓
2. Browser loads /agents page
   ↓
3. Page calls useData() hook
   ↓
4. useData checks: Real API or Dummy?
   ↓
5. If Dummy: Gets data from dummyData.ts
   If Real: Calls apiService.getAllData()
   ↓
6. apiService makes HTTP request to server
   ↓
7. Data comes back
   ↓
8. Page shows AgentCards with the data
```

**Real-Life Analogy:**

1. You ask waiter for menu (click button)
2. Waiter goes to kitchen (API call)
3. Chef prepares food (server processes)
4. Waiter brings food (data returns)
5. You eat (see data on screen)

---

## 🛠️ How to Make Changes

### **Adding a New Page**

**Goal:** Add a "Reports" page

**Steps:**

1️⃣ **Create the folder:**

```bash
mkdir src/app/reports
```

2️⃣ **Create the page file:**

```bash
touch src/app/reports/page.tsx
```

3️⃣ **Write basic code:**

```typescript
// src/app/reports/page.tsx
'use client';

export default function ReportsPage() {
  return (
    <div>
      <h1>Reports Page</h1>
      <p>This is my new reports page!</p>
    </div>
  );
}
```

4️⃣ **Add to navigation:**

Open `src/components/layout/Navigation.tsx` and add:

```typescript
const navItems = [
  // ... existing items
  { id: 'reports', name: 'Reports', icon: FileText, href: '/reports' }
];
```

**That's it!** Visit `localhost:3000/reports` to see it!

---

### **Adding a New Component**

**Goal:** Create a "StatusCard" component

**Steps:**

1️⃣ **Create the file:**

```bash
touch src/components/cards/StatusCard.tsx
```

2️⃣ **Write the component:**

```typescript
// src/components/cards/StatusCard.tsx
import React from 'react';

interface StatusCardProps {
  title: string;
  status: string;
}

export const StatusCard: React.FC<StatusCardProps> = ({ title, status }) => {
  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h3>{title}</h3>
      <p>{status}</p>
    </div>
  );
};
```

3️⃣ **Use it anywhere:**

```typescript
import { StatusCard } from '@/components/cards/StatusCard';

// In your page:
<StatusCard title="Server Status" status="Running" />
```

---

### **Changing API URL**

**Goal:** Connect to your real backend

**Steps:**

Open `src/lib/config.ts`:

```typescript
export const CONFIG = {
  api: {
    baseUrl: 'http://your-api.com',  // ← CHANGE THIS
    // ...
  },
  app: {
    useRealAPI: true  // ← CHANGE THIS to true
  }
};
```

**That's it!** Now it talks to your real server!

---

### **Adding New Data Field**

**Goal:** Add "email" to agents

**Steps:**

1️⃣ **Update the type:**

```typescript
// src/types/index.ts
export interface Agent {
  id: number;
  name: string;
  email: string;  // ← ADD THIS
  // ... other fields
}
```

2️⃣ **Update dummy data:**

```typescript
// src/data/dummyData.ts
{
  id: 1,
  name: "TotalEnergies",
  email: "contact@totalenergies.com",  // ← ADD THIS
  // ... other fields
}
```

3️⃣ **Show it in UI:**

```typescript
// src/components/cards/AgentCard.tsx
<p className="text-sm">{agent.email}</p>  // ← ADD THIS
```

---

## 🎨 Understanding Styling (Tailwind CSS)

Instead of writing CSS files, we use **class names**:

```typescript
// Traditional CSS (DON'T do this)
<div style={{backgroundColor: 'blue', padding: '10px'}}>

// Tailwind CSS (DO this)
<div className="bg-blue-500 p-4">
```

**Common Classes:**

| What You Want   | Class Name     | Example                               |
| --------------- | -------------- | ------------------------------------- |
| Blue background | `bg-blue-500`  | `<div className="bg-blue-500">`       |
| White text      | `text-white`   | `<p className="text-white">`          |
| Padding         | `p-4`          | `<div className="p-4">`               |
| Margin          | `m-4`          | `<div className="m-4">`               |
| Rounded corners | `rounded-lg`   | `<div className="rounded-lg">`        |
| Shadow          | `shadow-lg`    | `<div className="shadow-lg">`         |
| Flex layout     | `flex`         | `<div className="flex">`              |
| Center items    | `items-center` | `<div className="flex items-center">` |

**Cheat Sheet:** https://tailwindcss.com/docs

---

## 🔧 Common Modifications Guide

### **Change Colors**

**Goal:** Make buttons green instead of blue

**Find this:**

```typescript
className="bg-blue-500 hover:bg-blue-600"
```

**Change to:**

```typescript
className="bg-green-500 hover:bg-green-600"
```

---

### **Add a Button**

```typescript
<button 
  onClick={() => alert('Clicked!')}
  className="bg-blue-500 text-white px-4 py-2 rounded-lg"
>
  Click Me
</button>
```

**Explanation:**

- `onClick` - What happens when clicked
- `bg-blue-500` - Blue background
- `text-white` - White text
- `px-4 py-2` - Padding (spacing inside)
- `rounded-lg` - Rounded corners

---

### **Show/Hide Something**

```typescript
const [isVisible, setIsVisible] = useState(false);

// Button to toggle
<button onClick={() => setIsVisible(!isVisible)}>
  Toggle
</button>

// Thing that shows/hides
{isVisible && (
  <div>I'm visible now!</div>
)}
```

---

### **Add a Modal/Popup**

Look at `src/components/agents/AddAgentModal.tsx` as example:

**Key parts:**

1. **State to control visibility:**
   
   ```typescript
   const [showModal, setShowModal] = useState(false);
   ```

2. **Button to open:**
   
   ```typescript
   <button onClick={() => setShowModal(true)}>Open</button>
   ```

3. **Modal component:**
   
   ```typescript
   {showModal && (
   <div className="fixed inset-0 bg-black bg-opacity-50">
    <div className="bg-white p-6 rounded-lg">
      <h2>My Modal</h2>
      <button onClick={() => setShowModal(false)}>Close</button>
    </div>
   </div>
   )}
   ```

---

## 📦 Adding and Modifying Modules

### 🎯 What is a Module?

Think of a **module** as a **box** or **section** on your page. Like building with LEGO blocks!

**Examples of modules:**

- 📊 Statistics cards (showing numbers)
- 📋 Tables (showing lists)
- 📈 Charts (showing graphs)
- 🎴 Card grids (showing items)
- 🔔 Alert boxes
- 📝 Forms

---

## 🏗️ Adding a New Module to Existing Page

### Example 1: Add "Quick Stats" Module to Overview Page

**Goal:** Add a box showing "Total Users" on the overview page

#### Step 1: Open the page file

```bash
src/app/page.tsx
```

#### Step 2: Find where to add it

Look for the `return` statement. It looks like:

```typescript
export default function OverviewPage() {
  const { agents, pipelines, stats, refetch } = useData();

  return (
    <div className="space-y-8">  {/* ← This is the main container */}

      {/* API Status Indicator - EXISTING MODULE */}
      <div className="bg-white rounded-lg p-4">
        ...existing code...
      </div>

      {/* Stats Grid - EXISTING MODULE */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        ...existing code...
      </div>

      {/* WE WILL ADD OUR NEW MODULE HERE! */}

    </div>
  );
}
```

#### Step 3: Add your new module

**Copy and paste this AFTER the Stats Grid:**

```typescript
{/* ✨ NEW MODULE - Quick Stats Box */}
<div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl shadow-lg p-6 text-white">
  <h3 className="text-xl font-bold mb-2">🎉 Quick Stats</h3>
  <p className="text-3xl font-bold">1,234</p>
  <p className="text-sm opacity-90">Total Users This Month</p>
</div>
{/* End of new module */}
```

**Save the file** → Check your browser! You'll see a purple/pink box!

---

### Example 2: Add a "Recent Activity" Module

Let's add a more complex module with a list:

```typescript
{/* ✨ NEW MODULE - Recent Activity */}
<div className="bg-white rounded-xl shadow-lg p-6">
  <h3 className="text-lg font-bold text-gray-800 mb-4">
    📋 Recent Activity
  </h3>

  <div className="space-y-3">
    {/* Activity Item 1 */}
    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
      <div>
        <p className="font-medium">Pipeline completed successfully</p>
        <p className="text-sm text-gray-500">5 minutes ago</p>
      </div>
    </div>

    {/* Activity Item 2 */}
    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
      <div>
        <p className="font-medium">New agent connected</p>
        <p className="text-sm text-gray-500">12 minutes ago</p>
      </div>
    </div>

    {/* Activity Item 3 */}
    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
      <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
      <div>
        <p className="font-medium">Warning detected</p>
        <p className="text-sm text-gray-500">1 hour ago</p>
      </div>
    </div>
  </div>
</div>
```

---

### Example 3: Add an "Alerts" Module with Icon

First, import the icon at the top of your file:

```typescript
import { AlertTriangle } from 'lucide-react';  // ← Add this at the top
```

Then add the module:

```typescript
{/* ✨ NEW MODULE - System Alerts */}
<div className="bg-red-50 border-2 border-red-200 rounded-xl p-6">
  <div className="flex items-start space-x-3">
    <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0" />
    <div>
      <h3 className="text-lg font-bold text-red-800">⚠️ System Alert</h3>
      <p className="text-red-700 mt-2">
        Server maintenance scheduled for tonight at 2 AM.
      </p>
      <button className="mt-3 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600">
        Learn More
      </button>
    </div>
  </div>
</div>
```

---

## 🎨 Modifying Existing Modules

### How to Find What to Modify

**Step 1:** Look at your page in the browser and decide what you want to change

**Step 2:** Open the page file and search for the text you see

For example, if you see "Active Agents" on screen:

```bash
# Press Ctrl+F in your editor
# Search for: "Active Agents"
```

### Example 1: Change Stats Card Color

**Find this in `src/app/page.tsx`:**

```typescript
<StatCard 
  title="Active Agents" 
  value={stats.activeAgents.value} 
  icon={Server} 
  color="bg-gradient-to-br from-blue-500 to-blue-600"  // ← CHANGE THIS LINE
  trend={stats.activeAgents.trend}
/>
```

**Change to make it green:**

```typescript
color="bg-gradient-to-br from-green-500 to-green-600"
```

**Or make it purple:**

```typescript
color="bg-gradient-to-br from-purple-500 to-purple-600"
```

**Available colors:**

- `blue` (default)
- `green` 
- `red`
- `purple`
- `yellow`
- `pink`
- `indigo`
- `orange`

---

### Example 2: Change Module Layout (2 columns → 3 columns)

**Find this:**

```typescript
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  {/* Two columns */}
</div>
```

**Change to three columns:**

```typescript
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {/* Three columns */}
</div>
```

**Explanation:**

- `grid-cols-1` → 1 column on mobile
- `md:grid-cols-2` → 2 columns on tablets
- `lg:grid-cols-3` → 3 columns on desktop

---

### Example 3: Change Text in a Module

**Find:**

```typescript
<h3 className="text-lg font-semibold">
  Recent Pipelines
</h3>
```

**Change to:**

```typescript
<h3 className="text-lg font-semibold">
  🚀 Latest Pipeline Runs
</h3>
```

---

### Example 4: Hide a Module

**Option A: Comment it out** (temporary)

```typescript
{/* 
<div className="bg-white rounded-xl shadow-lg p-6">
  ... entire module code ...
</div>
*/}
```

**Option B: Conditional rendering** (show/hide with button)

```typescript
const [showStats, setShowStats] = useState(true);  // ← Add at top

// In your JSX:
<button onClick={() => setShowStats(!showStats)}>
  Toggle Stats
</button>

{showStats && (
  <div className="bg-white rounded-xl shadow-lg p-6">
    ... module code ...
  </div>
)}
```

---

## 🎯 Create a Custom Reusable Module

Let's create a module you can reuse everywhere!

### Example: Create an "InfoBox" Module

#### Step 1: Create the component file

```bash
touch src/components/common/InfoBox.tsx
```

#### Step 2: Write the component

```typescript
// src/components/common/InfoBox.tsx
import React from 'react';
import { LucideIcon } from 'lucide-react';

interface InfoBoxProps {
  title: string;
  description: string;
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'red' | 'purple' | 'yellow';
}

export const InfoBox: React.FC<InfoBoxProps> = ({ 
  title, 
  description, 
  icon: Icon,
  color = 'blue' 
}) => {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    green: 'bg-green-50 border-green-200 text-green-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  };

  return (
    <div className={`${colorClasses[color]} border-2 rounded-xl p-6`}>
      <div className="flex items-start space-x-4">
        <Icon className="h-8 w-8 flex-shrink-0" />
        <div>
          <h3 className="text-lg font-bold mb-2">{title}</h3>
          <p className="text-sm opacity-90">{description}</p>
        </div>
      </div>
    </div>
  );
};
```

#### Step 3: Use it anywhere!

```typescript
// In any page, import at top:
import { InfoBox } from '@/components/common/InfoBox';
import { Zap, AlertCircle, CheckCircle } from 'lucide-react';

// Then use it:
<InfoBox 
  title="System Online"
  description="All systems are running normally"
  icon={CheckCircle}
  color="green"
/>

<InfoBox 
  title="High Performance"
  description="CPU usage is optimal"
  icon={Zap}
  color="blue"
/>

<InfoBox 
  title="Warning"
  description="Backup recommended"
  icon={AlertCircle}
  color="yellow"
/>
```

---

## 📊 Common Module Patterns

### Pattern 1: Stats Grid (Numbers)

```typescript
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

  {/* Stat Box 1 */}
  <div className="bg-white rounded-xl shadow-lg p-6">
    <p className="text-gray-600 text-sm mb-1">Total Sales</p>
    <p className="text-3xl font-bold text-gray-800">$12,543</p>
    <p className="text-sm text-green-600 mt-2">↗ +12% from last month</p>
  </div>

  {/* Stat Box 2 */}
  <div className="bg-white rounded-xl shadow-lg p-6">
    <p className="text-gray-600 text-sm mb-1">New Users</p>
    <p className="text-3xl font-bold text-gray-800">1,234</p>
    <p className="text-sm text-green-600 mt-2">↗ +8% from last month</p>
  </div>

  {/* Add more stat boxes... */}

</div>
```

---

### Pattern 2: Card List with Images

```typescript
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

  {/* Card 1 */}
  <div className="bg-white rounded-xl shadow-lg overflow-hidden">
    <div className="h-48 bg-gradient-to-r from-blue-400 to-blue-600"></div>
    <div className="p-6">
      <h3 className="text-xl font-bold mb-2">Project Alpha</h3>
      <p className="text-gray-600 mb-4">Description of the project goes here</p>
      <button className="bg-blue-500 text-white px-4 py-2 rounded-lg">
        View Details
      </button>
    </div>
  </div>

  {/* Card 2 */}
  <div className="bg-white rounded-xl shadow-lg overflow-hidden">
    <div className="h-48 bg-gradient-to-r from-green-400 to-green-600"></div>
    <div className="p-6">
      <h3 className="text-xl font-bold mb-2">Project Beta</h3>
      <p className="text-gray-600 mb-4">Another great project</p>
      <button className="bg-green-500 text-white px-4 py-2 rounded-lg">
        View Details
      </button>
    </div>
  </div>

  {/* Add more cards... */}

</div>
```

---

### Pattern 3: Timeline/Activity Feed

```typescript
<div className="bg-white rounded-xl shadow-lg p-6">
  <h3 className="text-xl font-bold mb-6">Activity Timeline</h3>

  <div className="space-y-6">

    {/* Timeline Item 1 */}
    <div className="flex space-x-4">
      <div className="flex flex-col items-center">
        <div className="w-4 h-4 bg-green-500 rounded-full"></div>
        <div className="w-0.5 h-full bg-gray-200"></div>
      </div>
      <div className="flex-1 pb-6">
        <p className="font-medium">Deployment completed</p>
        <p className="text-sm text-gray-500">2 hours ago</p>
        <p className="text-sm text-gray-600 mt-1">All systems updated successfully</p>
      </div>
    </div>

    {/* Timeline Item 2 */}
    <div className="flex space-x-4">
      <div className="flex flex-col items-center">
        <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
        <div className="w-0.5 h-full bg-gray-200"></div>
      </div>
      <div className="flex-1 pb-6">
        <p className="font-medium">Build started</p>
        <p className="text-sm text-gray-500">4 hours ago</p>
        <p className="text-sm text-gray-600 mt-1">Building version 2.1.0</p>
      </div>
    </div>

    {/* Timeline Item 3 */}
    <div className="flex space-x-4">
      <div className="flex flex-col items-center">
        <div className="w-4 h-4 bg-yellow-500 rounded-full"></div>
      </div>
      <div className="flex-1">
        <p className="font-medium">Warning detected</p>
        <p className="text-sm text-gray-500">6 hours ago</p>
        <p className="text-sm text-gray-600 mt-1">High memory usage detected</p>
      </div>
    </div>

  </div>
</div>
```

---

### Pattern 4: Data Table Module

```typescript
<div className="bg-white rounded-xl shadow-lg overflow-hidden">
  <div className="p-6 border-b">
    <h3 className="text-xl font-bold">User List</h3>
  </div>

  <table className="w-full">
    <thead className="bg-gray-50">
      <tr>
        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
          Name
        </th>
        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
          Email
        </th>
        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
          Status
        </th>
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-200">
      <tr>
        <td className="px-6 py-4">John Doe</td>
        <td className="px-6 py-4">john@example.com</td>
        <td className="px-6 py-4">
          <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
            Active
          </span>
        </td>
      </tr>
      <tr>
        <td className="px-6 py-4">Jane Smith</td>
        <td className="px-6 py-4">jane@example.com</td>
        <td className="px-6 py-4">
          <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
            Active
          </span>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

---

## 🎨 Module Styling Quick Reference

### Background Colors

```typescript
className="bg-white"        // White
className="bg-gray-50"      // Light gray
className="bg-blue-500"     // Blue
className="bg-red-500"      // Red
className="bg-green-500"    // Green
```

### Spacing (Padding & Margin)

```typescript
className="p-4"    // Padding all sides (4 units)
className="px-6"   // Padding left & right (6 units)
className="py-4"   // Padding top & bottom (4 units)
className="m-4"    // Margin all sides
className="mt-6"   // Margin top
className="space-y-4"  // Vertical spacing between children
```

### Borders & Shadows

```typescript
className="border border-gray-200"  // Light border
className="border-2 border-blue-500"  // Thick blue border
className="rounded-lg"  // Rounded corners
className="shadow-lg"   // Large shadow
className="shadow-xl"   // Extra large shadow
```

### Layout

```typescript
className="flex"  // Flexbox (horizontal)
className="flex-col"  // Flexbox (vertical)
className="grid grid-cols-2"  // Grid with 2 columns
className="space-x-4"  // Horizontal spacing
className="space-y-4"  // Vertical spacing
className="gap-6"  // Gap in grid
```

---

## ✅ Step-by-Step Checklist for Adding Module

When adding a new module, follow these steps:

- [ ] **Step 1:** Decide which page to add it to
- [ ] **Step 2:** Open that page file (`src/app/[page]/page.tsx`)
- [ ] **Step 3:** Find the main container (`<div className="space-y-8">`)
- [ ] **Step 4:** Copy a module pattern from this guide
- [ ] **Step 5:** Paste it in the right location
- [ ] **Step 6:** Customize the text, colors, and content
- [ ] **Step 7:** Save and check in browser
- [ ] **Step 8:** Adjust spacing/colors if needed

---

## 🎯 Real-World Example: Add "Quick Actions" Module

### Complete Example for Dashboard

```typescript
// In src/app/page.tsx, add this module:

{/* Quick Actions Module */}
<div className="bg-white rounded-xl shadow-lg p-6">
  <h3 className="text-xl font-bold text-gray-800 mb-4">⚡ Quick Actions</h3>

  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

    <button className="flex flex-col items-center p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
      <Server className="h-8 w-8 text-blue-500 mb-2" />
      <span className="text-sm font-medium">Add Agent</span>
    </button>

    <button className="flex flex-col items-center p-4 bg-green-50 hover:bg-green-100 rounded-lg transition-colors">
      <Play className="h-8 w-8 text-green-500 mb-2" />
      <span className="text-sm font-medium">Run Pipeline</span>
    </button>

    <button className="flex flex-col items-center p-4 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors">
      <Settings className="h-8 w-8 text-purple-500 mb-2" />
      <span className="text-sm font-medium">Settings</span>
    </button>

    <button className="flex flex-col items-center p-4 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors">
      <FileText className="h-8 w-8 text-orange-500 mb-2" />
      <span className="text-sm font-medium">Reports</span>
    </button>

  </div>
</div>
```

Don't forget to import icons at the top:

```typescript
import { Server, Play, Settings, FileText } from 'lucide-react';
```

---

## 🐛 Debugging Tips (When Things Break)

### **1. Check Browser Console**

Press `F12` → Look for red errors

Common errors:

- "Cannot read property 'X' of undefined" → Data is missing
- "X is not a function" → You forgot to pass a function
- "Key prop is missing" → Add `key={item.id}` to lists

---

### **2. Check Terminal**

Look at where you ran `npm run dev`

Common errors:

- TypeScript errors → Fix the type mismatch
- "Module not found" → Check import path
- Port in use → Kill the process or use different port

---

### **3. Add Console Logs**

```typescript
console.log('My data:', agents);  // See what data looks like
console.log('Button clicked!');   // Check if function runs
```

---

### **4. Check File Paths**

Imports must use `@/` for src folder:

**✅ Correct:**

```typescript
import { Agent } from '@/types';
import { useData } from '@/lib/hooks/useData';
```

**❌ Wrong:**

```typescript
import { Agent } from '../../../types';  // Too many ../
```

---

## 📚 Learning Resources

**If you want to learn more:**

1. **React Basics** → https://react.dev/learn
2. **Next.js** → https://nextjs.org/learn
3. **Tailwind CSS** → https://tailwindcss.com/docs
4. **TypeScript** → https://www.typescriptlang.org/docs
5. **Lucide Icons** → https://lucide.dev/icons/

---

## 🎯 Quick Reference Card

**Want to...**

| Do This                | Edit This File                            |
| ---------------------- | ----------------------------------------- |
| Change page content    | `src/app/[page]/page.tsx`                 |
| Add new page           | Create `src/app/newpage/page.tsx`         |
| Change header          | `src/components/layout/Header.tsx`        |
| Change navigation tabs | `src/components/layout/Navigation.tsx`    |
| Change colors/styling  | Add/modify `className`                    |
| Connect to API         | `src/lib/config.ts` → change `baseUrl`    |
| Add new data type      | `src/types/index.ts`                      |
| Change dummy data      | `src/data/dummyData.ts`                   |
| Add reusable component | Create in `src/components/`               |
| Add modal/popup        | Look at `src/components/agents/` examples |

---

## 🚀 Common Tasks Quick Guide

### Add a Module to a Page

1. Open page file: `src/app/[page]/page.tsx`
2. Find main container: `<div className="space-y-8">`
3. Copy a pattern from this README
4. Paste and customize
5. Save and refresh browser

### Change a Module's Color

1. Find the module in the page file
2. Look for `className="bg-blue-500"`
3. Change `blue` to `green`, `red`, `purple`, etc.
4. Save and refresh

### Hide/Show a Module

```typescript
// Add state at top of component
const [showModule, setShowModule] = useState(true);

// Add toggle button
<button onClick={() => setShowModule(!showModule)}>
  Toggle Module
</button>

// Wrap module
{showModule && (
  <div>Your module here</div>
)}
```

### Add Icon to Module

```typescript
// 1. Import at top
import { AlertCircle } from 'lucide-react';

// 2. Use in JSX
<AlertCircle className="h-6 w-6 text-red-500" />
```

---

## 🎨 Color Palette Reference

### Primary Colors

```typescript
bg-blue-500    // #3B82F6
bg-green-500   // #10B981
bg-red-500     // #EF4444
bg-yellow-500  // #F59E0B
bg-purple-500  // #A855F7
bg-pink-500    // #EC4899
bg-indigo-500  // #6366F1
bg-orange-500  // #F97316
```

### Shades (50-900)

```typescript
bg-blue-50     // Lightest
bg-blue-100
bg-blue-200
bg-blue-300
bg-blue-400
bg-blue-500    // Default
bg-blue-600
bg-blue-700
bg-blue-800
bg-blue-900    // Darkest
```

---

## 💡 Best Practices

### 1. **Component Organization**

- Keep components small and focused
- One component per file
- Reuse components instead of copying code

### 2. **Naming Conventions**

- Components: `PascalCase` (e.g., `StatCard.tsx`)
- Functions: `camelCase` (e.g., `handleClick`)
- Files: Match component name

### 3. **State Management**

- Use `useState` for simple state
- Use `useData` hook for global data
- Keep state close to where it's used

### 4. **Styling**

- Use Tailwind classes consistently
- Avoid inline styles
- Use responsive classes (`md:`, `lg:`)

### 5. **TypeScript**

- Always define interfaces for props
- Use existing types from `src/types/`
- Fix TypeScript errors immediately

---

## 🔥 Pro Tips

### Tip 1: Duplicate Existing Module

Instead of creating from scratch, copy an existing module and modify it!

```bash
# Find a similar module in the codebase
# Copy its entire code block
# Paste it where you want
# Modify the content
```

### Tip 2: Use Browser Inspector

Right-click any element → "Inspect" to see its classes and structure

### Tip 3: Hot Reload

Save your file and the browser auto-updates. No need to refresh!

### Tip 4: Comment Your Code

```typescript
{/* This module shows user statistics */}
<div className="...">
  ...
</div>
```

### Tip 5: Test in Different Screen Sizes

Use browser dev tools → Toggle device toolbar (Ctrl+Shift+M) to test mobile/tablet views

---

## 📝 Common Scenarios

### Scenario 1: I want to add a notification badge

```typescript
<div className="relative">
  <button className="p-2 bg-blue-500 text-white rounded-lg">
    Notifications
  </button>
  {/* Badge */}
  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
    3
  </span>
</div>
```

### Scenario 2: I want to make something clickable

```typescript
<div 
  onClick={() => alert('Clicked!')}
  className="cursor-pointer hover:bg-gray-100"
>
  Click me!
</div>
```

### Scenario 3: I want to show loading state

```typescript
const [loading, setLoading] = useState(false);

{loading ? (
  <div className="flex items-center justify-center p-8">
    <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
  </div>
) : (
  <div>Your content here</div>
)}
```

### Scenario 4: I want to add a tooltip

```typescript
<div className="group relative">
  <button className="p-2 bg-blue-500 text-white rounded-lg">
    Hover me
  </button>
  <div className="absolute hidden group-hover:block bg-gray-800 text-white text-xs rounded py-1 px-2 -bottom-8 left-0">
    This is a tooltip
  </div>
</div>
```

### Scenario 5: I want to add a search box

```typescript
<div className="relative">
  <input
    type="text"
    placeholder="Search..."
    className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
  />
  <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
</div>
```

---

## 🎉 You're Ready to Build!

**Remember the core concepts:**

1. 📂 **Pages** = What you see (`app/`)
2. 🧩 **Components** = Reusable pieces (`components/`)
3. 🧠 **Logic** = Brain stuff (`lib/`)
4. 📝 **Types** = Rules for data (`types/`)
5. 🎨 **Styling** = Tailwind classes (`className`)

**Start Simple:**

- Change some text → See it update
- Change a color → See it change
- Add a button → Make it clickable
- Copy a module → Modify it

**Then Grow:**

- Create new components
- Add new pages
- Connect to real API
- Build complex features

**The best way to learn is by doing! Start with small changes and gradually take on bigger challenges.**

---

## 📞 Need Help?

**Common Issues:**

1. **"Module not found"** → Check your import paths use `@/`
2. **"Unexpected token"** → Check for syntax errors (missing brackets, quotes)
3. **Nothing shows up** → Check browser console for errors
4. **Styling not working** → Make sure you saved the file
5. **Changes not reflecting** → Hard refresh browser (Ctrl+Shift+R)

**Debugging Checklist:**

- [ ] No errors in terminal?
- [ ] No errors in browser console?
- [ ] File saved?
- [ ] Server running?
- [ ] Correct import paths?

---

## 🌟 Final Words

This project is like a LEGO set - all the pieces are here, you just need to arrange them the way you want!

**Don't be afraid to:**

- Break things (you can always undo)
- Try new ideas
- Copy and modify existing code
- Ask for help when stuck

**You've got this! Happy coding! 🚀**

---

## 📖 Version History

- **v1.0.0** - Initial setup with basic pages and components
- Agent management system with modals
- Drag & drop service monitoring
- Responsive design with Tailwind CSS

---

## 🤝 Contributing

Want to add features? Follow these steps:

1. Create a new branch
2. Make your changes
3. Test thoroughly
4. Document what you changed
5. Commit with clear messages

---

**Made with ❤️ for easy learning and development**