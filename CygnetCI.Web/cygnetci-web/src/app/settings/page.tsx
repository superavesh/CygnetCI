'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Settings as SettingsIcon, Save, RefreshCw, Lock, AlertCircle, CheckCircle, Cpu, MemoryStick, HardDrive } from 'lucide-react';
import { CONFIG } from '@/lib/config';
import { isSuperuser } from '@/lib/permissions';

interface Thresholds {
  cpu: number;
  memory: number;
  disk: number;
}

export default function SettingsPage() {
  const [access, setAccess] = useState<{ checked: boolean; ok: boolean }>({ checked: false, ok: true });
  const [thresholds, setThresholds] = useState<Thresholds>({ cpu: 90, memory: 90, disk: 90 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    setAccess({ checked: true, ok: isSuperuser() });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${CONFIG.api.baseUrl}/settings/alert-thresholds`);
      if (res.ok) {
        const data = await res.json();
        setThresholds({ cpu: data.cpu ?? 90, memory: data.memory ?? 90, disk: data.disk ?? 90 });
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setField = (k: keyof Thresholds, v: string) => {
    const n = Math.max(1, Math.min(100, parseInt(v || '0', 10) || 0));
    setThresholds(prev => ({ ...prev, [k]: n }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setSaving(true);
    try {
      const res = await fetch(`${CONFIG.api.baseUrl}/settings/alert-thresholds`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thresholds),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to save');
      }
      setMsg({ type: 'success', text: 'Thresholds saved. Mobile apps will pick this up on their next poll.' });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  if (access.checked && !access.ok) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Lock className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-xl font-semibold text-gray-800 mb-1">Access denied</h3>
        <p className="text-gray-600">Only superusers can change system settings.</p>
      </div>
    );
  }

  const fields: { key: keyof Thresholds; label: string; icon: React.ReactNode }[] = [
    { key: 'cpu', label: 'CPU usage', icon: <Cpu className="h-5 w-5 text-blue-600" /> },
    { key: 'memory', label: 'Memory usage', icon: <MemoryStick className="h-5 w-5 text-purple-600" /> },
    { key: 'disk', label: 'Disk usage', icon: <HardDrive className="h-5 w-5 text-emerald-600" /> },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
          <SettingsIcon className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-600">Alert thresholds used by the mobile monitoring app</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Critical alert thresholds (%)</h2>
          <button onClick={load} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="Reload">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          When an agent&apos;s usage reaches or exceeds a threshold, the mobile app raises a critical alarm.
        </p>

        {msg && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${msg.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
            {msg.type === 'error' ? <AlertCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
            {msg.text}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          {fields.map(f => (
            <div key={f.key} className="flex items-center gap-4">
              <div className="flex items-center gap-2 w-40">
                {f.icon}
                <span className="text-sm font-medium text-gray-700">{f.label}</span>
              </div>
              <input
                type="number" min={1} max={100} value={thresholds[f.key]}
                onChange={(e) => setField(f.key, e.target.value)}
                className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-400 text-sm">%</span>
            </div>
          ))}

          <div className="pt-2">
            <button
              type="submit" disabled={saving || loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{saving ? 'Saving...' : 'Save thresholds'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
