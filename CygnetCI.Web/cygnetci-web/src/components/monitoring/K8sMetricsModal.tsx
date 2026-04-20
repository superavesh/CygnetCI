'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, RefreshCw, Box, Server, AlertTriangle, LayoutGrid, Activity } from 'lucide-react';
import { CONFIG } from '@/lib/config';

// ─── Types ────────────────────────────────────────────────────────────────────

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
}

interface K8sSnapshot {
  collected_at: string | null;
  nodes: K8sNodeMetric[];
  pods: K8sPodMetric[];
  deployments: K8sDeploymentMetric[];
  firing_alerts: K8sAlert[];
  cluster_cpu_cores_total: number;
  cluster_memory_bytes_total: number;
  namespace_cpu_usage_cores: number;
  namespace_cpu_requests_cores: number;
  namespace_cpu_limits_cores: number;
  namespace_memory_usage_bytes: number;
  namespace_memory_requests_bytes: number;
  namespace_memory_limits_bytes: number;
  resource_counts: Record<string, number>;
}

interface HistoryPoint {
  collected_at: string;
  namespace_cpu_usage_cores: number;
  namespace_memory_usage_bytes: number;
  pod_count: number;
  alert_count: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  agentUuid: string;
  agentName: string;
}

type Tab = 'overview' | 'nodes' | 'pods' | 'deployments' | 'alerts';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtBytes = (b: number): string => {
  if (!b) return '0 B';
  if (b >= 1e12) return (b / 1e12).toFixed(2) + ' TB';
  if (b >= 1e9)  return (b / 1e9).toFixed(2)  + ' GB';
  if (b >= 1e6)  return (b / 1e6).toFixed(1)  + ' MB';
  return (b / 1e3).toFixed(0) + ' KB';
};

const fmtCores = (c: number): string => {
  if (!c) return '0';
  return c >= 1 ? c.toFixed(2) : (c * 1000).toFixed(0) + 'm';
};

const gaugeColor = (pct: number) =>
  pct >= 70 ? '#ef4444' : pct >= 50 ? '#f97316' : '#22c55e';

const gaugeBg = (pct: number) =>
  pct >= 70 ? '#fee2e2' : pct >= 50 ? '#ffedd5' : '#dcfce7';

// ─── SVG Arc Gauge ────────────────────────────────────────────────────────────

