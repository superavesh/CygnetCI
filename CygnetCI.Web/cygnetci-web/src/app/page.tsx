// src/app/page.tsx (Overview Page)

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Server, GitBranch, CheckCircle, Clock, RefreshCw, XCircle, Monitor, AlertTriangle, Settings, X, ShieldCheck } from 'lucide-react';
import { useData } from '@/lib/hooks/useData';
import { useCustomer } from '@/lib/contexts/CustomerContext';
import { StatCard } from '@/components/cards/StatCard';
import { StatusBadge } from '@/components/common/StatusBadge';
import { CONFIG } from '@/lib/config';
import { apiService } from '@/lib/api/apiService';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AlertEntry {
  agent_id: number;
  agent_uuid: string;
  agent_name: string;
  agent_status: string;
  customer_id: number;
  customer_name: string;
  last_seen: string | null;
  alerts: {
    cpu?: { value: number; threshold: number };
    ram?: { value: number; threshold: number };
    disk?: { drive: string; label?: string; percent_used: number; used_gb: number; total_gb: number; threshold: number }[];
    stopped_services?: { name: string; display_name: string }[];
    failed_pods?: { cluster: string; namespace: string; name: string; phase: string; reason: string }[];
  };
}

interface AlertSettings {
  cpu_alert_threshold: number;
  ram_alert_threshold: number;
  disk_alert_threshold: number;
  alert_refresh_interval: number;
}

// ─── Settings Modal ───────────────────────────────────────────────────────────
function AlertSettingsModal({ settings, onSave, onClose }: {
  settings: AlertSettings;
  onSave: (s: AlertSettings) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);

  const field = (label: string, key: keyof AlertSettings, min: number, max: number) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type="number" min={min} max={max} value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: parseInt(e.target.value) || (form[key] as number) }))}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Settings className="h-4 w-4 text-blue-600" /> Alert Thresholds
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          {field('CPU Threshold (%)', 'cpu_alert_threshold', 1, 100)}
          {field('RAM Threshold (%)', 'ram_alert_threshold', 1, 100)}
          {field('Disk Threshold (%)', 'disk_alert_threshold', 1, 100)}
          {field('Auto-refresh Interval (seconds)', 'alert_refresh_interval', 10, 3600)}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm">Cancel</button>
          <button onClick={async () => { setSaving(true); try { await onSave(form); onClose(); } finally { setSaving(false); } }}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sensor types ─────────────────────────────────────────────────────────────
type Severity = 'critical' | 'warning';

interface Sensor {
  severity: Severity;
  type: string;
  label: string;
  value: string;
}

function buildSensors(e: AlertEntry): Sensor[] {
  const rows: Sensor[] = [];
  if (e.alerts.cpu)
    rows.push({ severity: 'critical', type: 'CPU Usage', label: `${e.alerts.cpu.value}% used (threshold ${e.alerts.cpu.threshold}%)`, value: `${e.alerts.cpu.value}%` });
  if (e.alerts.ram)
    rows.push({ severity: 'critical', type: 'RAM Usage', label: `${e.alerts.ram.value}% used (threshold ${e.alerts.ram.threshold}%)`, value: `${e.alerts.ram.value}%` });
  for (const d of e.alerts.disk ?? [])
    rows.push({ severity: 'critical', type: 'Disk Space', label: `${d.drive}${d.label ? ` (${d.label})` : ''} — ${d.percent_used}% used, ${d.used_gb} GB / ${d.total_gb} GB`, value: `${d.percent_used}%` });
  for (const s of e.alerts.stopped_services ?? [])
    rows.push({ severity: 'warning', type: 'Windows Service', label: `${s.display_name || s.name} is Stopped`, value: 'Stopped' });
  for (const p of e.alerts.failed_pods ?? [])
    rows.push({ severity: 'critical', type: 'K8s Pod', label: `${p.namespace}/${p.name} — ${p.phase || p.reason} (${p.cluster})`, value: p.phase || p.reason });
  return rows;
}

