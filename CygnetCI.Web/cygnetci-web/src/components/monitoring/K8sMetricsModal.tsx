'use client';

import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Box, Server, AlertTriangle, LayoutGrid } from 'lucide-react';
import { CONFIG } from '@/lib/config';

interface K8sNodeMetric {
  node_name: string;
  cpu_usage_percent: number;
  memory_usage_percent: number;
  status: string;
}

interface K8sPodMetric {
  pod_name: string;
  namespace: string;
  phase: string;
  restart_count: number;
  cpu_usage_cores: number;
  memory_usage_mb: number;
  container_image: string;
}

interface K8sDeploymentMetric {
  deployment_name: string;
  namespace: string;
  desired_replicas: number;
  ready_replicas: number;
  available_replicas: number;
}

interface K8sAlert {
  alert_name: string;
  severity: string;
  namespace: string;
  summary: string;
  fired_at: string;
}

interface K8sSnapshot {
  collected_at: string | null;
  nodes: K8sNodeMetric[];
  pods: K8sPodMetric[];
  deployments: K8sDeploymentMetric[];
  firing_alerts: K8sAlert[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  agentUuid: string;
  agentName: string;
}

type Tab = 'nodes' | 'pods' | 'deployments' | 'alerts';

export const K8sMetricsModal: React.FC<Props> = ({ isOpen, onClose, agentUuid, agentName }) => {
  const [data, setData] = useState<K8sSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('nodes');
  const [nsFilter, setNsFilter] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `${CONFIG.api.baseUrl}/agents/${agentUuid}/k8s-metrics`,
        { headers: CONFIG.api.headers }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      setError(e.message || 'Failed to load K8s metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchData();
  }, [isOpen, agentUuid]);

