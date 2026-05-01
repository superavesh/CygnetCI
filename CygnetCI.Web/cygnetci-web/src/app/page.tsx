// src/app/page.tsx (Overview Page)

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Server, GitBranch, CheckCircle, Clock, RefreshCw, XCircle, Monitor, AlertTriangle, Settings, X, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
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
    stopped_services?: { name: string; display_name: string }[];
    failed_pods?: { cluster: string; namespace: string; name: string; phase: string; reason: string }[];
  };
}

interface AlertSettings {
  cpu_alert_threshold: number;
  ram_alert_threshold: number;
  alert_refresh_interval: number;
}

// ─── Settings Modal ───────────────────────────────────────────────────────────
function AlertSettingsModal({
  settings,
  onSave,
  onClose,
}: {
  settings: AlertSettings;
  onSave: (s: AlertSettings) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Settings className="h-5 w-5 text-gray-600" /> Alert Settings
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CPU Alert Threshold (%)</label>
            <input type="number" min={1} max={100} value={form.cpu_alert_threshold}
              onChange={e => setForm(f => ({ ...f, cpu_alert_threshold: parseInt(e.target.value) || 80 }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">RAM Alert Threshold (%)</label>
            <input type="number" min={1} max={100} value={form.ram_alert_threshold}
              onChange={e => setForm(f => ({ ...f, ram_alert_threshold: parseInt(e.target.value) || 80 }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Refresh Interval (seconds)</label>
            <input type="number" min={10} max={3600} value={form.alert_refresh_interval}
              onChange={e => setForm(f => ({ ...f, alert_refresh_interval: parseInt(e.target.value) || 30 }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Alert Row ────────────────────────────────────────────────────────────────
function AlertRow({ entry, onClick }: { entry: AlertEntry; onClick: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { alerts } = entry;

  const totalCount =
    (alerts.cpu ? 1 : 0) +
    (alerts.ram ? 1 : 0) +
    (alerts.stopped_services?.length ?? 0) +
    (alerts.failed_pods?.length ?? 0);

  return (
    <div className="border border-red-100 rounded-lg bg-red-50/40 overflow-hidden">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-red-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900">{entry.agent_name}</span>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{entry.customer_name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                entry.agent_status === 'online' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>{entry.agent_status}</span>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {alerts.cpu && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                  CPU {alerts.cpu.value}% &gt; {alerts.cpu.threshold}%
                </span>
              )}
              {alerts.ram && (
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                  RAM {alerts.ram.value}% &gt; {alerts.ram.threshold}%
                </span>
              )}
              {(alerts.stopped_services?.length ?? 0) > 0 && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  {alerts.stopped_services!.length} service{alerts.stopped_services!.length > 1 ? 's' : ''} stopped
                </span>
              )}
              {(alerts.failed_pods?.length ?? 0) > 0 && (
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                  {alerts.failed_pods!.length} pod{alerts.failed_pods!.length > 1 ? 's' : ''} failed/evicted
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          <button
            onClick={e => { e.stopPropagation(); onClick(); }}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            View
          </button>
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-red-100 px-4 py-3 bg-white space-y-3">
          {alerts.stopped_services && alerts.stopped_services.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Stopped Services</p>
              <div className="flex flex-wrap gap-1.5">
                {alerts.stopped_services.map(s => (
                  <span key={s.name} className="text-xs bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1 rounded" title={s.name}>
                    {s.display_name || s.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {alerts.failed_pods && alerts.failed_pods.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Failed / Evicted Pods</p>
              <div className="flex flex-wrap gap-1.5">
                {alerts.failed_pods.map((p, i) => (
                  <span key={i} className="text-xs bg-purple-50 border border-purple-200 text-purple-800 px-2 py-1 rounded">
                    {p.namespace}/{p.name} <span className="opacity-70">({p.cluster})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── System Alerts Section ────────────────────────────────────────────────────
function SystemAlertsSection() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [settings, setSettings] = useState<AlertSettings>({ cpu_alert_threshold: 80, ram_alert_threshold: 80, alert_refresh_interval: 30 });
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const data = await apiService.getAlertsSummary();
      setAlerts(data);
      setLastRefreshed(new Date());
    } catch { } finally { setLoading(false); }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const s = await apiService.getAlertSettings();
      setSettings(s);
    } catch { }
  }, []);

  const startAutoRefresh = useCallback((interval: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(interval);
    intervalRef.current = setInterval(fetchAlerts, interval * 1000);
    countdownRef.current = setInterval(() => {
      setCountdown(c => c <= 1 ? interval : c - 1);
    }, 1000);
  }, [fetchAlerts]);

  useEffect(() => {
    fetchSettings().then(() => fetchAlerts());
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [fetchSettings, fetchAlerts]);

  useEffect(() => {
    startAutoRefresh(settings.alert_refresh_interval);
  }, [settings.alert_refresh_interval, startAutoRefresh]);

  const handleSaveSettings = async (s: AlertSettings) => {
    const updated = await apiService.updateAlertSettings(s);
    setSettings(updated);
    fetchAlerts();
  };

  const handleViewAgent = (entry: AlertEntry) => {
    router.push(`/monitoring?agentId=${entry.agent_id}`);
  };

  return (
    <>
      {showSettings && (
        <AlertSettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      <div className="bg-white rounded-xl shadow-lg border border-gray-100">
        {/* Section Header */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <h3 className="text-lg font-semibold text-gray-800">System Alerts</h3>
              {alerts.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                  {alerts.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {lastRefreshed && (
                <span className="text-xs text-gray-400">
                  Next in {countdown}s
                </span>
              )}
              <button
                onClick={fetchAlerts}
                className="text-gray-400 hover:text-blue-600 transition-colors"
                title="Refresh now"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Alert settings"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Checking systems…
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex items-center justify-center gap-3 py-8 text-green-600">
              <ShieldCheck className="h-6 w-6" />
              <span className="font-medium">All systems healthy</span>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map(entry => (
                <AlertRow
                  key={entry.agent_id}
                  entry={entry}
                  onClick={() => handleViewAgent(entry)}
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