// ─── Device node (collapsible) ────────────────────────────────────────────────
function DeviceNode({ entry, onView }: { entry: AlertEntry; onView: () => void }) {
  const [open, setOpen] = useState(false);
  const sensors = buildSensors(entry);
  const criticalCount = sensors.filter(s => s.severity === 'critical').length;
  const warnCount = sensors.filter(s => s.severity === 'warning').length;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Device header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors select-none"
        onClick={() => setOpen(o => !o)}
      >
        {/* Expand arrow */}
        <span className="text-gray-400 text-xs w-3 flex-shrink-0">{open ? '▼' : '▶'}</span>

        {/* Agent online dot */}
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${entry.agent_status === 'online' ? 'bg-green-500' : 'bg-gray-400'}`} />

        {/* Agent name */}
        <Monitor className="h-4 w-4 text-blue-500 flex-shrink-0" />
        <span className="font-semibold text-sm text-gray-800 flex-1 min-w-0 truncate">{entry.agent_name}</span>

        {/* Customer tag */}
        <span className="text-xs text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full hidden sm:inline">{entry.customer_name}</span>

        {/* Alert badges */}
        <div className="flex items-center gap-1.5">
          {criticalCount > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-100 text-red-700">{criticalCount} Critical</span>
          )}
          {warnCount > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">{warnCount} Warning</span>
          )}
        </div>

      </div>

      {/* Sensor rows — only shown when expanded */}
      {open && (
        <div className="divide-y divide-gray-100 border-t border-gray-200">
          {sensors.map((s, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:brightness-95 transition-all ${
                s.severity === 'critical' ? 'bg-red-50' : 'bg-amber-50'
              }`}
              onClick={onView}
            >
              {/* Indent spacer */}
              <span className="w-3 flex-shrink-0" />

              {/* Status pill */}
              <span className={`text-xs font-bold px-2 py-0.5 rounded flex-shrink-0 ${
                s.severity === 'critical' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'
              }`}>
                {s.severity === 'critical' ? 'Critical' : 'Warning'}
              </span>

              {/* Sensor type */}
              <span className="text-xs font-semibold text-gray-500 w-28 flex-shrink-0">{s.type}</span>

              {/* Message */}
              <span className="text-sm text-gray-700 flex-1 min-w-0 truncate" title={s.label}>{s.label}</span>

              {/* Value */}
              <span className={`text-sm font-bold flex-shrink-0 ${
                s.severity === 'critical' ? 'text-red-600' : 'text-amber-600'
              }`}>{s.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── System Alerts Section ────────────────────────────────────────────────────
function SystemAlertsSection() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [settings, setSettings] = useState<AlertSettings>({ cpu_alert_threshold: 80, ram_alert_threshold: 80, disk_alert_threshold: 85, alert_refresh_interval: 30 });
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAlerts = useCallback(async () => {
    try { setAlerts(await apiService.getAlertsSummary()); }
    catch { } finally { setLoading(false); }
  }, []);

  const fetchSettings = useCallback(async () => {
    try { setSettings(await apiService.getAlertSettings()); } catch { }
  }, []);

  const startAutoRefresh = useCallback((interval: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(interval);
    intervalRef.current = setInterval(fetchAlerts, interval * 1000);
    countdownRef.current = setInterval(() => setCountdown(c => c <= 1 ? interval : c - 1), 1000);
  }, [fetchAlerts]);

  useEffect(() => {
    fetchSettings().then(() => fetchAlerts());
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [fetchSettings, fetchAlerts]);

  useEffect(() => { startAutoRefresh(settings.alert_refresh_interval); }, [settings.alert_refresh_interval, startAutoRefresh]);

  const handleSaveSettings = async (s: AlertSettings) => {
    setSettings(await apiService.updateAlertSettings(s));
    fetchAlerts();
  };

  const totalCritical = alerts.reduce((n, e) => n + buildSensors(e).filter(s => s.severity === 'critical').length, 0);
  const totalWarn = alerts.reduce((n, e) => n + buildSensors(e).filter(s => s.severity === 'warning').length, 0);

  return (
    <>
      {showSettings && (
        <AlertSettingsModal settings={settings} onSave={handleSaveSettings} onClose={() => setShowSettings(false)} />
      )}

      <div className="bg-white rounded-xl shadow-lg border border-gray-100">
        {/* Header — matches the other section headers on this page */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <h3 className="text-lg font-semibold text-gray-800">System Alerts</h3>
              {!loading && (
                <div className="flex items-center gap-1.5">
                  {totalCritical > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{totalCritical} Critical</span>}
                  {totalWarn > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{totalWarn} Warning</span>}
                  {totalCritical === 0 && totalWarn === 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">All OK</span>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">Refresh in {countdown}s</span>
              <button onClick={fetchAlerts} className="text-gray-400 hover:text-blue-600 transition-colors" title="Refresh now">
                <RefreshCw className="h-4 w-4" />
              </button>
              <button onClick={() => setShowSettings(true)} className="text-gray-400 hover:text-gray-700 transition-colors" title="Configure thresholds">
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" /> Scanning systems…
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-green-600">
              <ShieldCheck className="h-5 w-5" />
              <span className="font-medium text-sm">All systems operational</span>
            </div>
          ) : (
            <div className="space-y-2">
              {[...alerts].sort((a, b) => {
                const criticalA = buildSensors(a).filter(s => s.severity === 'critical').length;
                const criticalB = buildSensors(b).filter(s => s.severity === 'critical').length;
                if (criticalB !== criticalA) return criticalB - criticalA;
                return buildSensors(b).length - buildSensors(a).length;
              }).map(entry => (
                <DeviceNode
                  key={entry.agent_id}
                  entry={entry}
                  onView={() => router.push(`/monitoring?agentId=${entry.agent_id}&customerId=${entry.customer_id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function OverviewPage() {
  const { selectedCustomer } = useCustomer();
  const { agents, pipelines, stats, refetch } = useData(selectedCustomer?.id);

  return (
    <div className="space-y-8">
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

      {/* System Alerts */}
      <SystemAlertsSection />
    </div>
  );
}