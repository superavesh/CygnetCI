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

export interface PipelineStep {
  name: string;
  command: string;
  order: number;
  shellType: 'powershell' | 'cmd' | 'bash';
}

export interface PipelineParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'choice';
  defaultValue: string;
  required: boolean;
  description: string;
  choices: string[];
}

export interface Pipeline {
  id: number;
  name: string;
  status: 'success' | 'failed' | 'running' | 'pending';
  lastRun: string;
  duration: string;
  branch: string;
  commit: string;
  agent_id?: number | null;
  steps?: PipelineStep[];
  parameters?: PipelineParameter[];
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

// Release Management Types
export interface Environment {
  id: number;
  name: string;
  description?: string;
  order_index: number;
  requires_approval: boolean;
  approvers: string[];
  created_at: string;
}

export interface ReleaseStage {
  id: number;
  environment_id: number;
  environment?: {
    id: number;
    name: string;
    requires_approval: boolean;
  };
  order_index: number;
  pipeline_id?: number;
  pipeline?: {
    id: number;
    name: string;
  };
  pre_deployment_approval: boolean;
  post_deployment_approval: boolean;
  auto_deploy: boolean;
}

export interface ReleasePipeline {
  id: number;
  release_id: number;
  pipeline_id: number;
  pipeline?: {
    id: number;
    name: string;
  };
  order_index: number;
  execution_mode: 'sequential' | 'parallel';
  depends_on?: number;
  position_x: number;
  position_y: number;
  created_at: string;
}

export interface Release {
  id: number;
  name: string;
  description?: string;
  pipeline_id?: number;
  version?: string;
  status: 'active' | 'disabled' | 'archived';
  created_by?: string;
  created_at: string;
  stages: ReleaseStage[];
  pipelines?: ReleasePipeline[];
  latest_execution?: ReleaseExecutionSummary;
}

export interface ReleaseExecutionSummary {
  id: number;
  release_number: string;
  status: 'pending' | 'in_progress' | 'succeeded' | 'failed' | 'cancelled' | 'partially_succeeded';
  started_at?: string;
  completed_at?: string;
}

export interface StageExecution {
  id: number;
  environment_name: string;
  status: 'pending' | 'awaiting_approval' | 'in_progress' | 'succeeded' | 'failed' | 'cancelled' | 'skipped';
  approval_status: 'not_required' | 'pending' | 'approved' | 'rejected';
  approved_by?: string;
  started_at?: string;
  completed_at?: string;
}

export interface ReleaseExecution {
  id: number;
  release_number: string;
  triggered_by?: string;
  status: 'pending' | 'in_progress' | 'succeeded' | 'failed' | 'cancelled' | 'partially_succeeded';
  artifact_version?: string;
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;
  parameters: Record<string, string>;
  stages: StageExecution[];
}

export interface Artifact {
  id: number;
  name: string;
  version: string;
  artifact_type: 'build' | 'container' | 'package' | 'file' | 'other';
  size_bytes?: number;
  created_at: string;
  created_by?: string;
  download_url?: string;
}

// File Transfer Types
export interface TransferFile {
  id: number;
  file_type: 'script' | 'artifact';
  file_name: string;
  version: string;
  file_path: string;
  file_size_bytes?: number;
  checksum?: string;
  uploaded_by?: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface TransferFilePickup {
  id: number;
  transfer_file_id: number;
  file_name: string;
  file_type: 'script' | 'artifact';
  version: string;
  agent_uuid: string;
  agent_name?: string;
  status: 'pending' | 'downloaded' | 'failed';
  requested_by?: string;
  requested_at: string;
  downloaded_at?: string;
  acknowledged_at?: string;
  error_message?: string;
}