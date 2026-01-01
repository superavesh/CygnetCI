// src/app/agents/page.tsx

'use client';

import React, { useState } from 'react';
import { Server, RefreshCw } from 'lucide-react';
import { useData } from '@/lib/hooks/useData';
import { useCustomer } from '@/lib/contexts/CustomerContext';
import { apiService } from '@/lib/api/apiService';
import { CONFIG } from '@/lib/config';
import { AgentCard } from '@/components/cards/AgentCard';
import { SimpleChart } from '@/components/charts/SimpleChart';
import { AddAgentModal } from '@/components/agents/AddAgentModal';
import { ConfigureAgentModal } from '@/components/agents/ConfigureAgentModal';
import { AgentLogsModal } from '@/components/agents/AgentLogsModal';
import { generateResourceData } from '@/data/dummyData';
import type { Agent } from '@/types';

export default function AgentsPage() {
  const { selectedCustomer } = useCustomer();
  const { agents, refetch } = useData(selectedCustomer?.id);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const handleAddAgent = async (agentData: {
    name: string;
    description: string;
    uuid: string;
    location: string;
  }) => {
    try {
      await apiService.addAgent(agentData);
      await refetch();
      setShowAddModal(false);
    } catch (error) {
      console.error('Error adding agent:', error);
      alert('Failed to add agent. Please try again.');
    }
  };

  const handleUpdateAgent = async (
    agentId: number,
    agentData: { name: string; description: string; location: string }
  ) => {
    try {
      await apiService.updateAgent(agentId, agentData);
      await refetch();
      setShowConfigModal(false);
      setSelectedAgent(null);
    } catch (error) {
      console.error('Error updating agent:', error);
      alert('Failed to update agent. Please try again.');
    }
  };

  const handleDeleteAgent = async (agentId: number) => {
    try {
      await apiService.deleteAgent(agentId);
      await refetch();
      setShowConfigModal(false);
      setSelectedAgent(null);
    } catch (error) {
      console.error('Error deleting agent:', error);
      alert('Failed to delete agent. Please try again.');
    }
  };

  const handleConfigureAgent = (agent: Agent) => {
    setSelectedAgent(agent);
    setShowConfigModal(true);
  };

  const handleViewLogs = (agent: Agent) => {
    setSelectedAgent(agent);
    setShowLogsModal(true);
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-800">Deployment Agents</h2>
          <div className="flex gap-3">
            <button
              onClick={refetch}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
            >
              <Server className="h-4 w-4" />
              <span>Add Agent</span>
            </button>
          </div>
        </div>

        {/* Agent Resource Usage Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {agents.filter(agent => agent.status === 'online' || agent.status === 'busy').map(agent => (
            <SimpleChart
              key={`chart-${agent.id}`}
              data={agent.resourceData}
              title={`${agent.name} Resources - CPU: ${agent.cpu}% | RAM: ${agent.memory}%`}
            />
          ))}
        </div>

        {/* Agent Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map(agent => (
            <AgentCard 
              key={agent.id} 
              agent={agent}
              onConfigure={handleConfigureAgent}
              onViewLogs={handleViewLogs}
            />
          ))}
        </div>

        {/* Empty State */}
        {agents.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl shadow-lg">
            <Server className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">No Agents Found</h3>
            <p className="text-gray-600 mb-4">Get started by adding your first deployment agent</p>
            <button 
              onClick={() => setShowAddModal(true)}
              className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg inline-flex items-center space-x-2 transition-colors"
            >
              <Server className="h-5 w-5" />
              <span>Add Your First Agent</span>
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      <AddAgentModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddAgent}
      />

      <ConfigureAgentModal
        isOpen={showConfigModal}
        agent={selectedAgent}
        onClose={() => {
          setShowConfigModal(false);
          setSelectedAgent(null);
        }}
        onUpdate={handleUpdateAgent}
        onDelete={handleDeleteAgent}
      />

      <AgentLogsModal
        isOpen={showLogsModal}
        agent={selectedAgent}
        onClose={() => {
          setShowLogsModal(false);
          setSelectedAgent(null);
        }}
      />
    </>
  );
}