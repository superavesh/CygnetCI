// src/app/monitoring/page.tsx - Matching Project Theme

'use client';

import React, { useState, useEffect } from 'react';
import {
  Monitor, Activity, Cpu, HardDrive, Server, Settings,
  RefreshCw, Globe, ChevronRight
} from 'lucide-react';
import { useCustomer } from '@/lib/contexts/CustomerContext';
import { MetricDetailModal } from '@/components/monitoring/MetricDetailModal';
import { WindowsServicesModal } from '@/components/monitoring/WindowsServicesModal';
import { DriveInfoModal } from '@/components/monitoring/DriveInfoModal';
import { WebsitePingModal } from '@/components/monitoring/WebsitePingModal';

interface AgentMetrics {
  id: number;
  uuid: string;
  name: string;
  status: string;
  location: string;
  cpu: number;
  memory: number;
  disk: number;
  jobs: number;
  last_seen: string | null;
}

type ModalType = 'cpu' | 'memory' | 'disk' | 'services' | 'drives' | 'ping' | null;

export default function MonitoringPage() {
  const { selectedCustomer } = useCustomer();
  const [agents, setAgents] = useState<AgentMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal states
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentMetrics | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<'cpu' | 'memory' | 'disk'>('cpu');

  const fetchAgentsMetrics = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setRefreshing(true);
    try {
      const url = selectedCustomer
        ? `http://127.0.0.1:8000/monitoring/agents/metrics?customer_id=${selectedCustomer.id}`
        : 'http://127.0.0.1:8000/monitoring/agents/metrics';
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setAgents(data);
      }
    } catch (error) {
      console.error('Failed to fetch agents metrics:', error);
    } finally {
      if (showLoading) setLoading(false);
      setRefreshing(false);
    }
  };

  const handleBoxClick = (agent: AgentMetrics, modalType: ModalType, metric?: 'cpu' | 'memory' | 'disk') => {
    setSelectedAgent(agent);
    setActiveModal(modalType);
    if (metric) setSelectedMetric(metric);
  };

  const closeModal = () => {
    setActiveModal(null);
    setSelectedAgent(null);
  };

  useEffect(() => {
    fetchAgentsMetrics();

    // Auto-refresh every 10 seconds
    const interval = setInterval(() => {
      fetchAgentsMetrics(false);
    }, 10000);

    return () => clearInterval(interval);
  }, [selectedCustomer]);

  const getMetricColor = (value: number) => {
    if (value >= 80) return { bg: 'bg-red-500', text: 'text-red-600', border: 'border-red-300' };
    if (value >= 60) return { bg: 'bg-yellow-500', text: 'text-yellow-600', border: 'border-yellow-300' };
    return { bg: 'bg-green-500', text: 'text-green-600', border: 'border-green-300' };
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'online':
        return 'bg-green-500';
      case 'offline':
        return 'bg-red-500';
      case 'busy':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-900 text-lg">Loading monitoring dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-full mx-auto bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Monitor className="h-8 w-8 text-blue-600" />
              Agent Monitoring Dashboard
            </h1>
            <p className="text-gray-600 mt-1">Real-time infrastructure monitoring</p>
          </div>
          <button
            onClick={() => fetchAgentsMetrics()}
            className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors ${refreshing ? 'opacity-75' : ''}`}
            disabled={refreshing}
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Agents</p>
              <p className="text-3xl font-bold text-gray-900">{agents.length}</p>
            </div>
            <Server className="h-12 w-12 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Online</p>
              <p className="text-3xl font-bold text-green-600">
                {agents.filter(a => a.status === 'online').length}
              </p>
            </div>
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <Activity className="h-7 w-7 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Offline</p>
              <p className="text-3xl font-bold text-red-600">
                {agents.filter(a => a.status === 'offline').length}
              </p>
            </div>
            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
              <Server className="h-7 w-7 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Jobs</p>
              <p className="text-3xl font-bold text-purple-600">
                {agents.reduce((sum, a) => sum + a.jobs, 0)}
              </p>
            </div>
            <Activity className="h-12 w-12 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Agent Rows */}
      <div className="space-y-4">
        {agents.map((agent) => {
          const cpuColor = getMetricColor(agent.cpu);
          const memColor = getMetricColor(agent.memory);
          const diskColor = getMetricColor(agent.disk);

          return (
            <div
              key={agent.id}
              className="bg-white rounded-lg shadow-md border border-gray-200 p-6 hover:shadow-lg transition-shadow"
            >
              {/* Agent Header */}
              <div className="flex items-center justify-between mb-5 pb-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <span className={`h-4 w-4 rounded-full ${getStatusColor(agent.status)} animate-pulse`}></span>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{agent.name}</h3>
                    <p className="text-sm text-gray-600">{agent.location}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    agent.status === 'online'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {agent.status.toUpperCase()}
                  </span>
                  {agent.last_seen && (
                    <span className="text-xs text-gray-500">
                      Last seen: {new Date(agent.last_seen).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Metric Boxes Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {/* CPU Box */}
                <button
                  onClick={() => handleBoxClick(agent, 'cpu', 'cpu')}
                  className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-lg p-4 hover:border-blue-400 hover:shadow-md transition-all group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Cpu className="h-5 w-5 text-blue-600" />
                    <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
                  </div>
                  <p className="text-xs text-gray-600 mb-1">CPU</p>
                  <p className={`text-2xl font-bold ${cpuColor.text}`}>{agent.cpu}%</p>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className={`${cpuColor.bg} h-2 rounded-full transition-all`}
                      style={{ width: `${agent.cpu}%` }}
                    ></div>
                  </div>
                </button>

                {/* Memory Box */}
                <button
                  onClick={() => handleBoxClick(agent, 'memory', 'memory')}
                  className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200 rounded-lg p-4 hover:border-purple-400 hover:shadow-md transition-all group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Activity className="h-5 w-5 text-purple-600" />
                    <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-purple-600 transition-colors" />
                  </div>
                  <p className="text-xs text-gray-600 mb-1">RAM</p>
                  <p className={`text-2xl font-bold ${memColor.text}`}>{agent.memory}%</p>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className={`${memColor.bg} h-2 rounded-full transition-all`}
                      style={{ width: `${agent.memory}%` }}
                    ></div>
                  </div>
                </button>

                {/* Disk Box */}
                <button
                  onClick={() => handleBoxClick(agent, 'disk', 'disk')}
                  className="bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-200 rounded-lg p-4 hover:border-orange-400 hover:shadow-md transition-all group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <HardDrive className="h-5 w-5 text-orange-600" />
                    <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-orange-600 transition-colors" />
                  </div>
                  <p className="text-xs text-gray-600 mb-1">Disk</p>
                  <p className={`text-2xl font-bold ${diskColor.text}`}>{agent.disk}%</p>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className={`${diskColor.bg} h-2 rounded-full transition-all`}
                      style={{ width: `${agent.disk}%` }}
                    ></div>
                  </div>
                </button>

                {/* Drives Box */}
                <button
                  onClick={() => handleBoxClick(agent, 'drives')}
                  className="bg-gradient-to-br from-cyan-50 to-cyan-100 border-2 border-cyan-200 rounded-lg p-4 hover:border-cyan-400 hover:shadow-md transition-all group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <HardDrive className="h-5 w-5 text-cyan-600" />
                    <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-cyan-600 transition-colors" />
                  </div>
                  <p className="text-xs text-gray-600 mb-1">Drive Sizes</p>
                  <p className="text-xl font-bold text-gray-900">View</p>
                  <p className="text-xs text-gray-500 mt-1">All Drives</p>
                </button>

                {/* Services Box */}
                <button
                  onClick={() => handleBoxClick(agent, 'services')}
                  className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200 rounded-lg p-4 hover:border-green-400 hover:shadow-md transition-all group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Settings className="h-5 w-5 text-green-600" />
                    <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-green-600 transition-colors" />
                  </div>
                  <p className="text-xs text-gray-600 mb-1">Win Services</p>
                  <p className="text-xl font-bold text-gray-900">Manage</p>
                  <p className="text-xs text-gray-500 mt-1">CI Services</p>
                </button>

                {/* Website Ping Box */}
                <button
                  onClick={() => handleBoxClick(agent, 'ping')}
                  className="bg-gradient-to-br from-pink-50 to-pink-100 border-2 border-pink-200 rounded-lg p-4 hover:border-pink-400 hover:shadow-md transition-all group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Globe className="h-5 w-5 text-pink-600" />
                    <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-pink-600 transition-colors" />
                  </div>
                  <p className="text-xs text-gray-600 mb-1">API/Web Ping</p>
                  <p className="text-xl font-bold text-gray-900">Health</p>
                  <p className="text-xs text-gray-500 mt-1">Check Status</p>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* No Agents Message */}
      {agents.length === 0 && (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-12 text-center">
          <Server className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Agents Found</h3>
          <p className="text-gray-600">No agents are currently registered in the system.</p>
        </div>
      )}

      {/* Modals */}
      {selectedAgent && activeModal === 'cpu' && (
        <MetricDetailModal
          isOpen={true}
          onClose={closeModal}
          agentUuid={selectedAgent.uuid}
          agentName={selectedAgent.name}
          metricType="cpu"
          currentValue={selectedAgent.cpu}
        />
      )}

      {selectedAgent && activeModal === 'memory' && (
        <MetricDetailModal
          isOpen={true}
          onClose={closeModal}
          agentUuid={selectedAgent.uuid}
          agentName={selectedAgent.name}
          metricType="memory"
          currentValue={selectedAgent.memory}
        />
      )}

      {selectedAgent && activeModal === 'disk' && (
        <MetricDetailModal
          isOpen={true}
          onClose={closeModal}
          agentUuid={selectedAgent.uuid}
          agentName={selectedAgent.name}
          metricType="disk"
          currentValue={selectedAgent.disk}
        />
      )}

      {selectedAgent && activeModal === 'services' && (
        <WindowsServicesModal
          isOpen={true}
          onClose={closeModal}
          agentUuid={selectedAgent.uuid}
          agentName={selectedAgent.name}
        />
      )}

      {selectedAgent && activeModal === 'drives' && (
        <DriveInfoModal
          isOpen={true}
          onClose={closeModal}
          agentUuid={selectedAgent.uuid}
          agentName={selectedAgent.name}
        />
      )}

      {selectedAgent && activeModal === 'ping' && (
        <WebsitePingModal
          isOpen={true}
          onClose={closeModal}
          agentUuid={selectedAgent.uuid}
          agentName={selectedAgent.name}
        />
      )}
    </div>
  );
}
