// src/data/dummyData.ts

import type { DashboardData } from '@/types';

// Generate dummy resource usage data
export const generateResourceData = () => {
  const data = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 5 * 60 * 1000);
    data.push({
      time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      cpu: Math.floor(Math.random() * 30) + 20,
      memory: Math.floor(Math.random() * 25) + 40,
      disk: Math.floor(Math.random() * 15) + 10
    });
  }
  return data;
};

export const DUMMY_DATA: DashboardData = {
  agents: [
    {
      id: 1,
      name: "TotalEnergies",
      status: "online",
      lastSeen: "2 minutes ago",
      jobs: 3,
      location: "Server-1",
      cpu: 45,
      memory: 67,
      resourceData: generateResourceData()
    },
    {
      id: 2,
      name: "TKM",
      status: "online",
      lastSeen: "1 minute ago",
      jobs: 1,
      location: "Server-2",
      cpu: 23,
      memory: 43,
      resourceData: generateResourceData()
    },
    {
      id: 3,
      name: "KotakLife",
      status: "offline",
      lastSeen: "15 minutes ago",
      jobs: 0,
      location: "Server-3",
      cpu: 0,
      memory: 0,
      resourceData: []
    },
    {
      id: 4,
      name: "Indorama",
      status: "busy",
      lastSeen: "now",
      jobs: 2,
      location: "Server-4",
      cpu: 78,
      memory: 89,
      resourceData: generateResourceData()
    }
  ],
  pipelines: [
    {
      id: 1,
      name: "Frontend Deploy",
      status: "success",
      lastRun: "5 minutes ago",
      duration: "2m 34s",
      branch: "main",
      commit: "abc123f",
      agent_id: 1,
      steps: [
        { name: "Install Dependencies", command: "npm install", order: 1 },
        { name: "Run Tests", command: "npm test", order: 2 },
        { name: "Build Application", command: "npm run build --env={{ENV}}", order: 3 },
        { name: "Deploy to Server", command: "npm run deploy", order: 4 }
      ],
      parameters: [
        {
          name: "ENV",
          type: "choice",
          defaultValue: "staging",
          required: true,
          description: "Target deployment environment",
          choices: ["dev", "staging", "production"]
        },
        {
          name: "VERSION",
          type: "string",
          defaultValue: "latest",
          required: false,
          description: "Version tag for deployment",
          choices: []
        }
      ]
    },
    {
      id: 2,
      name: "Backend API",
      status: "running",
      lastRun: "now",
      duration: "1m 12s",
      branch: "develop",
      commit: "def456g",
      agent_id: 2,
      steps: [
        { name: "Setup Environment", command: "python -m venv venv", order: 1 },
        { name: "Install Dependencies", command: "pip install -r requirements.txt", order: 2 },
        { name: "Run Tests", command: "pytest", order: 3 },
        { name: "Build Docker Image", command: "docker build -t api:{{VERSION}} .", order: 4 }
      ],
      parameters: [
        {
          name: "VERSION",
          type: "string",
          defaultValue: "1.0.0",
          required: true,
          description: "Docker image version",
          choices: []
        },
        {
          name: "PORT",
          type: "number",
          defaultValue: "8000",
          required: false,
          description: "API port number",
          choices: []
        },
        {
          name: "DEBUG",
          type: "boolean",
          defaultValue: "false",
          required: false,
          description: "Enable debug mode",
          choices: []
        }
      ]
    },
    {
      id: 3,
      name: "Database Migration",
      status: "failed",
      lastRun: "1 hour ago",
      duration: "45s",
      branch: "main",
      commit: "ghi789h",
      agent_id: 1,
      steps: [
        { name: "Backup Database", command: "pg_dump mydb > backup.sql", order: 1 },
        { name: "Run Migrations", command: "alembic upgrade head", order: 2 },
        { name: "Verify Schema", command: "alembic current", order: 3 }
      ],
      parameters: [
        {
          name: "DB_HOST",
          type: "string",
          defaultValue: "localhost",
          required: true,
          description: "Database host address",
          choices: []
        },
        {
          name: "DRY_RUN",
          type: "boolean",
          defaultValue: "true",
          required: false,
          description: "Test migration without applying",
          choices: []
        }
      ]
    },
    {
      id: 4,
      name: "Mobile App Build",
      status: "pending",
      lastRun: "2 hours ago",
      duration: "5m 23s",
      branch: "feature/mobile",
      commit: "jkl012i",
      agent_id: null,
      steps: [
        { name: "Setup React Native", command: "npx react-native init", order: 1 },
        { name: "Install Dependencies", command: "npm install", order: 2 },
        { name: "Build Android APK", command: "cd android && ./gradlew assembleRelease", order: 3 }
      ],
      parameters: []
    }
  ],
  tasks: [
    {
      id: 1,
      name: "Build Docker Image",
      pipeline: "Frontend Deploy",
      agent: "Agent-001",
      status: "completed",
      startTime: "10:45 AM",
      duration: "1m 23s"
    },
    {
      id: 2,
      name: "Run Tests",
      pipeline: "Backend API",
      agent: "Agent-002",
      status: "running",
      startTime: "10:50 AM",
      duration: "45s"
    },
    {
      id: 3,
      name: "Deploy to Staging",
      pipeline: "Frontend Deploy",
      agent: "Agent-001",
      status: "queued",
      startTime: "-",
      duration: "-"
    }
  ],
  stats: {
    activeAgents: { value: "3", trend: 12 },
    runningPipelines: { value: "2", trend: 8 },
    successRate: { value: "94%", trend: 3 },
    avgDeployTime: { value: "2m 45s", trend: -15 }
  },
  services: {
    categories: {
      todo: {
        title: "To Monitor",
        services: [
          {
            id: "svc-1",
            name: "Redis Cache Server",
            type: "database",
            status: "healthy",
            lastCheck: "2 min ago",
            response: "5ms",
            uptime: "99.9%",
            url: "redis://localhost:6379"
          },
          {
            id: "svc-2",
            name: "New API Service",
            type: "api",
            status: "unknown",
            lastCheck: "never",
            response: "-",
            uptime: "-",
            url: "https://new-api.company.com"
          }
        ]
      },
      monitoring: {
        title: "Monitoring",
        services: [
          {
            id: "svc-3",
            name: "Production Website",
            type: "website",
            status: "healthy",
            lastCheck: "1 min ago",
            response: "245ms",
            uptime: "99.8%",
            url: "https://www.company.com"
          },
          {
            id: "svc-4",
            name: "User Authentication API",
            type: "api",
            status: "warning",
            lastCheck: "3 min ago",
            response: "1.2s",
            uptime: "98.5%",
            url: "https://auth.company.com"
          },
          {
            id: "svc-5",
            name: "RabbitMQ Message Queue",
            type: "service",
            status: "healthy",
            lastCheck: "1 min ago",
            response: "12ms",
            uptime: "99.9%",
            url: "amqp://rabbitmq.internal:5672"
          },
          {
            id: "svc-6",
            name: "Email Service Worker",
            type: "service",
            status: "healthy",
            lastCheck: "30 sec ago",
            response: "89ms",
            uptime: "99.7%",
            url: "smtp://mail.company.com"
          }
        ]
      },
      issues: {
        title: "Issues",
        services: [
          {
            id: "svc-7",
            name: "Legacy Database",
            type: "database",
            status: "critical",
            lastCheck: "5 min ago",
            response: "5.2s",
            uptime: "87.3%",
            url: "mysql://legacy-db:3306"
          },
          {
            id: "svc-8",
            name: "File Storage API",
            type: "api",
            status: "down",
            lastCheck: "10 min ago",
            response: "timeout",
            uptime: "45.2%",
            url: "https://files.company.com"
          }
        ]
      },
      healthy: {
        title: "Healthy",
        services: [
          {
            id: "svc-9",
            name: "Main Database",
            type: "database",
            status: "healthy",
            lastCheck: "30 sec ago",
            response: "8ms",
            uptime: "99.99%",
            url: "postgresql://main-db:5432"
          },
          {
            id: "svc-10",
            name: "CDN Service",
            type: "website",
            status: "healthy",
            lastCheck: "1 min ago",
            response: "15ms",
            uptime: "99.95%",
            url: "https://cdn.company.com"
          },
          {
            id: "svc-11",
            name: "Payment Gateway",
            type: "api",
            status: "healthy",
            lastCheck: "2 min ago",
            response: "156ms",
            uptime: "99.8%",
            url: "https://payments.company.com"
          }
        ]
      }
    }
  }
};