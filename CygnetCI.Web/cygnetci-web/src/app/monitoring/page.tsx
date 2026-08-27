// src/app/monitoring/page.tsx - Matching Project Theme

'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Monitor, Activity, Cpu, HardDrive, Server, Settings,
  RefreshCw, Globe, ChevronRight, Container
} from 'lucide-react';
import { useCustomer } from '@/lib/contexts/CustomerContext';
import { CONFIG } from '@/lib/config';
import { MetricDetailModal } from '@/components/monitoring/MetricDetailModal';
import { WindowsServicesModal } from '@/components/monitoring/WindowsServicesModal';
import { DriveInfoModal } from '@/components/monitoring/DriveInfoModal';
import { WebsitePingModal } from '@/components/monitoring/WebsitePingModal';
import { K8sMetricsModal } from '@/components/monitoring/K8sMetricsModal';

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
  has_k8s_data: boolean;
}

type ModalType = 'cpu' | 'memory' | 'disk' | 'services' | 'drives' | 'ping' | 'k8s' | null;

function MonitoringPageInner() {
  const { selectedCustomer, customers, setSelectedCustomer } = useCustomer();
  const searchParams = useSearchParams();
  const [agents, setAgents] = useState<AgentMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [highlightedAgentId, setHighlightedAgentId] = useState<number | null>(null);

  // Modal states
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentMetrics | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<'cpu' | 'memory' | 'disk'>('cpu');

  // Guards against out-of-order responses: on a direct page load/refresh, selectedCustomer
  // starts null (CustomerContext hasn't resolved yet) and this effect fires an unscoped
  // fetch, then reruns once the real customer loads. If the earlier unscoped response
  // resolves after the scoped one, it would overwrite the correct data. Only the response
  // matching the most recently issued request is ever applied.
  const latestRequestId = useRef(0);

  const fetchAgentsMetrics = async (showLoading = true) => {
    const requestId = ++latestRequestId.current;
    if (showLoading) setLoading(true);
    setRefreshing(true);
    try {
      const url = selectedCustomer
        ? `${CONFIG.api.baseUrl}/monitoring/agents/metrics?customer_id=${selectedCustomer.id}`
        : `${CONFIG.api.baseUrl}/monitoring/agents/metrics`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (requestId === latestRequestId.current) {
          setAgents(data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch agents metrics:', error);
    } finally {
      if (requestId === latestRequestId.current) {
        if (showLoading) setLoading(false);
        setRefreshing(false);
      }
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

  // Switch customer and highlight agent from URL params ?agentId=&customerId=
  useEffect(() => {
    const agentIdParam = searchParams.get('agentId');
    const customerIdParam = searchParams.get('customerId');

    if (customerIdParam && customers.length > 0) {
      const targetCustomer = customers.find(c => c.id === parseInt(customerIdParam, 10));
      if (targetCustomer && selectedCustomer?.id !== targetCustomer.id) {
        setSelectedCustomer(targetCustomer);
      }
    }

    if (!agentIdParam) return;
    const id = parseInt(agentIdParam, 10);
    setHighlightedAgentId(id);
    setTimeout(() => {
      document.getElementById(`agent-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 600);
  }, [searchParams, customers]);

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
        return 'bg-green-600';
      case 'offline':
        return 'bg-gray-600';
      case 'busy':
        return 'bg-amber-600';
      default:
        return 'bg-gray-600';
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

          const isHighlighted = highlightedAgentId === agent.id;
          return (
            <div
              key={agent.id}
              id={`agent-${agent.id}`}
              className={`bg-white rounded-lg shadow-md border p-6 hover:shadow-lg transition-shadow ${
                isHighlighted ? 'border-blue-500 ring-2 ring-blue-400 ring-offset-1' : 'border-gray-200'
              }`}
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
                      ? 'bg-green-600 text-white'
                      : 'bg-red-600 text-white'
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
              <div className="overflow-x-auto">
              <div className={`grid gap-4 ${agent.has_k8s_data ? 'grid-cols-7 min-w-[700px]' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6'}`}>
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
                  <p className="text-xs text-gray-600 mb-1">Services</p>
                  <p className="text-xl font-bold text-gray-900">Manage</p>
                  <p className="text-xs text-gray-500 mt-1">Managed Services</p>
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

                {/* K8s Observability Box — only shown for agents with Prometheus enabled */}
                {agent.has_k8s_data && (
                  <button
                    onClick={() => handleBoxClick(agent, 'k8s')}
                    className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-2 border-indigo-200 rounded-lg p-4 hover:border-indigo-400 hover:shadow-md transition-all group cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Container className="h-5 w-5 text-indigo-600" />
                      <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                    </div>
                    <p className="text-xs text-gray-600 mb-1">Kubernetes</p>
                    <p className="text-xl font-bold text-gray-900">K8s</p>
                    <p className="text-xs text-gray-500 mt-1">Pods · Nodes · Alerts</p>
                  </button>
                )}
              </div>
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

      {selectedAgent && activeModal === 'k8s' && (
        <K8sMetricsModal
          isOpen={true}
          onClose={closeModal}
          agentUuid={selectedAgent.uuid}
          agentName={selectedAgent.name}
        />
      )}
    </div>
  );
}

export default function MonitoringPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <RefreshCw className="h-12 w-12 animate-spin text-blue-600" />
      </div>
    }>
      <MonitoringPageInner />
    </Suspense>
  );
}
