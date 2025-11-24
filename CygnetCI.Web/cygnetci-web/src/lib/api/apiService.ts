// src/lib/api/apiService.ts

import { CONFIG } from '../config';
import { DUMMY_DATA } from '@/data/dummyData';
import type { DashboardData } from '@/types';

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

  async getAllData(): Promise<DashboardData> {
    if (!CONFIG.app.useRealAPI) {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));
      return DUMMY_DATA;
    }

    try {
      return await this.fetchData(CONFIG.api.endpoints.allData);
    } catch (error) {
      console.error('Error fetching data:', error);
      throw error;
    }
  }

  async runPipeline(pipelineId: number) {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Running pipeline ${pipelineId} (dummy mode)`);
      return { success: true };
    }

    return await this.fetchData(`/pipelines/${pipelineId}/run`);
  }

  async stopPipeline(pipelineId: number) {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Stopping pipeline ${pipelineId} (dummy mode)`);
      return { success: true };
    }

    return await this.fetchData(`/pipelines/${pipelineId}/stop`);
  }

  async updateServiceStatus(serviceId: string, newCategory: string) {
    if (!CONFIG.app.useRealAPI) {
      console.log(`Moving service ${serviceId} to ${newCategory} (dummy mode)`);
      return { success: true };
    }

    return await this.fetchData(`/services/${serviceId}/move`);
  }

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
}

export const apiService = new ApiService();