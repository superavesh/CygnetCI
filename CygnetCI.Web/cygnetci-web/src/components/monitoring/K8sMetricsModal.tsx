'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X, RefreshCw, Box, Server, AlertTriangle, LayoutGrid, Activity,
  Network, Clock, Cpu, Database, HardDrive, Zap, CheckCircle2
} from 'lucide-react';
import { CONFIG } from '@/lib/config';

// ─── Types ────────────────────────────────────────────────────────────────────

interface K8sNodeMetric {
  node_name: string; cpu_usage_percent: number; memory_usage_percent: number; status: string;
}
interface K8sPodMetric {
  pod_name: string; namespace: string; phase: string;
  restart_count: number; cpu_usage_cores: number; memory_usage_mb: number;
}
interface K8sDeploymentMetric {
  deployment_name: string; namespace: string;
  desired_replicas: number; ready_replicas: number; available_replicas: number;
}
interface K8sAlert {
  alert_name: string; severity: string; namespace: string; summary: string;
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
  pod_phase_running: number;
  pod_phase_pending: number;
  pod_phase_failed: number;
  pod_phase_succeeded: number;
  pod_phase_unknown: number;
  containers_running: number;
  containers_waiting: number;
  containers_terminated: number;
  container_restarts_last30m: number;
  network_receive_bytes_per_sec: number;
  network_transmit_bytes_per_sec: number;
  disk_read_bytes_per_sec: number;
  disk_write_bytes_per_sec: number;
  jobs_succeeded: number;
  jobs_active: number;
  jobs_failed: number;
  nodes_total: number;
  nodes_unschedulable: number;
  _historical_note?: string;
}
interface HistoryPoint {
  collected_at: string;
  namespace_cpu_usage_cores: number;
  namespace_memory_usage_bytes: number;
  pod_count: number;
  alert_count: number;
}
interface Props {
  isOpen: boolean; onClose: () => void; agentUuid: string; agentName: string;
}
type Tab = 'overview' | 'cluster' | 'nodes' | 'pods' | 'deployments' | 'network' | 'alerts';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtBytes = (b: number): string => {
  if (!b) return '0 B';
  if (b >= 1e12) return (b / 1e12).toFixed(2) + ' TB';
  if (b >= 1e9)  return (b / 1e9).toFixed(2)  + ' GB';
  if (b >= 1e6)  return (b / 1e6).toFixed(1)  + ' MB';
  return (b / 1e3).toFixed(0) + ' KB';
};
const fmtBps = (b: number): string => fmtBytes(b) + '/s';
const fmtCores = (c: number): string => {
  if (!c) return '0';
  return c >= 1 ? c.toFixed(2) : (c * 1000).toFixed(0) + 'm';
};
const gaugeColor = (pct: number) =>
  pct >= 70 ? '#ef4444' : pct >= 50 ? '#f97316' : '#22c55e';

// ─── SVG Arc Gauge ────────────────────────────────────────────────────────────

