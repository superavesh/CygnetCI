// src/lib/api/apiService.ts

import { CONFIG } from '../config';
import { DUMMY_DATA } from '@/data/dummyData';
import type { DashboardData, Environment, Release, ReleaseExecution, TransferFile, TransferFilePickup } from '@/types';

class ApiService {
  async fetchData(endpoint: string) {
    const url = `${CONFIG.api.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: CONFIG.api.headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async getAllData(customerId?: number): Promise<DashboardData> {
    if (!CONFIG.app.useRealAPI) {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));
      return DUMMY_DATA;
    }

    try {
      const endpoint = customerId !== undefined
        ? `${CONFIG.api.endpoints.allData}?customer_id=${customerId}`
        : CONFIG.api.endpoints.allData;
      return await this.fetchData(endpoint);
    } catch (error) {
      console.error('Error fetching data:', error);
      throw error;
    }
  }

  async runPipeline(pipelineId: number, parameters?: Record<string, any>, agentId?: number | null) {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Running pipeline ${pipelineId} (dummy mode)`, parameters, agentId);
      return { success: true, executionId: Date.now() };
    }

    const url = `${CONFIG.api.baseUrl}/pipelines/${pipelineId}/run`;
    const payload: any = {
      parameters: parameters || {},
      agent_id: agentId || null
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: CONFIG.api.headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async stopPipeline(pipelineId: number) {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Stopping pipeline ${pipelineId} (dummy mode)`);
      return { success: true };
    }

    const url = `${CONFIG.api.baseUrl}/pipelines/${pipelineId}/stop`;
    const response = await fetch(url, {
      method: 'POST',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async updateServiceStatus(serviceId: string, newCategory: string) {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Moving service ${serviceId} to ${newCategory} (dummy mode)`);
      return { success: true };
    }

    const url = `${CONFIG.api.baseUrl}/services/${serviceId}/move`;
    const response = await fetch(url, {
      method: 'POST',
      headers: CONFIG.api.headers,
      body: JSON.stringify({ category: newCategory })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  // ==================== AGENT METHODS ====================

  async addAgent(agentData: { name: string; description: string; uuid: string; location: string }) {
    if (!CONFIG.app.useRealAPI) {
      console.log('Adding agent (dummy mode):', agentData);
      return { success: true, id: Date.now() };
    }

    const url = `${CONFIG.api.baseUrl}/agents`;
    const response = await fetch(url, {
      method: 'POST',
      headers: CONFIG.api.headers,
      body: JSON.stringify(agentData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async updateAgent(agentId: number, agentData: { name: string; description: string; location: string }) {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Updating agent ${agentId} (dummy mode):`, agentData);
      return { success: true };
    }

    const url = `${CONFIG.api.baseUrl}/agents/${agentId}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: CONFIG.api.headers,
      body: JSON.stringify(agentData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async deleteAgent(agentId: number) {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Deleting agent ${agentId} (dummy mode)`);
      return { success: true };
    }

    const url = `${CONFIG.api.baseUrl}/agents/${agentId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  // ==================== PIPELINE METHODS ====================

  async createPipeline(pipelineData: any) {
    if (!CONFIG.app.useRealAPI) {
      console.log('Creating pipeline (dummy mode):', pipelineData);
      return { success: true, id: Date.now() };
    }

    const url = `${CONFIG.api.baseUrl}/pipelines`;
    const response = await fetch(url, {
      method: 'POST',
      headers: CONFIG.api.headers,
      body: JSON.stringify({
        name: pipelineData.name,
        description: pipelineData.description,
        branch: pipelineData.branch,
        agentId: pipelineData.agentId,
        steps: pipelineData.steps || [],
        parameters: pipelineData.parameters || []
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async updatePipeline(pipelineId: number, pipelineData: any) {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Updating pipeline ${pipelineId} (dummy mode):`, pipelineData);
      return { success: true };
    }

    const url = `${CONFIG.api.baseUrl}/pipelines/${pipelineId}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: CONFIG.api.headers,
      body: JSON.stringify({
        name: pipelineData.name,
        description: pipelineData.description,
        branch: pipelineData.branch,
        agentId: pipelineData.agentId,
        steps: pipelineData.steps,
        parameters: pipelineData.parameters
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async deletePipeline(pipelineId: number) {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Deleting pipeline ${pipelineId} (dummy mode)`);
      return { success: true };
    }

    const url = `${CONFIG.api.baseUrl}/pipelines/${pipelineId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  // ==================== ENVIRONMENT METHODS ====================

  async getEnvironments(): Promise<Environment[]> {
    if (!CONFIG.app.useRealAPI) {
      console.log('Getting environments (dummy mode)');
      return [
        { id: 1, name: 'Development', description: 'Dev environment', order_index: 1, requires_approval: false, approvers: [], created_at: new Date().toISOString() },
        { id: 2, name: 'QA', description: 'QA environment', order_index: 2, requires_approval: false, approvers: [], created_at: new Date().toISOString() },
        { id: 3, name: 'Staging', description: 'Staging environment', order_index: 3, requires_approval: true, approvers: [], created_at: new Date().toISOString() },
        { id: 4, name: 'Production', description: 'Production environment', order_index: 4, requires_approval: true, approvers: [], created_at: new Date().toISOString() }
      ];
    }

    const url = `${CONFIG.api.baseUrl}/environments`;
    const response = await fetch(url, {
      method: 'GET',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async createEnvironment(environmentData: { name: string; description?: string; order_index: number; requires_approval: boolean; approvers?: string[] }) {
    if (!CONFIG.app.useRealAPI) {
      console.log('Creating environment (dummy mode):', environmentData);
      return { success: true, id: Date.now() };
    }

    const url = `${CONFIG.api.baseUrl}/environments`;
    const response = await fetch(url, {
      method: 'POST',
      headers: CONFIG.api.headers,
      body: JSON.stringify(environmentData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async updateEnvironment(environmentId: number, environmentData: any) {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Updating environment ${environmentId} (dummy mode):`, environmentData);
      return { success: true };
    }

    const url = `${CONFIG.api.baseUrl}/environments/${environmentId}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: CONFIG.api.headers,
      body: JSON.stringify(environmentData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  // ==================== RELEASE METHODS ====================

  async getReleases(customerId?: number): Promise<Release[]> {
    if (!CONFIG.app.useRealAPI) {
      console.log('Getting releases (dummy mode)');
      return [];
    }

    const url = customerId
      ? `${CONFIG.api.baseUrl}/releases?customer_id=${customerId}`
      : `${CONFIG.api.baseUrl}/releases`;
    const response = await fetch(url, {
      method: 'GET',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async getRelease(releaseId: number): Promise<Release> {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Getting release ${releaseId} (dummy mode)`);
      throw new Error('Not implemented in dummy mode');
    }

    const url = `${CONFIG.api.baseUrl}/releases/${releaseId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async createRelease(releaseData: {
    name: string;
    description?: string;
    pipeline_id?: number;
    version?: string;
    customer_id?: number;
    stages: Array<{
      environment_id: number;
      order_index: number;
      pipeline_id?: number;
      pre_deployment_approval: boolean;
      post_deployment_approval: boolean;
      auto_deploy: boolean;
    }>;
  }) {
    if (!CONFIG.app.useRealAPI) {
      console.log('Creating release (dummy mode):', releaseData);
      return { success: true, id: Date.now() };
    }

    const url = `${CONFIG.api.baseUrl}/releases`;
    const response = await fetch(url, {
      method: 'POST',
      headers: CONFIG.api.headers,
      body: JSON.stringify(releaseData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async updateRelease(releaseId: number, releaseData: { name?: string; description?: string; status?: string; version?: string }) {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Updating release ${releaseId} (dummy mode):`, releaseData);
      return { success: true };
    }

    const url = `${CONFIG.api.baseUrl}/releases/${releaseId}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: CONFIG.api.headers,
      body: JSON.stringify(releaseData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async deleteRelease(releaseId: number) {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Deleting release ${releaseId} (dummy mode)`);
      return { success: true };
    }

    const url = `${CONFIG.api.baseUrl}/releases/${releaseId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async deployRelease(releaseId: number, deployData: {
    triggered_by: string;
    artifact_version?: string;
    parameters?: Record<string, any>;
    agent_id?: number | null;
  }) {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Deploying release ${releaseId} (dummy mode):`, deployData);
      return { success: true, executionId: Date.now(), releaseNumber: 'Release-1' };
    }

    const url = `${CONFIG.api.baseUrl}/releases/${releaseId}/deploy`;
    const response = await fetch(url, {
      method: 'POST',
      headers: CONFIG.api.headers,
      body: JSON.stringify(deployData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async getReleaseExecutions(releaseId: number): Promise<ReleaseExecution[]> {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Getting release executions for ${releaseId} (dummy mode)`);
      return [];
    }

    const url = `${CONFIG.api.baseUrl}/releases/${releaseId}/executions`;
    const response = await fetch(url, {
      method: 'GET',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async getReleaseExecutionLogs(stageExecutionId: number): Promise<{ logs: string }> {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Getting logs for stage execution ${stageExecutionId} (dummy mode)`);
      return { logs: 'Dummy logs - no real data available in dummy mode' };
    }

    const url = `${CONFIG.api.baseUrl}/stage-executions/${stageExecutionId}/logs`;
    const response = await fetch(url, {
      method: 'GET',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async approveStage(stageExecutionId: number, approvalData: { approved_by: string; comments?: string }) {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Approving stage ${stageExecutionId} (dummy mode):`, approvalData);
      return { success: true };
    }

    const url = `${CONFIG.api.baseUrl}/stage-executions/${stageExecutionId}/approve`;
    const response = await fetch(url, {
      method: 'POST',
      headers: CONFIG.api.headers,
      body: JSON.stringify(approvalData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async rejectStage(stageExecutionId: number, approvalData: { approved_by: string; comments?: string }) {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Rejecting stage ${stageExecutionId} (dummy mode):`, approvalData);
      return { success: true };
    }

    const url = `${CONFIG.api.baseUrl}/stage-executions/${stageExecutionId}/reject`;
    const response = await fetch(url, {
      method: 'POST',
      headers: CONFIG.api.headers,
      body: JSON.stringify(approvalData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async getPipelines() {
    if (!CONFIG.app.useRealAPI) {
      console.log('Getting pipelines (dummy mode)');
      return DUMMY_DATA.pipelines;
    }

    const url = `${CONFIG.api.baseUrl}/pipelines`;
    const response = await fetch(url, {
      method: 'GET',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async getPipeline(pipelineId: number) {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Getting pipeline ${pipelineId} (dummy mode)`);
      return DUMMY_DATA.pipelines.find(p => p.id === pipelineId);
    }

    const url = `${CONFIG.api.baseUrl}/pipelines/${pipelineId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  // ==================== FILE TRANSFER METHODS ====================

  async uploadFile(fileData: FormData): Promise<any> {
    if (!CONFIG.app.useRealAPI) {
      console.log('Uploading file (dummy mode):', fileData);
      return { success: true, file: { id: Date.now() } };
    }

    const url = `${CONFIG.api.baseUrl}/transfer/upload`;
    const response = await fetch(url, {
      method: 'POST',
      body: fileData // Don't set Content-Type for FormData
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async getTransferFiles(fileType?: string, version?: string): Promise<TransferFile[]> {
    if (!CONFIG.app.useRealAPI) {
      console.log('Getting transfer files (dummy mode)');
      return [];
    }

    let url = `${CONFIG.api.baseUrl}/transfer/files`;
    const params = new URLSearchParams();
    if (fileType) params.append('file_type', fileType);
    if (version) params.append('version', version);
    if (params.toString()) url += `?${params.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async getVersions(fileType?: string): Promise<string[]> {
    if (!CONFIG.app.useRealAPI) {
      console.log('Getting versions (dummy mode)');
      return [];
    }

    let url = `${CONFIG.api.baseUrl}/transfer/versions`;
    if (fileType) url += `?file_type=${fileType}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async pushFileToAgent(pushData: {
    transfer_file_id: number;
    agent_uuid: string;
    agent_name?: string;
    requested_by?: string;
  }): Promise<any> {
    if (!CONFIG.app.useRealAPI) {
      console.log('Pushing file to agent (dummy mode):', pushData);
      return { success: true, pickup_id: Date.now() };
    }

    const url = `${CONFIG.api.baseUrl}/transfer/push`;
    const response = await fetch(url, {
      method: 'POST',
      headers: CONFIG.api.headers,
      body: JSON.stringify(pushData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async getPickups(status?: string, agentUuid?: string): Promise<TransferFilePickup[]> {
    if (!CONFIG.app.useRealAPI) {
      console.log('Getting pickups (dummy mode)');
      return [];
    }

    let url = `${CONFIG.api.baseUrl}/transfer/pickups`;
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (agentUuid) params.append('agent_uuid', agentUuid);
    if (params.toString()) url += `?${params.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async deleteTransferFile(fileId: number): Promise<any> {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Deleting transfer file ${fileId} (dummy mode)`);
      return { success: true };
    }

    const url = `${CONFIG.api.baseUrl}/transfer/files/${fileId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async getAgents() {
    if (!CONFIG.app.useRealAPI) {
      console.log('Getting agents (dummy mode)');
      return DUMMY_DATA.agents;
    }

    const url = `${CONFIG.api.baseUrl}/agents`;
    const response = await fetch(url, {
      method: 'GET',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }
}

export const apiService = new ApiService();