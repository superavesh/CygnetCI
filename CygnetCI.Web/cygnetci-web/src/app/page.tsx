// src/app/page.tsx (Overview Page)

'use client';

import React from 'react';
import { Server, GitBranch, CheckCircle, Clock, RefreshCw, XCircle, Monitor } from 'lucide-react';
import { useData } from '@/lib/hooks/useData';
import { StatCard } from '@/components/cards/StatCard';
import { StatusBadge } from '@/components/common/StatusBadge';
import { CONFIG } from '@/lib/config';

export default function OverviewPage() {
  const { agents, pipelines, stats, refetch } = useData();

  return (
    <div className="space-y-8">
      {/* API Status Indicator */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`h-3 w-3 rounded-full ${CONFIG.app.useRealAPI ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
            <span className="text-sm text-gray-600">
              {CONFIG.app.useRealAPI ? 'Connected to API' : 'Using dummy data'}
            </span>
          </div>
          <button
            onClick={() => {
              CONFIG.app.useRealAPI = !CONFIG.app.useRealAPI;
              refetch();
            }}
            className="text-sm text-blue-500 hover:text-blue-700 transition-colors"
          >
            {CONFIG.app.useRealAPI ? 'Switch to Dummy' : 'Switch to API'}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Active Agents" 
          value={stats.activeAgents.value} 
          icon={Server} 
          color="bg-gradient-to-br from-blue-500 to-blue-600"
          trend={stats.activeAgents.trend}
        />
        <StatCard 
          title="Running Pipelines" 
          value={stats.runningPipelines.value} 
          icon={GitBranch} 
          color="bg-gradient-to-br from-green-500 to-green-600"
          trend={stats.runningPipelines.trend}
        />
        <StatCard 
          title="Success Rate" 
          value={stats.successRate.value} 
          icon={CheckCircle} 
          color="bg-gradient-to-br from-purple-500 to-purple-600"
          trend={stats.successRate.trend}
        />
        <StatCard 
          title="Avg Deploy Time" 
          value={stats.avgDeployTime.value} 
          icon={Clock} 
          color="bg-gradient-to-br from-orange-500 to-orange-600"
          trend={stats.avgDeployTime.trend}
        />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Pipelines */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                <GitBranch className="h-5 w-5 mr-2 text-blue-500" />
                Recent Pipelines
              </h3>
              <button 
                onClick={refetch}
                className="text-blue-500 hover:text-blue-700 transition-colors"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {pipelines.slice(0, 3).map(pipeline => (
                <div key={pipeline.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      {pipeline.status === 'success' && <CheckCircle className="h-5 w-5 text-green-500" />}
                      {pipeline.status === 'running' && <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />}
                      {pipeline.status === 'failed' && <XCircle className="h-5 w-5 text-red-500" />}
                      {pipeline.status === 'pending' && <Clock className="h-5 w-5 text-gray-500" />}
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">{pipeline.name}</p>
                      <p className="text-sm text-gray-500">{pipeline.branch} • {pipeline.lastRun}</p>
                    </div>
                  </div>
                  <StatusBadge status={pipeline.status} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Agent Status */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                <Server className="h-5 w-5 mr-2 text-green-500" />
                Agent Status
              </h3>
              <button 
                onClick={refetch}
                className="text-blue-500 hover:text-blue-700 transition-colors"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {agents.map(agent => (
                <div key={agent.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <Monitor className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">{agent.name}</p>
                      <p className="text-sm text-gray-500">{agent.location} • {agent.jobs} jobs</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={agent.status} />
                    <p className="text-xs text-gray-500 mt-1">{agent.lastSeen}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}