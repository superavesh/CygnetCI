// src/types/index.ts

export interface Agent {
  id: number;
  name: string;
  status: 'online' | 'offline' | 'busy';
  lastSeen: string;
  jobs: number;
  location: string;
  cpu: number;
  memory: number;
  resourceData: ResourceDataPoint[];
}

export interface ResourceDataPoint {
  time: string;
  cpu: number;
  memory: number;
  disk: number;
}

export interface Pipeline {
  id: number;
  name: string;
  status: 'success' | 'failed' | 'running' | 'pending';
  lastRun: string;
  duration: string;
  branch: string;
  commit: string;
}

export interface Task {
  id: number;
  name: string;
  pipeline: string;
  agent: string;
  status: 'completed' | 'running' | 'queued' | 'failed';
  startTime: string;
  duration: string;
}

export interface Stats {
  activeAgents: { value: string; trend: number };
  runningPipelines: { value: string; trend: number };
  successRate: { value: string; trend: number };
  avgDeployTime: { value: string; trend: number };
}

export interface Service {
  id: string;
  name: string;
  type: 'website' | 'database' | 'api' | 'service';
  status: 'healthy' | 'warning' | 'critical' | 'down' | 'unknown';
  lastCheck: string;
  response: string;
  uptime: string;
  url: string;
}

export interface ServiceCategory {
  title: string;
  services: Service[];
}

export interface Services {
  categories: {
    todo: ServiceCategory;
    monitoring: ServiceCategory;
    issues: ServiceCategory;
    healthy: ServiceCategory;
  };
}

export interface DashboardData {
  agents: Agent[];
  pipelines: Pipeline[];
  tasks: Task[];
  stats: Stats;
  services: Services;
}