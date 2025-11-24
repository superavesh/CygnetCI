// DEBUG VERSION - src/components/cards/AgentCard.tsx

import React from 'react';
import { Server } from 'lucide-react';
import { StatusBadge } from '../common/StatusBadge';
import type { Agent } from '@/types';

interface AgentCardProps {
  agent: Agent;
  onConfigure: (agent: Agent) => void;
  onViewLogs: (agent: Agent) => void;
}

export const AgentCard: React.FC<AgentCardProps> = ({ agent, onConfigure, onViewLogs }) => {
  console.log('AgentCard rendered for:', agent.name);
  console.log('Props received:', { 
    hasOnConfigure: typeof onConfigure === 'function',
    hasOnViewLogs: typeof onViewLogs === 'function'
  });

  const handleConfigureClick = () => {
    console.log('Configure button clicked for:', agent.name);
    if (onConfigure) {
      onConfigure(agent);
    } else {
      console.error('onConfigure is not defined!');
    }
  };

  const handleLogsClick = () => {
    console.log('Logs button clicked for:', agent.name);
    if (onViewLogs) {
      onViewLogs(agent);
    } else {
      console.error('onViewLogs is not defined!');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`p-3 rounded-full ${
            agent.status === 'online' ? 'bg-green-100' : 
            agent.status === 'offline' ? 'bg-red-100' : 'bg-yellow-100'
          }`}>
            <Server className={`h-6 w-6 ${
              agent.status === 'online' ? 'text-green-600' : 
              agent.status === 'offline' ? 'text-red-600' : 'text-yellow-600'
            }`} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">{agent.name}</h3>
            <p className="text-sm text-gray-500">{agent.location}</p>
          </div>
        </div>
        <StatusBadge status={agent.status} />
      </div>
      
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Active Jobs</span>
          <span className="font-medium text-gray-800">{agent.jobs}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">CPU Usage</span>
          <div className="flex items-center space-x-2">
            <div className="w-16 bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${agent.cpu}%` }}
              ></div>
            </div>
            <span className="font-medium text-gray-800 text-sm">{agent.cpu}%</span>
          </div>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Memory</span>
          <div className="flex items-center space-x-2">
            <div className="w-16 bg-gray-200 rounded-full h-2">
              <div 
                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${agent.memory}%` }}
              ></div>
            </div>
            <span className="font-medium text-gray-800 text-sm">{agent.memory}%</span>
          </div>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Last Seen</span>
          <span className="font-medium text-gray-800">{agent.lastSeen}</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 flex space-x-2">
        <button 
          onClick={handleConfigureClick}
          className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 px-3 rounded-lg text-sm transition-colors"
        >
          Configure
        </button>
        <button 
          onClick={handleLogsClick}
          className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-3 rounded-lg text-sm transition-colors"
        >
          Logs
        </button>
      </div>
    </div>
  );
};