const ArcGauge = ({ value, label, sublabel }: { value: number; label: string; sublabel?: string }) => {
  const R = 38, cx = 50, cy = 52;
  const circ = 2 * Math.PI * R;
  const track = circ * 0.75;
  const filled = track * Math.min(Math.max(value, 0), 100) / 100;
  const color = gaugeColor(value);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 75" className="w-36 h-28">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#e5e7eb" strokeWidth="7"
          strokeDasharray={`${track} ${circ}`} strokeLinecap="round"
          transform={`rotate(135 ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
          transform={`rotate(135 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#111827" fontSize="13" fontWeight="bold">
          {value.toFixed(1)}%
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="#6b7280" fontSize="7">
          of cluster
        </text>
      </svg>
      <p className="text-xs font-semibold text-gray-700 text-center -mt-1">{label}</p>
      {sublabel && <p className="text-xs text-gray-500 text-center mt-0.5">{sublabel}</p>}
    </div>
  );
};

// ─── Sparkline ────────────────────────────────────────────────────────────────

const Sparkline = ({ data, color = '#3b82f6' }: { data: number[]; color?: string }) => {
  if (data.length < 2) return <span className="text-gray-400 text-xs">no history</span>;
  const max = Math.max(...data) || 1;
  const w = 100, h = 24;
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 2) - 1}`
  ).join(' ');
  const fillPoints = `0,${h} ${points} ${w},${h}`;
  return (
    <svg width={w} height={h} className="inline-block">
      <polygon points={fillPoints} fill={color} fillOpacity="0.1" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
};

// ─── Progress Bar ─────────────────────────────────────────────────────────────

const Bar = ({ value, max, color = '#3b82f6' }: { value: number; max: number; color?: string }) => {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
};

// ─── Stat Row ─────────────────────────────────────────────────────────────────

const StatRow = ({ label, value, color = '#3b82f6' }: { label: string; value: string; color?: string }) => (
  <div className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
    <span className="text-xs text-gray-500">{label}</span>
    <span className="text-xs font-mono font-semibold" style={{ color }}>{value}</span>
  </div>
);

// ─── Resource Count Card ──────────────────────────────────────────────────────

const CountCard = ({ label, count, color = '#3b82f6', bg = '#eff6ff' }: { label: string; count: number; color?: string; bg?: string }) => (
  <div className="border border-gray-200 rounded-lg px-3 py-2.5 text-center min-w-[72px]" style={{ backgroundColor: bg }}>
    <div className="text-xl font-bold" style={{ color }}>{count}</div>
    <div className="text-xs text-gray-500 capitalize mt-0.5">{label}</div>
  </div>
);

// ─── Main Modal ───────────────────────────────────────────────────────────────

export const K8sMetricsModal: React.FC<Props> = ({ isOpen, onClose, agentUuid, agentName }) => {
  const [data, setData] = useState<K8sSnapshot | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [nsFilter, setNsFilter] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [snap, hist] = await Promise.all([
        fetch(`${CONFIG.api.baseUrl}/agents/${agentUuid}/k8s-metrics`, { headers: CONFIG.api.headers }),
        fetch(`${CONFIG.api.baseUrl}/agents/${agentUuid}/k8s-metrics/history`, { headers: CONFIG.api.headers }),
      ]);
      if (!snap.ok) throw new Error(`HTTP ${snap.status}`);
      setData(await snap.json());
      if (hist.ok) setHistory(await hist.json());
    } catch (e: any) {
      setError(e.message || 'Failed to load K8s metrics');
    } finally {
      setLoading(false);
    }
  }, [agentUuid]);

  useEffect(() => {
    if (isOpen) fetchData();
  }, [isOpen, fetchData]);

  useEffect(() => {
    if (!isOpen || !autoRefresh) return;
    const id = setInterval(fetchData, 60000);
    return () => clearInterval(id);
  }, [isOpen, autoRefresh, fetchData]);

  if (!isOpen) return null;

  // Derived values
  const cpuPct = data && data.cluster_cpu_cores_total > 0
    ? (data.namespace_cpu_usage_cores / data.cluster_cpu_cores_total) * 100 : 0;
  const memPct = data && data.cluster_memory_bytes_total > 0
    ? (data.namespace_memory_usage_bytes / data.cluster_memory_bytes_total) * 100 : 0;

  const filteredPods = (data?.pods ?? []).filter(p => !nsFilter || p.namespace.includes(nsFilter));
  const filteredDeploys = (data?.deployments ?? []).filter(d => !nsFilter || d.namespace.includes(nsFilter));

  const topCpuPods = [...(data?.pods ?? [])].sort((a, b) => b.cpu_usage_cores - a.cpu_usage_cores).slice(0, 10);
  const topMemPods = [...(data?.pods ?? [])].sort((a, b) => b.memory_usage_mb - a.memory_usage_mb).slice(0, 10);
  const maxCpu = topCpuPods[0]?.cpu_usage_cores || 1;
  const maxMem = topMemPods[0]?.memory_usage_mb || 1;

  const histCpu = history.map(h => h.namespace_cpu_usage_cores);
  const histMem = history.map(h => h.namespace_memory_usage_bytes / 1e9);
  const histPods = history.map(h => h.pod_count);

  const rc = data?.resource_counts ?? {};

  const tabs: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'overview',    label: 'Overview',    icon: <Activity className="h-3.5 w-3.5" /> },
    { key: 'nodes',       label: 'Nodes',       icon: <Server className="h-3.5 w-3.5" />,        badge: data?.nodes.length },
    { key: 'pods',        label: 'Pods',        icon: <Box className="h-3.5 w-3.5" />,           badge: data?.pods.length },
    { key: 'deployments', label: 'Deployments', icon: <LayoutGrid className="h-3.5 w-3.5" />,    badge: data?.deployments.length },
    { key: 'alerts',      label: 'Alerts',      icon: <AlertTriangle className="h-3.5 w-3.5" />, badge: data?.firing_alerts.length },
  ];

  const phaseColor = (phase: string) =>
    phase === 'Running' ? 'bg-green-100 text-green-700' :
    phase === 'Pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';

  const severityBorder = (sev: string) =>
    sev === 'critical' ? 'border-red-300 bg-red-50' :
    sev === 'warning'  ? 'border-yellow-300 bg-yellow-50' : 'border-blue-300 bg-blue-50';

  const severityBadge = (sev: string) =>
    sev === 'critical' ? 'bg-red-100 text-red-700' :
    sev === 'warning'  ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[93vh] flex flex-col border border-gray-200">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 rounded-t-xl bg-white">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-blue-600" />
            <div>
              <h2 className="text-base font-semibold text-gray-900">Kubernetes Observability</h2>
              <p className="text-xs text-gray-500">{agentName}</p>
            </div>
            {data?.collected_at && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                Updated {new Date(data.collected_at).toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(v => !v)}
              className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                autoRefresh
                  ? 'border-blue-300 text-blue-600 bg-blue-50'
                  : 'border-gray-300 text-gray-500 hover:bg-gray-50'
              }`}
            >
              Auto-refresh
            </button>
            <button onClick={fetchData} disabled={loading}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors disabled:opacity-50"
              title="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div className="flex border-b border-gray-200 px-6 gap-1 bg-white">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
              {t.icon}{t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                  t.key === 'alerts' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
                }`}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto bg-gray-50 rounded-b-xl">

          {/* Loading */}
          {loading && (
            <div className="flex justify-center items-center h-32">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
              <p className="mt-1 text-xs text-red-500">Ensure Prometheus is enabled and reachable from the agent.</p>
            </div>
          )}

          {!loading && !error && data && (
            <div className="p-5 space-y-4">

              {/* ══ OVERVIEW TAB ══════════════════════════════════════════════ */}
              {activeTab === 'overview' && (
                <>
                  {/* Row 1: Gauges + CPU stat + Memory stat */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

                    {/* CPU Gauge */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col items-center justify-center shadow-sm">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">CPU Usage</p>
                      <ArcGauge value={cpuPct} label="of Cluster"
                        sublabel={`${fmtCores(data.namespace_cpu_usage_cores)} / ${fmtCores(data.cluster_cpu_cores_total)} cores`} />
                    </div>

                    {/* Memory Gauge */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col items-center justify-center shadow-sm">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Memory Usage</p>
                      <ArcGauge value={memPct} label="of Cluster"
                        sublabel={`${fmtBytes(data.namespace_memory_usage_bytes)} / ${fmtBytes(data.cluster_memory_bytes_total)}`} />
                    </div>

                    {/* CPU Stat card */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">CPU Breakdown (cores)</p>
                      <StatRow label="Real Usage"    value={fmtCores(data.namespace_cpu_usage_cores)}    color="#22c55e" />
                      <StatRow label="Requests"      value={fmtCores(data.namespace_cpu_requests_cores)} color="#3b82f6" />
                      <StatRow label="Limits"        value={fmtCores(data.namespace_cpu_limits_cores)}   color="#f97316" />
                      <StatRow label="Cluster Total" value={fmtCores(data.cluster_cpu_cores_total)}      color="#9ca3af" />
                      <div className="mt-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">Trend</span>
                          <Sparkline data={histCpu} color="#22c55e" />
                        </div>
                      </div>
                    </div>

                    {/* Memory Stat card */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Memory Breakdown</p>
                      <StatRow label="Real Usage"    value={fmtBytes(data.namespace_memory_usage_bytes)}    color="#22c55e" />
                      <StatRow label="Requests"      value={fmtBytes(data.namespace_memory_requests_bytes)} color="#3b82f6" />
                      <StatRow label="Limits"        value={fmtBytes(data.namespace_memory_limits_bytes)}   color="#f97316" />
                      <StatRow label="Cluster Total" value={fmtBytes(data.cluster_memory_bytes_total)}      color="#9ca3af" />
                      <div className="mt-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">Trend</span>
                          <Sparkline data={histMem} color="#a855f7" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Resource Counts */}
                  <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Kubernetes Resources</p>
                    <div className="flex flex-wrap gap-3">
                      <CountCard label="Pods"         count={rc.pods ?? data.pods.length}         color="#16a34a" bg="#f0fdf4" />
                      <CountCard label="Services"     count={rc.services ?? 0}                    color="#2563eb" bg="#eff6ff" />
                      <CountCard label="Deployments"  count={rc.deployments ?? data.deployments.length} color="#7c3aed" bg="#f5f3ff" />
                      <CountCard label="StatefulSets" count={rc.statefulsets ?? 0}                color="#db2777" bg="#fdf2f8" />
                      <CountCard label="DaemonSets"   count={rc.daemonsets ?? 0}                  color="#ea580c" bg="#fff7ed" />
                      <CountCard label="PVCs"         count={rc.pvcs ?? 0}                        color="#0891b2" bg="#ecfeff" />
                      <CountCard label="ConfigMaps"   count={rc.configmaps ?? 0}                  color="#ca8a04" bg="#fefce8" />
                      <CountCard label="Secrets"      count={rc.secrets ?? 0}                     color="#dc2626" bg="#fef2f2" />
                      <CountCard label="HPAs"         count={rc.hpas ?? 0}                        color="#0284c7" bg="#f0f9ff" />
                      <CountCard label="Alerts"       count={data.firing_alerts.length}           color="#ea580c" bg="#fff7ed" />
                    </div>
                    {histPods.length > 1 && (
                      <div className="mt-3 flex items-center gap-2 pt-3 border-t border-gray-100">
                        <span className="text-xs text-gray-400">Pod count trend:</span>
                        <Sparkline data={histPods} color="#16a34a" />
                      </div>
                    )}
                  </div>

                  {/* Row 3: Top CPU + Top Memory by pod */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    {/* Top CPU by pod */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Top CPU Usage by Pod</p>
                      {topCpuPods.length === 0
                        ? <p className="text-xs text-gray-400">No data</p>
                        : <div className="space-y-2.5">
                          {topCpuPods.map(pod => (
                            <div key={`${pod.namespace}/${pod.pod_name}`}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-700 truncate max-w-[60%]" title={pod.pod_name}>{pod.pod_name}</span>
                                <span className="text-green-600 font-mono font-semibold">{fmtCores(pod.cpu_usage_cores)}</span>
                              </div>
                              <Bar value={pod.cpu_usage_cores} max={maxCpu} color="#22c55e" />
                            </div>
                          ))}
                        </div>
                      }
                    </div>

                    {/* Top Memory by pod */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Top Memory Usage by Pod</p>
                      {topMemPods.length === 0
                        ? <p className="text-xs text-gray-400">No data</p>
                        : <div className="space-y-2.5">
                          {topMemPods.map(pod => (
                            <div key={`${pod.namespace}/${pod.pod_name}`}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-700 truncate max-w-[60%]" title={pod.pod_name}>{pod.pod_name}</span>
                                <span className="text-purple-600 font-mono font-semibold">{pod.memory_usage_mb.toFixed(0)} MB</span>
                              </div>
                              <Bar value={pod.memory_usage_mb} max={maxMem} color="#a855f7" />
                            </div>
                          ))}
                        </div>
                      }
                    </div>
                  </div>
                </>
              )}

              {/* ══ NODES TAB ════════════════════════════════════════════════ */}
              {activeTab === 'nodes' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.nodes.length === 0 && (
                    <p className="text-gray-500 text-sm col-span-3">No node data available.</p>
                  )}
                  {data.nodes.map(node => (
                    <div key={node.node_name} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-semibold text-gray-900 text-sm truncate">{node.node_name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          node.status === 'Ready' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>{node.status || 'Unknown'}</span>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>CPU</span>
                            <span style={{ color: gaugeColor(node.cpu_usage_percent), fontWeight: 600 }}>
                              {node.cpu_usage_percent}%
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${Math.min(node.cpu_usage_percent, 100)}%`, backgroundColor: gaugeColor(node.cpu_usage_percent) }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>Memory</span>
                            <span style={{ color: gaugeColor(node.memory_usage_percent), fontWeight: 600 }}>
                              {node.memory_usage_percent}%
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${Math.min(node.memory_usage_percent, 100)}%`, backgroundColor: gaugeColor(node.memory_usage_percent) }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ══ PODS TAB ═════════════════════════════════════════════════ */}
              {activeTab === 'pods' && (
                <>
                  <div className="flex items-center gap-3 mb-2">
                    <input type="text" placeholder="Filter by namespace..."
                      value={nsFilter} onChange={e => setNsFilter(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg w-64 bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                    <span className="text-xs text-gray-500">{filteredPods.length} pods</span>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          {['Namespace', 'Pod', 'Phase', 'Restarts', 'CPU', 'Memory'].map(h => (
                            <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredPods.length === 0 && (
                          <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No pods found.</td></tr>
                        )}
                        {filteredPods.map(pod => (
                          <tr key={`${pod.namespace}/${pod.pod_name}`} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-500 text-xs">{pod.namespace}</td>
                            <td className="px-4 py-2 text-gray-900 max-w-xs truncate text-xs font-medium" title={pod.pod_name}>{pod.pod_name}</td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${phaseColor(pod.phase)}`}>{pod.phase}</span>
                            </td>
                            <td className="px-4 py-2 text-xs">
                              {pod.restart_count > 0
                                ? <span className="text-red-600 font-semibold">{pod.restart_count}</span>
                                : <span className="text-gray-400">{pod.restart_count}</span>}
                            </td>
                            <td className="px-4 py-2 text-green-600 text-xs font-mono font-semibold">{fmtCores(pod.cpu_usage_cores)}</td>
                            <td className="px-4 py-2 text-purple-600 text-xs font-mono font-semibold">{pod.memory_usage_mb.toFixed(1)} MB</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* ══ DEPLOYMENTS TAB ══════════════════════════════════════════ */}
              {activeTab === 'deployments' && (
                <>
                  <div className="flex items-center gap-3 mb-2">
                    <input type="text" placeholder="Filter by namespace..."
                      value={nsFilter} onChange={e => setNsFilter(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg w-64 bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                    <span className="text-xs text-gray-500">{filteredDeploys.length} deployments</span>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          {['Namespace', 'Deployment', 'Desired', 'Ready', 'Available', 'Status'].map(h => (
                            <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredDeploys.length === 0 && (
                          <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No deployments found.</td></tr>
                        )}
                        {filteredDeploys.map(d => {
                          const healthy = d.ready_replicas >= d.desired_replicas && d.desired_replicas > 0;
                          return (
                            <tr key={`${d.namespace}/${d.deployment_name}`} className="hover:bg-gray-50">
                              <td className="px-4 py-2 text-gray-500 text-xs">{d.namespace}</td>
                              <td className="px-4 py-2 text-gray-900 text-xs font-semibold">{d.deployment_name}</td>
                              <td className="px-4 py-2 text-gray-700 text-xs">{d.desired_replicas}</td>
                              <td className="px-4 py-2 text-gray-700 text-xs">{d.ready_replicas}</td>
                              <td className="px-4 py-2 text-gray-700 text-xs">{d.available_replicas}</td>
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
                </>
              )}

              {/* ══ ALERTS TAB ═══════════════════════════════════════════════ */}
              {activeTab === 'alerts' && (
                <div className="space-y-3">
                  {data.firing_alerts.length === 0 && (
                    <div className="text-center py-14 bg-white border border-gray-200 rounded-lg shadow-sm">
                      <AlertTriangle className="h-12 w-12 text-green-400 mx-auto mb-3" />
                      <p className="text-gray-700 font-semibold">No firing alerts</p>
                      <p className="text-gray-400 text-sm mt-1">All clear — no Prometheus alerts currently firing.</p>
                    </div>
                  )}
                  {data.firing_alerts.map((alert, i) => (
                    <div key={i} className={`p-4 rounded-lg border ${severityBorder(alert.severity)}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${severityBadge(alert.severity)}`}>
                          {(alert.severity || 'INFO').toUpperCase()}
                        </span>
                        <span className="font-semibold text-gray-900 text-sm">{alert.alert_name}</span>
                        {alert.namespace && <span className="text-xs text-gray-500">· {alert.namespace}</span>}
                      </div>
                      {alert.summary && <p className="text-sm text-gray-600 mt-1">{alert.summary}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* No data state */}
          {!loading && !error && !data && (
            <div className="text-center py-16 text-gray-400">
              <Server className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-600 font-medium">No K8s metrics available for this agent.</p>
              <p className="text-sm mt-1 text-gray-400">Enable Prometheus in the agent config to start collecting metrics.</p>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="px-6 py-3 border-t border-gray-200 flex justify-end bg-white rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
