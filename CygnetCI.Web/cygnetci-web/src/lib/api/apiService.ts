// src/lib/api/apiService.ts

import { CONFIG } from '../config';
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

  async addAgent(agentData: { name: string; description: string; uuid: string; location: string; customer_id?: number }) {
    const url = `${CONFIG.api.baseUrl}/agents`;
    const response = await fetch(url, {
      method: 'POST',
      headers: CONFIG.api.headers,
      body: JSON.stringify(agentData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async updateAgent(agentId: number, agentData: { name: string; description: string; location: string }) {
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
    const url = `${CONFIG.api.baseUrl}/pipelines`;
    const response = await fetch(url, {
      method: 'POST',
      headers: CONFIG.api.headers,
      body: JSON.stringify({
        name: pipelineData.name,
        description: pipelineData.description,
        branch: pipelineData.branch,
        agentId: pipelineData.agentId,
        customerId: pipelineData.customerId,
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
    stages?: Array<{
      environment_id: number;
      order_index: number;
      pipeline_id?: number;
      pre_deployment_approval: boolean;
      post_deployment_approval: boolean;
      auto_deploy: boolean;
    }>;
    pipelines?: Array<{
      pipeline_id: number;
      order_index: number;
      execution_mode: 'sequential' | 'parallel';
      depends_on?: number;
      position_x: number;
      position_y: number;
    }>;
  }) {
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

  async updateRelease(releaseId: number, releaseData: { name?: string; description?: string; status?: string; version?: string; pipelines?: any[]; stages?: any[] }) {
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
    pipeline_parameters?: Record<number, Record<string, any>>;
    agent_id?: number | null;
  }) {
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

  async abortReleaseExecution(executionId: number): Promise<{ success: boolean; message: string }> {
    const url = `${CONFIG.api.baseUrl}/release-executions/${executionId}/abort`;
    const response = await fetch(url, {
      method: 'POST',
      headers: CONFIG.api.headers
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP error! status: ${response.status}`);
    }
    return await response.json();
  }

  async approveStage(stageExecutionId: number, approvalData: { approved_by: string; comments?: string }) {
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

  async getPipelineTemplates() {
    const url = `${CONFIG.api.baseUrl}/pipelines/templates`;
    const response = await fetch(url, {
      method: 'GET',
      headers: CONFIG.api.headers
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  }

  async getPipelines(customerId?: number) {
    const url = customerId
      ? `${CONFIG.api.baseUrl}/pipelines?customer_id=${customerId}`
      : `${CONFIG.api.baseUrl}/pipelines`;
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

  uploadFileWithProgress(
    fileData: FormData,
    onProgress: (percent: number, loaded: number, total: number) => void
  ): Promise<any> {
    const url = `${CONFIG.api.baseUrl}/transfer/upload`;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent, event.loaded, event.total);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            resolve({ success: true });
          }
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText);
            reject(new Error(errorData.detail || `Upload failed with status ${xhr.status}`));
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      xhr.open('POST', url);
      xhr.send(fileData);
    });
  }

  async getTransferFiles(fileType?: string, version?: string): Promise<TransferFile[]> {
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

  async getAgents(customerId?: number) {
    const url = customerId
      ? `${CONFIG.api.baseUrl}/agents?customer_id=${customerId}`
      : `${CONFIG.api.baseUrl}/agents`;
    const response = await fetch(url, {
      method: 'GET',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async getCustomers() {
    const url = `${CONFIG.api.baseUrl}/customers`;
    const response = await fetch(url, {
      method: 'GET',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  // Email Alerts API
  async getEmailAlerts(params?: { customerId?: number; category?: string; isRead?: boolean; isStarred?: boolean }) {
    let url = `${CONFIG.api.baseUrl}/email-alerts`;
    const queryParams = new URLSearchParams();

    if (params?.customerId) queryParams.append('customer_id', params.customerId.toString());
    if (params?.category) queryParams.append('category', params.category);
    if (params?.isRead !== undefined) queryParams.append('is_read', params.isRead.toString());
    if (params?.isStarred !== undefined) queryParams.append('is_starred', params.isStarred.toString());

    if (queryParams.toString()) url += `?${queryParams.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async getEmailAlert(emailId: number) {
    const url = `${CONFIG.api.baseUrl}/email-alerts/${emailId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async createEmailAlert(data: {
    subject: string;
    sender: string;
    sender_email: string;
    preview?: string;
    body?: string;
    category?: string;
    priority?: string;
    has_attachment?: boolean;
    customer_id?: number;
  }) {
    const url = `${CONFIG.api.baseUrl}/email-alerts`;
    const response = await fetch(url, {
      method: 'POST',
      headers: CONFIG.api.headers,
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async updateEmailAlert(emailId: number, data: {
    category?: string;
    is_read?: boolean;
    is_starred?: boolean;
    priority?: string;
  }) {
    const url = `${CONFIG.api.baseUrl}/email-alerts/${emailId}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: CONFIG.api.headers,
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async deleteEmailAlert(emailId: number) {
    const url = `${CONFIG.api.baseUrl}/email-alerts/${emailId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async getEmailAlertsStats(customerId?: number) {
    let url = `${CONFIG.api.baseUrl}/email-alerts/stats/summary`;
    if (customerId) url += `?customer_id=${customerId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  // Email Configuration API
  async getEmailConfigs(customerId?: number) {
    let url = `${CONFIG.api.baseUrl}/email-configs`;
    if (customerId) url += `?customer_id=${customerId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async createEmailConfig(data: {
    name: string;
    email_address: string;
    server_type: string;
    server_host: string;
    server_port: number;
    username: string;
    password: string;
    use_ssl: boolean;
    folder: string;
    customer_id?: number;
  }) {
    const url = `${CONFIG.api.baseUrl}/email-configs`;
    const response = await fetch(url, {
      method: 'POST',
      headers: CONFIG.api.headers,
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async updateEmailConfig(configId: number, data: {
    name?: string;
    email_address?: string;
    server_type?: string;
    server_host?: string;
    server_port?: number;
    username?: string;
    password?: string;
    use_ssl?: boolean;
    folder?: string;
    is_active?: boolean;
    customer_id?: number;
  }) {
    const url = `${CONFIG.api.baseUrl}/email-configs/${configId}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: CONFIG.api.headers,
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async deleteEmailConfig(configId: number) {
    const url = `${CONFIG.api.baseUrl}/email-configs/${configId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async testEmailConnection(data: {
    name: string;
    email_address: string;
    server_type: string;
    server_host: string;
    server_port: number;
    username: string;
    password: string;
    use_ssl: boolean;
    folder: string;
  }) {
    const url = `${CONFIG.api.baseUrl}/email-configs/test-connection`;
    const response = await fetch(url, {
      method: 'POST',
      headers: CONFIG.api.headers,
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async syncEmails(configId: number, limit: number = 50) {
    const url = `${CONFIG.api.baseUrl}/email-configs/${configId}/sync?limit=${limit}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async getEmailPresets() {
    const url = `${CONFIG.api.baseUrl}/email-configs/presets/common`;
    const response = await fetch(url, {
      method: 'GET',
      headers: CONFIG.api.headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async getAlertsSummary() {
    return this.fetchData('/alerts/summary');
  }

  async getAlertSettings() {
    return this.fetchData('/settings/alerts');
  }

  async updateAlertSettings(settings: { cpu_alert_threshold?: number; ram_alert_threshold?: number; disk_alert_threshold?: number; alert_refresh_interval?: number }) {
    const url = `${CONFIG.api.baseUrl}/settings/alerts`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: CONFIG.api.headers,
      body: JSON.stringify(settings),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  }
}

export const apiService = new ApiService();
