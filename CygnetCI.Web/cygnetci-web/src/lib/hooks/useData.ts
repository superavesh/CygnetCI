// src/lib/hooks/useData.ts

'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../api/apiService';
import { CONFIG } from '../config';
import type { DashboardData, Agent } from '@/types';

const initialStats = {
  activeAgents: { value: "0", trend: 0 },
  runningPipelines: { value: "0", trend: 0 },
  successRate: { value: "0%", trend: 0 },
  avgDeployTime: { value: "0s", trend: 0 }
};

// In-memory storage for dummy mode
let localAgents: Agent[] = [];

export const useData = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData>({
    agents: [],
    pipelines: [],
    tasks: [],
    stats: initialStats,
    services: { categories: { todo: { title: '', services: [] }, monitoring: { title: '', services: [] }, issues: { title: '', services: [] }, healthy: { title: '', services: [] } } }
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const fetchedData = await apiService.getAllData();
      
      // In dummy mode, use ONLY local agents if they exist
      if (!CONFIG.app.useRealAPI) {
        if (localAgents.length > 0) {
          // Use local agents instead of fetched ones
          fetchedData.agents = localAgents;
        } else {
          // First load - store fetched agents as local
          localAgents = [...fetchedData.agents];
        }
      }
      
      setData(fetchedData);
      
    } catch (err: any) {
      setError(`Failed to fetch data: ${err.message}`);
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Function to add agent locally (for dummy mode)
  const addAgentLocally = useCallback((agentData: {
    name: string;
    description: string;
    uuid: string;
    location: string;
  }) => {
    // Generate unique ID that won't conflict with existing ones
    const maxId = localAgents.length > 0 
      ? Math.max(...localAgents.map(a => a.id))
      : 1000; // Start from 1000 to avoid conflicts with dummy data IDs
    
    const newAgent: Agent = {
      id: maxId + 1,
      name: agentData.name,
      status: 'online',
      lastSeen: 'just now',
      jobs: 0,
      location: agentData.location,
      cpu: Math.floor(Math.random() * 30) + 10,
      memory: Math.floor(Math.random() * 40) + 20,
      resourceData: []
    };

    localAgents = [newAgent, ...localAgents];
    setData(prev => ({
      ...prev,
      agents: [newAgent, ...prev.agents]
    }));

    return newAgent;
  }, []);

  // Function to update agent locally (for dummy mode)
  const updateAgentLocally = useCallback((
    agentId: number,
    agentData: { name: string; description: string; location: string }
  ) => {
    localAgents = localAgents.map(agent => 
      agent.id === agentId 
        ? { ...agent, name: agentData.name, location: agentData.location }
        : agent
    );

    setData(prev => ({
      ...prev,
      agents: prev.agents.map(agent =>
        agent.id === agentId
          ? { ...agent, name: agentData.name, location: agentData.location }
          : agent
      )
    }));
  }, []);

  // Function to delete agent locally (for dummy mode)
  const deleteAgentLocally = useCallback((agentId: number) => {
    localAgents = localAgents.filter(agent => agent.id !== agentId);
    
    setData(prev => ({
      ...prev,
      agents: prev.agents.filter(agent => agent.id !== agentId)
    }));
  }, []);

  // Initial data fetch on mount - removed automatic polling
  useEffect(() => {
    fetchData();
    // Removed automatic polling - user can manually refresh using the refresh buttons
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    ...data,
    loading,
    error,
    refetch: fetchData,
    addAgentLocally,
    updateAgentLocally,
    deleteAgentLocally
  };
};