  if (!isOpen) return null;

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'nodes',       label: 'Nodes',       icon: <Server className="h-4 w-4" />,        count: data?.nodes.length ?? 0 },
    { key: 'pods',        label: 'Pods',         icon: <Box className="h-4 w-4" />,           count: data?.pods.length ?? 0 },
    { key: 'deployments', label: 'Deployments',  icon: <LayoutGrid className="h-4 w-4" />,    count: data?.deployments.length ?? 0 },
    { key: 'alerts',      label: 'Alerts',       icon: <AlertTriangle className="h-4 w-4" />, count: data?.firing_alerts.length ?? 0 },
  ];

  const filteredPods = (data?.pods ?? []).filter(p =>
    !nsFilter || p.namespace.includes(nsFilter)
  );
  const filteredDeploys = (data?.deployments ?? []).filter(d =>
    !nsFilter || d.namespace.includes(nsFilter)
  );

  const phaseColor = (phase: string) => {
    if (phase === 'Running') return 'bg-green-100 text-green-800';
    if (phase === 'Pending') return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const severityColor = (sev: string) => {
    if (sev === 'critical') return 'bg-red-100 text-red-800';
    if (sev === 'warning')  return 'bg-yellow-100 text-yellow-800';
    return 'bg-blue-100 text-blue-800';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Kubernetes Observability</h2>
            <p className="text-sm text-gray-500">{agentName}{data?.collected_at ? ` · Last updated ${new Date(data.collected_at).toLocaleTimeString()}` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6 gap-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.icon}
              {t.label}
              {t.count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                  t.key === 'alerts' && t.count > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                }`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Namespace filter (pods/deployments tabs) */}
        {(activeTab === 'pods' || activeTab === 'deployments') && (
          <div className="px-6 py-2 border-b bg-gray-50">
            <input
              type="text"
              placeholder="Filter by namespace..."
              value={nsFilter}
              onChange={e => setNsFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg w-64 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
            />
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {error}
              <p className="mt-1 text-xs text-red-600">Make sure Prometheus is enabled and configured on this agent.</p>
            </div>
          )}

          {!loading && !error && data && (

            <>
              {/* NODES */}
              {activeTab === 'nodes' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.nodes.length === 0 && <p className="text-gray-500 text-sm col-span-3">No node data available.</p>}
                  {data.nodes.map(node => (
                    <div key={node.node_name} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-medium text-gray-900 text-sm truncate">{node.node_name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          node.status === 'Ready' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>{node.status || 'Unknown'}</span>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>CPU</span><span>{node.cpu_usage_percent}%</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(node.cpu_usage_percent, 100)}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>Memory</span><span>{node.memory_usage_percent}%</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(node.memory_usage_percent, 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* PODS */}
              {activeTab === 'pods' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Namespace', 'Pod', 'Phase', 'Restarts', 'CPU (cores)', 'Memory (MB)'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredPods.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No pods found.</td></tr>
                      )}
                      {filteredPods.map(pod => (
                        <tr key={`${pod.namespace}/${pod.pod_name}`} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-500 text-xs">{pod.namespace}</td>
                          <td className="px-4 py-2 font-medium text-gray-900 max-w-xs truncate">{pod.pod_name}</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${phaseColor(pod.phase)}`}>{pod.phase}</span>
                          </td>
                          <td className="px-4 py-2 text-gray-700">{pod.restart_count > 0
                            ? <span className="text-red-600 font-medium">{pod.restart_count}</span>
                            : pod.restart_count
                          }</td>
                          <td className="px-4 py-2 text-gray-700">{pod.cpu_usage_cores.toFixed(4)}</td>
                          <td className="px-4 py-2 text-gray-700">{pod.memory_usage_mb.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* DEPLOYMENTS */}
              {activeTab === 'deployments' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Namespace', 'Deployment', 'Desired', 'Ready', 'Available', 'Status'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredDeploys.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No deployments found.</td></tr>
                      )}
                      {filteredDeploys.map(d => {
                        const healthy = d.ready_replicas >= d.desired_replicas && d.desired_replicas > 0;
                        return (
                          <tr key={`${d.namespace}/${d.deployment_name}`} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-500 text-xs">{d.namespace}</td>
                            <td className="px-4 py-2 font-medium text-gray-900">{d.deployment_name}</td>
                            <td className="px-4 py-2 text-gray-700">{d.desired_replicas}</td>
                            <td className="px-4 py-2 text-gray-700">{d.ready_replicas}</td>
                            <td className="px-4 py-2 text-gray-700">{d.available_replicas}</td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                healthy ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>{healthy ? 'Healthy' : 'Degraded'}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ALERTS */}
              {activeTab === 'alerts' && (
                <div className="space-y-3">
                  {data.firing_alerts.length === 0 && (
                    <div className="text-center py-12">
                      <AlertTriangle className="h-12 w-12 text-green-400 mx-auto mb-3" />
                      <p className="text-gray-500 font-medium">No firing alerts</p>
                      <p className="text-gray-400 text-sm">All clear — no Prometheus alerts are currently firing.</p>
                    </div>
                  )}
                  {data.firing_alerts.map((alert, i) => (
                    <div key={i} className={`p-4 rounded-lg border ${
                      alert.severity === 'critical' ? 'bg-red-50 border-red-200' :
                      alert.severity === 'warning'  ? 'bg-yellow-50 border-yellow-200' :
                      'bg-blue-50 border-blue-200'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${severityColor(alert.severity)}`}>
                          {alert.severity?.toUpperCase() || 'INFO'}
                        </span>
                        <span className="font-semibold text-gray-900 text-sm">{alert.alert_name}</span>
                        {alert.namespace && <span className="text-xs text-gray-500">· {alert.namespace}</span>}
                      </div>
                      {alert.summary && <p className="text-sm text-gray-700">{alert.summary}</p>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {!loading && !error && !data && (
            <div className="text-center py-12 text-gray-500">
              <Server className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No K8s metrics available for this agent.</p>
              <p className="text-sm mt-1">Enable Prometheus in the agent config to start collecting metrics.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