const ArcGauge = ({ value, label, sublabel }: { value: number; label: string; sublabel?: string }) => {
  const R = 36, cx = 50, cy = 52;
  const circ = 2 * Math.PI * R;
  const track = circ * 0.75;
  const filled = track * Math.min(Math.max(value, 0), 100) / 100;
  const color = gaugeColor(value);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 72" className="w-32 h-24">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#e5e7eb" strokeWidth="7"
          strokeDasharray={`${track} ${circ}`} strokeLinecap="round"
          transform={`rotate(135 ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
          transform={`rotate(135 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        <text x={cx} y={cy - 3} textAnchor="middle" fill="#111827" fontSize="14" fontWeight="bold">
          {value.toFixed(1)}%
        </text>
        <text x={cx} y={cy + 11} textAnchor="middle" fill="#6b7280" fontSize="7">
          of cluster
        </text>
      </svg>
      <p className="text-xs font-semibold text-gray-700 text-center -mt-1">{label}</p>
      {sublabel && <p className="text-xs text-gray-400 text-center mt-0.5">{sublabel}</p>}
    </div>
  );
};

// ─── Sparkline ────────────────────────────────────────────────────────────────

const Sparkline = ({ data, color = '#3b82f6' }: { data: number[]; color?: string }) => {
  if (data.length < 2) return <span className="text-gray-300 text-xs">—</span>;
  const max = Math.max(...data) || 1;
  const w = 90, h = 22;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 2) - 1}`).join(' ');
  return (
    <svg width={w} height={h} className="inline-block">
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={color} fillOpacity="0.12" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
};

// ─── Horizontal Bar ───────────────────────────────────────────────────────────

const Bar = ({ value, max, color = '#3b82f6' }: { value: number; max: number; color?: string }) => {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
};

// ─── Stat Card ────────────────────────────────────────────────────────────────

const StatCard = ({
  label, value, color = '#3b82f6', bg = '#eff6ff', icon
}: { label: string; value: string | number; color?: string; bg?: string; icon?: React.ReactNode }) => (
  <div className="border border-gray-200 rounded-lg px-3 py-2.5 flex flex-col gap-1" style={{ backgroundColor: bg }}>
    <div className="flex items-center gap-1.5">
      {icon && <span style={{ color }}>{icon}</span>}
      <span className="text-xs text-gray-500">{label}</span>
    </div>
    <div className="text-lg font-bold" style={{ color }}>{value}</div>
  </div>
);

// ─── Phase Badge ──────────────────────────────────────────────────────────────

const PhaseBadge = ({ label, count, color, bg }: { label: string; count: number; color: string; bg: string }) => (
  <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200" style={{ backgroundColor: bg }}>
    <span className="text-xs font-medium" style={{ color }}>{label}</span>
    <span className="text-sm font-bold" style={{ color }}>{count}</span>
  </div>
);

// ─── Section Header ───────────────────────────────────────────────────────────

const SectionHeader = ({ title }: { title: string }) => (
  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</p>
);

// ─── Main Modal ───────────────────────────────────────────────────────────────

export const K8sMetricsModal: React.FC<Props> = ({ isOpen, onClose, agentUuid, agentName }) => {
  const [data, setData]         = useState<K8sSnapshot | null>(null);
  const [history, setHistory]   = useState<HistoryPoint[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [nsFilter, setNsFilter] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Datetime filter state
  const [historyAt, setHistoryAt]       = useState('');   // ISO local value from <input type="datetime-local">
  const [isHistorical, setIsHistorical] = useState(false);

  const fetchData = useCallback(async (atTime?: string) => {
    try {
      setLoading(true);
      setError(null);
      const atParam = atTime ? `?at=${encodeURIComponent(new Date(atTime).toISOString())}` : '';
      const [snap, hist] = await Promise.all([
        fetch(`${CONFIG.api.baseUrl}/agents/${agentUuid}/k8s-metrics${atParam}`, { headers: CONFIG.api.headers }),
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

  // Auto-refresh only in live mode
  useEffect(() => {
    if (!isOpen || !autoRefresh || isHistorical) return;
    const id = setInterval(() => fetchData(), 60000);
    return () => clearInterval(id);
  }, [isOpen, autoRefresh, isHistorical, fetchData]);

  if (!isOpen) return null;

  const handleApplyHistorical = () => {
    if (!historyAt) return;
    setIsHistorical(true);
    fetchData(historyAt);
  };

  const handleLiveMode = () => {
    setIsHistorical(false);
    setHistoryAt('');
    fetchData();
  };

  // Derived
  const cpuPct = data && data.cluster_cpu_cores_total > 0
    ? (data.namespace_cpu_usage_cores / data.cluster_cpu_cores_total) * 100 : 0;
  const memPct = data && data.cluster_memory_bytes_total > 0
    ? (data.namespace_memory_usage_bytes / data.cluster_memory_bytes_total) * 100 : 0;

  const filteredPods    = (data?.pods ?? []).filter(p => !nsFilter || p.namespace.includes(nsFilter));
  const filteredDeploys = (data?.deployments ?? []).filter(d => !nsFilter || d.namespace.includes(nsFilter));
  const topCpuPods = [...(data?.pods ?? [])].sort((a, b) => b.cpu_usage_cores - a.cpu_usage_cores).slice(0, 10);
  const topMemPods = [...(data?.pods ?? [])].sort((a, b) => b.memory_usage_mb - a.memory_usage_mb).slice(0, 10);
  const maxCpu = topCpuPods[0]?.cpu_usage_cores || 1;
  const maxMem = topMemPods[0]?.memory_usage_mb || 1;

  const histCpu  = history.map(h => h.namespace_cpu_usage_cores);
  const histMem  = history.map(h => h.namespace_memory_usage_bytes / 1e9);
  const histPods = history.map(h => h.pod_count);
  const rc = data?.resource_counts ?? {};

  const tabs: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'overview',     label: 'Overview',     icon: <Activity className="h-3.5 w-3.5" /> },
    { key: 'cluster',      label: 'Cluster',      icon: <Cpu className="h-3.5 w-3.5" /> },
    { key: 'nodes',        label: 'Nodes',        icon: <Server className="h-3.5 w-3.5" />,        badge: data?.nodes.length },
    { key: 'pods',         label: 'Pods',         icon: <Box className="h-3.5 w-3.5" />,           badge: data?.pods.length },
    { key: 'deployments',  label: 'Deployments',  icon: <LayoutGrid className="h-3.5 w-3.5" />,    badge: data?.deployments.length },
    { key: 'network',      label: 'Network',      icon: <Network className="h-3.5 w-3.5" /> },
    { key: 'alerts',       label: 'Alerts',       icon: <AlertTriangle className="h-3.5 w-3.5" />, badge: data?.firing_alerts.length },
  ];

  const phaseColor = (phase: string) =>
    phase === 'Running'   ? 'bg-green-100 text-green-700' :
    phase === 'Pending'   ? 'bg-yellow-100 text-yellow-700' :
    phase === 'Succeeded' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700';

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
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 rounded-t-xl bg-white gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Activity className="h-5 w-5 text-blue-600 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-gray-900 leading-tight">Kubernetes Observability</h2>
              <p className="text-xs text-gray-500 truncate">{agentName}</p>
            </div>
          </div>

          {/* ── Datetime Filter ──────────────────────────────────────────── */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              <input
                type="datetime-local"
                value={historyAt}
                onChange={e => setHistoryAt(e.target.value)}
                className="text-xs text-gray-700 bg-transparent outline-none w-40"
              />
              <button
                onClick={handleApplyHistorical}
                disabled={!historyAt}
                className="text-xs px-2 py-0.5 bg-blue-500 text-white rounded font-medium disabled:opacity-40 hover:bg-blue-600 transition-colors"
              >
                View
              </button>
            </div>
            {isHistorical && (
              <button
                onClick={handleLiveMode}
                className="text-xs px-2 py-1 bg-green-50 border border-green-300 text-green-700 rounded-lg font-medium hover:bg-green-100 transition-colors flex items-center gap-1"
              >
                <Zap className="h-3 w-3" /> Live
              </button>
            )}
            {isHistorical && data?.collected_at && (
              <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                Snapshot: {new Date(data.collected_at).toLocaleString()}
              </span>
            )}
            {!isHistorical && data?.collected_at && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {new Date(data.collected_at).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => setAutoRefresh(v => !v)}
              className={`text-xs px-2 py-1 rounded-full border font-medium transition-colors ${
                autoRefresh && !isHistorical ? 'border-blue-300 text-blue-600 bg-blue-50' : 'border-gray-300 text-gray-400'
              }`}
            >Auto</button>
            <button onClick={() => fetchData(isHistorical ? historyAt : undefined)} disabled={loading}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors disabled:opacity-50" title="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div className="flex border-b border-gray-200 px-5 gap-0.5 bg-white overflow-x-auto">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
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

          {loading && (
            <div className="flex justify-center items-center h-32">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          )}
          {error && (
            <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
              <p className="mt-1 text-xs text-red-500">Ensure Prometheus is enabled and reachable from the agent.</p>
            </div>
          )}

          {!loading && !error && data && (
            <div className="p-4 space-y-4">

              {/* Historical note banner */}
              {data._historical_note && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs">
                  {data._historical_note}
                </div>
              )}

              {/* ══ OVERVIEW TAB ══════════════════════════════════════════════ */}
              {activeTab === 'overview' && (
                <>
                  {/* Row 1: CPU + Memory gauges + stat cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col items-center shadow-sm">
                      <SectionHeader title="CPU Usage" />
                      <ArcGauge value={cpuPct} label="of Cluster"
                        sublabel={`${fmtCores(data.namespace_cpu_usage_cores)} / ${fmtCores(data.cluster_cpu_cores_total)}`} />
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col items-center shadow-sm">
                      <SectionHeader title="Memory Usage" />
                      <ArcGauge value={memPct} label="of Cluster"
                        sublabel={`${fmtBytes(data.namespace_memory_usage_bytes)} / ${fmtBytes(data.cluster_memory_bytes_total)}`} />
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                      <SectionHeader title="CPU Breakdown" />
                      <div className="space-y-1">
                        {[
                          { label: 'Real', value: fmtCores(data.namespace_cpu_usage_cores), color: '#16a34a' },
                          { label: 'Requests', value: fmtCores(data.namespace_cpu_requests_cores), color: '#2563eb' },
                          { label: 'Limits', value: fmtCores(data.namespace_cpu_limits_cores), color: '#ea580c' },
                          { label: 'Total', value: fmtCores(data.cluster_cpu_cores_total), color: '#9ca3af' },
                        ].map(r => (
                          <div key={r.label} className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">{r.label}</span>
                            <span className="font-mono font-semibold" style={{ color: r.color }}>{r.value}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-gray-400">Trend</span>
                        <Sparkline data={histCpu} color="#16a34a" />
                      </div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                      <SectionHeader title="Memory Breakdown" />
                      <div className="space-y-1">
                        {[
                          { label: 'Real', value: fmtBytes(data.namespace_memory_usage_bytes), color: '#16a34a' },
                          { label: 'Requests', value: fmtBytes(data.namespace_memory_requests_bytes), color: '#2563eb' },
                          { label: 'Limits', value: fmtBytes(data.namespace_memory_limits_bytes), color: '#ea580c' },
                          { label: 'Total', value: fmtBytes(data.cluster_memory_bytes_total), color: '#9ca3af' },
                        ].map(r => (
                          <div key={r.label} className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">{r.label}</span>
                            <span className="font-mono font-semibold" style={{ color: r.color }}>{r.value}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-gray-400">Trend</span>
                        <Sparkline data={histMem} color="#a855f7" />
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Resource counts */}
                  <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <SectionHeader title="Kubernetes Resources" />
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'Pods', count: rc.pods ?? data.pods.length, color: '#16a34a', bg: '#f0fdf4' },
                        { label: 'Services', count: rc.services ?? 0, color: '#2563eb', bg: '#eff6ff' },
                        { label: 'Deployments', count: rc.deployments ?? data.deployments.length, color: '#7c3aed', bg: '#f5f3ff' },
                        { label: 'StatefulSets', count: rc.statefulsets ?? 0, color: '#db2777', bg: '#fdf2f8' },
                        { label: 'DaemonSets', count: rc.daemonsets ?? 0, color: '#ea580c', bg: '#fff7ed' },
                        { label: 'PVCs', count: rc.pvcs ?? 0, color: '#0891b2', bg: '#ecfeff' },
                        { label: 'ConfigMaps', count: rc.configmaps ?? 0, color: '#ca8a04', bg: '#fefce8' },
                        { label: 'Secrets', count: rc.secrets ?? 0, color: '#dc2626', bg: '#fef2f2' },
                        { label: 'HPAs', count: rc.hpas ?? 0, color: '#0284c7', bg: '#f0f9ff' },
                        { label: 'Nodes', count: data.nodes_total || data.nodes.length, color: '#0f766e', bg: '#f0fdfa' },
                        { label: 'Alerts', count: data.firing_alerts.length, color: '#c2410c', bg: '#fff7ed' },
                      ].map(c => (
                        <div key={c.label} className="border border-gray-200 rounded-lg px-3 py-2 text-center min-w-[68px]" style={{ backgroundColor: c.bg }}>
                          <div className="text-lg font-bold" style={{ color: c.color }}>{c.count}</div>
                          <div className="text-xs text-gray-500 capitalize">{c.label}</div>
                        </div>
                      ))}
                    </div>
                    {histPods.length > 1 && (
                      <div className="mt-3 pt-2 border-t border-gray-100 flex items-center gap-2">
                        <span className="text-xs text-gray-400">Pod trend:</span>
                        <Sparkline data={histPods} color="#16a34a" />
                      </div>
                    )}
                  </div>

                  {/* Row 3: Top pods */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <SectionHeader title="Top CPU Usage by Pod" />
                      {topCpuPods.length === 0
                        ? <p className="text-xs text-gray-400">No data</p>
                        : <div className="space-y-2">{topCpuPods.map(pod => (
                          <div key={`${pod.namespace}/${pod.pod_name}`}>
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="text-gray-700 truncate max-w-[60%]" title={pod.pod_name}>{pod.pod_name}</span>
                              <span className="text-green-600 font-mono font-semibold">{fmtCores(pod.cpu_usage_cores)}</span>
                            </div>
                            <Bar value={pod.cpu_usage_cores} max={maxCpu} color="#22c55e" />
                          </div>
                        ))}</div>
                      }
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <SectionHeader title="Top Memory Usage by Pod" />
                      {topMemPods.length === 0
                        ? <p className="text-xs text-gray-400">No data</p>
                        : <div className="space-y-2">{topMemPods.map(pod => (
                          <div key={`${pod.namespace}/${pod.pod_name}`}>
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="text-gray-700 truncate max-w-[60%]" title={pod.pod_name}>{pod.pod_name}</span>
                              <span className="text-purple-600 font-mono font-semibold">{pod.memory_usage_mb.toFixed(0)} MB</span>
                            </div>
                            <Bar value={pod.memory_usage_mb} max={maxMem} color="#a855f7" />
                          </div>
                        ))}</div>
                      }
                    </div>
                  </div>
                </>
              )}

              {/* ══ CLUSTER TAB ═══════════════════════════════════════════════ */}
              {activeTab === 'cluster' && (
                <>
                  {/* Pod Phases */}
                  <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <SectionHeader title="Pod Phases" />
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <PhaseBadge label="Running"   count={data.pod_phase_running}   color="#16a34a" bg="#f0fdf4" />
                      <PhaseBadge label="Pending"   count={data.pod_phase_pending}   color="#ca8a04" bg="#fefce8" />
                      <PhaseBadge label="Succeeded" count={data.pod_phase_succeeded} color="#2563eb" bg="#eff6ff" />
                      <PhaseBadge label="Failed"    count={data.pod_phase_failed}    color="#dc2626" bg="#fef2f2" />
                      <PhaseBadge label="Unknown"   count={data.pod_phase_unknown}   color="#6b7280" bg="#f9fafb" />
                    </div>
                  </div>

                  {/* Container Status + Jobs + Nodes */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

                    {/* Container Status */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <SectionHeader title="Container Status" />
                      <div className="space-y-2">
                        <StatCard label="Running"    value={data.containers_running}    color="#16a34a" bg="#f0fdf4" icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
                        <StatCard label="Waiting"    value={data.containers_waiting}    color="#ca8a04" bg="#fefce8" />
                        <StatCard label="Terminated" value={data.containers_terminated} color="#6b7280" bg="#f9fafb" />
                        <StatCard label="Restarts (30m)" value={data.container_restarts_last30m} color={data.container_restarts_last30m > 0 ? '#dc2626' : '#16a34a'} bg={data.container_restarts_last30m > 0 ? '#fef2f2' : '#f0fdf4'} />
                      </div>
                    </div>

                    {/* Jobs */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <SectionHeader title="Jobs" />
                      <div className="space-y-2">
                        <StatCard label="Succeeded" value={data.jobs_succeeded} color="#16a34a" bg="#f0fdf4" icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
                        <StatCard label="Active"    value={data.jobs_active}    color="#2563eb" bg="#eff6ff" />
                        <StatCard label="Failed"    value={data.jobs_failed}    color={data.jobs_failed > 0 ? '#dc2626' : '#6b7280'} bg={data.jobs_failed > 0 ? '#fef2f2' : '#f9fafb'} />
                      </div>
                    </div>

                    {/* Nodes */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <SectionHeader title="Nodes" />
                      <div className="space-y-2">
                        <StatCard label="Total Nodes"        value={data.nodes_total || data.nodes.length} color="#0f766e" bg="#f0fdfa" icon={<Server className="h-3.5 w-3.5" />} />
                        <StatCard label="Unschedulable"      value={data.nodes_unschedulable}              color={data.nodes_unschedulable > 0 ? '#dc2626' : '#16a34a'} bg={data.nodes_unschedulable > 0 ? '#fef2f2' : '#f0fdf4'} />
                        <StatCard label="Ready"              value={data.nodes.filter(n => n.status === 'Ready').length} color="#16a34a" bg="#f0fdf4" />
                        <StatCard label="Not Ready"          value={data.nodes.filter(n => n.status !== 'Ready').length} color={data.nodes.filter(n => n.status !== 'Ready').length > 0 ? '#dc2626' : '#16a34a'} bg="#f9fafb" />
                      </div>
                    </div>
                  </div>

                  {/* Deployment Replica Summary */}
                  <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <SectionHeader title="Deployment Replica Summary" />
                    <div className="grid grid-cols-3 gap-3">
                      <StatCard label="Total Replicas"     value={data.deployments.reduce((s, d) => s + d.desired_replicas, 0)}   color="#2563eb" bg="#eff6ff" />
                      <StatCard label="Ready Replicas"     value={data.deployments.reduce((s, d) => s + d.ready_replicas, 0)}     color="#16a34a" bg="#f0fdf4" />
                      <StatCard label="Unavailable"        value={data.deployments.reduce((s, d) => s + Math.max(0, d.desired_replicas - d.ready_replicas), 0)} color="#dc2626" bg="#fef2f2" />
                    </div>
                    {data.deployments.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {data.deployments.map(d => {
                            const healthy = d.ready_replicas >= d.desired_replicas && d.desired_replicas > 0;
                            return (
                              <div key={`${d.namespace}/${d.deployment_name}`} className="flex items-center gap-2 text-xs">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${healthy ? 'bg-green-500' : 'bg-red-500'}`} />
                                <span className="text-gray-500 w-32 truncate shrink-0">{d.namespace}</span>
                                <span className="text-gray-800 font-medium truncate">{d.deployment_name}</span>
                                <span className="ml-auto text-gray-400 shrink-0">{d.ready_replicas}/{d.desired_replicas}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ══ NODES TAB ════════════════════════════════════════════════ */}
              {activeTab === 'nodes' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {data.nodes.length === 0 && <p className="text-gray-500 text-sm col-span-3">No node data available.</p>}
                  {data.nodes.map(node => (
                    <div key={node.node_name} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-semibold text-gray-900 text-sm truncate">{node.node_name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${node.status === 'Ready' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {node.status || 'Unknown'}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {[
                          { label: 'CPU', pct: node.cpu_usage_percent },
                          { label: 'Memory', pct: node.memory_usage_percent },
                        ].map(r => (
                          <div key={r.label}>
                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                              <span>{r.label}</span>
                              <span style={{ color: gaugeColor(r.pct), fontWeight: 600 }}>{r.pct}%</span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                              <div className="h-full rounded-full transition-all"
                                style={{ width: `${Math.min(r.pct, 100)}%`, backgroundColor: gaugeColor(r.pct) }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ══ PODS TAB ═════════════════════════════════════════════════ */}
              {activeTab === 'pods' && (
                <>
                  {/* Phase breakdown strip */}
                  <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'Running', count: data.pod_phase_running, color: '#16a34a', bg: '#f0fdf4' },
                        { label: 'Pending', count: data.pod_phase_pending, color: '#ca8a04', bg: '#fefce8' },
                        { label: 'Succeeded', count: data.pod_phase_succeeded, color: '#2563eb', bg: '#eff6ff' },
                        { label: 'Failed', count: data.pod_phase_failed, color: '#dc2626', bg: '#fef2f2' },
                        { label: 'Unknown', count: data.pod_phase_unknown, color: '#6b7280', bg: '#f9fafb' },
                      ].map(p => (
                        <div key={p.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200" style={{ backgroundColor: p.bg, color: p.color }}>
                          {p.label} <span className="font-bold">{p.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <input type="text" placeholder="Filter by namespace..."
                      value={nsFilter} onChange={e => setNsFilter(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg w-64 bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                    <span className="text-xs text-gray-500">{filteredPods.length} pods</span>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>{['Namespace', 'Pod', 'Phase', 'Restarts', 'CPU', 'Memory'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredPods.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No pods found.</td></tr>}
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
                  {/* Deployment stats strip */}
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard label="Total Desired"  value={data.deployments.reduce((s, d) => s + d.desired_replicas, 0)}   color="#2563eb" bg="#eff6ff" />
                    <StatCard label="Ready"          value={data.deployments.reduce((s, d) => s + d.ready_replicas, 0)}     color="#16a34a" bg="#f0fdf4" />
                    <StatCard label="Unavailable"    value={data.deployments.reduce((s, d) => s + Math.max(0, d.desired_replicas - d.ready_replicas), 0)} color="#dc2626" bg="#fef2f2" />
                  </div>

                  <div className="flex items-center gap-3">
                    <input type="text" placeholder="Filter by namespace..."
                      value={nsFilter} onChange={e => setNsFilter(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg w-64 bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                    <span className="text-xs text-gray-500">{filteredDeploys.length} deployments</span>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>{['Namespace', 'Deployment', 'Desired', 'Ready', 'Available', 'Status'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredDeploys.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No deployments found.</td></tr>}
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
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${healthy ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {healthy ? 'Healthy' : 'Degraded'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Jobs section */}
                  <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <SectionHeader title="Jobs" />
                    <div className="grid grid-cols-3 gap-3">
                      <StatCard label="Succeeded" value={data.jobs_succeeded} color="#16a34a" bg="#f0fdf4" />
                      <StatCard label="Active"    value={data.jobs_active}    color="#2563eb" bg="#eff6ff" />
                      <StatCard label="Failed"    value={data.jobs_failed}    color={data.jobs_failed > 0 ? '#dc2626' : '#6b7280'} bg={data.jobs_failed > 0 ? '#fef2f2' : '#f9fafb'} />
                    </div>
                  </div>
                </>
              )}

              {/* ══ NETWORK TAB ══════════════════════════════════════════════ */}
              {activeTab === 'network' && (
                <>
                  {/* Network I/O */}
                  <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <SectionHeader title="Network I/O (current)" />
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-blue-500" />
                            <span className="text-sm font-medium text-gray-700">Receive</span>
                          </div>
                          <span className="text-lg font-bold text-blue-600">{fmtBps(data.network_receive_bytes_per_sec)}</span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                          <div className="h-full bg-blue-500 rounded-full" style={{
                            width: `${Math.min(100, (data.network_receive_bytes_per_sec / Math.max(data.network_receive_bytes_per_sec, data.network_transmit_bytes_per_sec, 1)) * 100)}%`
                          }} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-purple-500" />
                            <span className="text-sm font-medium text-gray-700">Transmit</span>
                          </div>
                          <span className="text-lg font-bold text-purple-600">{fmtBps(data.network_transmit_bytes_per_sec)}</span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                          <div className="h-full bg-purple-500 rounded-full" style={{
                            width: `${Math.min(100, (data.network_transmit_bytes_per_sec / Math.max(data.network_receive_bytes_per_sec, data.network_transmit_bytes_per_sec, 1)) * 100)}%`
                          }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Disk I/O */}
                  <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <SectionHeader title="Disk I/O (current)" />
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <HardDrive className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-medium text-gray-700">Read</span>
                          </div>
                          <span className="text-lg font-bold text-green-600">{fmtBps(data.disk_read_bytes_per_sec)}</span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                          <div className="h-full bg-green-500 rounded-full" style={{
                            width: `${Math.min(100, (data.disk_read_bytes_per_sec / Math.max(data.disk_read_bytes_per_sec, data.disk_write_bytes_per_sec, 1)) * 100)}%`
                          }} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <HardDrive className="h-4 w-4 text-orange-600" />
                            <span className="text-sm font-medium text-gray-700">Write</span>
                          </div>
                          <span className="text-lg font-bold text-orange-600">{fmtBps(data.disk_write_bytes_per_sec)}</span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                          <div className="h-full bg-orange-500 rounded-full" style={{
                            width: `${Math.min(100, (data.disk_write_bytes_per_sec / Math.max(data.disk_read_bytes_per_sec, data.disk_write_bytes_per_sec, 1)) * 100)}%`
                          }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Combined stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard label="Net Rx"    value={fmtBps(data.network_receive_bytes_per_sec)}  color="#2563eb" bg="#eff6ff" icon={<Network className="h-3.5 w-3.5" />} />
                    <StatCard label="Net Tx"    value={fmtBps(data.network_transmit_bytes_per_sec)} color="#7c3aed" bg="#f5f3ff" icon={<Network className="h-3.5 w-3.5" />} />
                    <StatCard label="Disk Read" value={fmtBps(data.disk_read_bytes_per_sec)}        color="#16a34a" bg="#f0fdf4" icon={<Database className="h-3.5 w-3.5" />} />
                    <StatCard label="Disk Write" value={fmtBps(data.disk_write_bytes_per_sec)}      color="#ea580c" bg="#fff7ed" icon={<Database className="h-3.5 w-3.5" />} />
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                    Network and disk I/O values are 5-minute rate averages collected from Prometheus (cAdvisor + node-exporter).
                  </div>
                </>
              )}

              {/* ══ ALERTS TAB ═══════════════════════════════════════════════ */}
              {activeTab === 'alerts' && (
                <div className="space-y-3">
                  {data.firing_alerts.length === 0 && (
                    <div className="text-center py-14 bg-white border border-gray-200 rounded-lg shadow-sm">
                      <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-3" />
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

          {!loading && !error && !data && (
            <div className="text-center py-16 text-gray-400">
              <Server className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-600 font-medium">No K8s metrics available for this agent.</p>
              <p className="text-sm mt-1 text-gray-400">Enable Prometheus in the agent config to start collecting metrics.</p>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between bg-white rounded-b-xl">
          <p className="text-xs text-gray-400">
            History stored: {history.length} snapshots · Datetime filter searches up to 120 snapshots
          </p>
          <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
