// src/components/email/EmailSettingsModal.tsx

import React, { useState, useEffect } from 'react';
import {
  X, Mail, Server, Lock, Eye, EyeOff, RefreshCw, Check, AlertCircle,
  Plus, Trash2, Settings, ChevronDown, Folder
} from 'lucide-react';
import { apiService } from '@/lib/api/apiService';

interface EmailConfig {
  id: number;
  name: string;
  emailAddress: string;
  serverType: string;
  serverHost: string;
  serverPort: number;
  username: string;
  useSsl: boolean;
  folder: string;
  isActive: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
}

interface EmailPreset {
  name: string;
  serverType: string;
  serverHost: string;
  serverPort: number;
  useSsl: boolean;
  note: string;
}

interface EmailSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId?: number;
  onSyncComplete?: () => void;
}

export const EmailSettingsModal: React.FC<EmailSettingsModalProps> = ({
  isOpen,
  onClose,
  customerId,
  onSyncComplete
}) => {
  const [configs, setConfigs] = useState<EmailConfig[]>([]);
  const [presets, setPresets] = useState<EmailPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState<EmailConfig | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; folders?: string[] } | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email_address: '',
    server_type: 'imap',
    server_host: '',
    server_port: 993,
    username: '',
    password: '',
    use_ssl: true,
    folder: 'INBOX'
  });

  useEffect(() => {
    if (isOpen) {
      fetchConfigs();
      fetchPresets();
    }
  }, [isOpen, customerId]);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const data = await apiService.getEmailConfigs(customerId);
      setConfigs(data);
    } catch (error) {
      console.error('Failed to fetch email configs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPresets = async () => {
    try {
      const data = await apiService.getEmailPresets();
      setPresets(data);
    } catch (error) {
      console.error('Failed to fetch presets:', error);
    }
  };

  const handlePresetSelect = (preset: EmailPreset) => {
    setFormData(prev => ({
      ...prev,
      server_type: preset.serverType,
      server_host: preset.serverHost,
      server_port: preset.serverPort,
      use_ssl: preset.useSsl
    }));
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiService.testEmailConnection(formData);
      setTestResult(result);
    } catch (error: any) {
      setTestResult({ success: false, message: error.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingConfig) {
        await apiService.updateEmailConfig(editingConfig.id, {
          ...formData,
          customer_id: customerId
        });
      } else {
        await apiService.createEmailConfig({
          ...formData,
          customer_id: customerId
        });
      }
      await fetchConfigs();
      resetForm();
    } catch (error: any) {
      alert('Failed to save configuration: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (configId: number) => {
    if (!confirm('Are you sure you want to delete this email configuration?')) return;

    try {
      await apiService.deleteEmailConfig(configId);
      await fetchConfigs();
    } catch (error: any) {
      alert('Failed to delete configuration: ' + error.message);
    }
  };

  const handleSync = async (configId: number) => {
    setSyncing(configId);
    try {
      const result = await apiService.syncEmails(configId, 50);
      alert(result.message);
      await fetchConfigs();
      onSyncComplete?.();
    } catch (error: any) {
      alert('Sync failed: ' + error.message);
    } finally {
      setSyncing(null);
    }
  };

  const handleEdit = (config: EmailConfig) => {
    setEditingConfig(config);
    setFormData({
      name: config.name,
      email_address: config.emailAddress,
      server_type: config.serverType,
      server_host: config.serverHost,
      server_port: config.serverPort,
      username: config.username,
      password: '',
      use_ssl: config.useSsl,
      folder: config.folder
    });
    setShowAddForm(true);
    setTestResult(null);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email_address: '',
      server_type: 'imap',
      server_host: '',
      server_port: 993,
      username: '',
      password: '',
      use_ssl: true,
      folder: 'INBOX'
    });
    setShowAddForm(false);
    setEditingConfig(null);
    setTestResult(null);
    setShowPassword(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-3 flex items-center justify-between border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Settings className="h-5 w-5 text-blue-600" />
              Email Configuration
            </h2>
            <p className="text-gray-600 text-xs mt-0.5">Configure email servers to fetch alerts</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              {/* Existing Configurations */}
              {!showAddForm && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-700">Configured Email Accounts</h3>
                    <button
                      onClick={() => setShowAddForm(true)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                      <Plus className="h-4 w-4" />
                      Add Account
                    </button>
                  </div>

                  {configs.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                      <Mail className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600">No email accounts configured</p>
                      <p className="text-gray-500 text-sm mt-1">Add an email account to start fetching alerts</p>
                      <button
                        onClick={() => setShowAddForm(true)}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                      >
                        Configure Email Account
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {configs.map(config => (
                        <div
                          key={config.id}
                          className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${config.isActive ? 'bg-blue-100' : 'bg-gray-100'}`}>
                                <Mail className={`h-5 w-5 ${config.isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                              </div>
                              <div>
                                <h4 className="font-medium text-gray-900">{config.name}</h4>
                                <p className="text-sm text-gray-500">{config.emailAddress}</p>
                                <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                                  <Server className="h-3 w-3" />
                                  <span>{config.serverHost}:{config.serverPort}</span>
                                  <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 uppercase">
                                    {config.serverType}
                                  </span>
                                </div>
                                {config.lastSyncAt && (
                                  <p className="text-xs text-gray-400 mt-1">
                                    Last sync: {new Date(config.lastSyncAt).toLocaleString()}
                                    {config.lastSyncStatus && (
                                      <span className={`ml-2 ${config.lastSyncStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                                        ({config.lastSyncStatus})
                                      </span>
                                    )}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleSync(config.id)}
                                disabled={syncing === config.id}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                                title="Sync emails"
                              >
                                <RefreshCw className={`h-4 w-4 ${syncing === config.id ? 'animate-spin' : ''}`} />
                              </button>
                              <button
                                onClick={() => handleEdit(config)}
                                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Settings className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(config.id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Add/Edit Form */}
              {showAddForm && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-700">
                      {editingConfig ? 'Edit Email Account' : 'Add Email Account'}
                    </h3>
                    <button
                      onClick={resetForm}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>

                  {/* Presets */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Quick Setup (Presets)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {presets.slice(0, 5).map(preset => (
                        <button
                          key={preset.name}
                          onClick={() => handlePresetSelect(preset)}
                          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Account Name
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                        placeholder="e.g., Work Alerts"
                      />
                    </div>

                    {/* Email Address */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={formData.email_address}
                        onChange={(e) => setFormData(prev => ({ ...prev, email_address: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                        placeholder="alerts@company.com"
                      />
                    </div>

                    {/* Server Type */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Server Type
                      </label>
                      <select
                        value={formData.server_type}
                        onChange={(e) => {
                          const type = e.target.value;
                          setFormData(prev => ({
                            ...prev,
                            server_type: type,
                            server_port: type === 'imap' ? 993 : 995
                          }));
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                      >
                        <option value="imap">IMAP</option>
                        <option value="pop3">POP3</option>
                      </select>
                    </div>

                    {/* Server Host */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Server Host
                      </label>
                      <input
                        type="text"
                        value={formData.server_host}
                        onChange={(e) => setFormData(prev => ({ ...prev, server_host: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                        placeholder="imap.example.com"
                      />
                    </div>

                    {/* Server Port */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Server Port
                      </label>
                      <input
                        type="number"
                        value={formData.server_port}
                        onChange={(e) => setFormData(prev => ({ ...prev, server_port: parseInt(e.target.value) }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                      />
                    </div>

                    {/* Use SSL */}
                    <div className="flex items-center">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.use_ssl}
                          onChange={(e) => setFormData(prev => ({ ...prev, use_ssl: e.target.checked }))}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Use SSL/TLS</span>
                      </label>
                    </div>

                    {/* Username */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Username
                      </label>
                      <input
                        type="text"
                        value={formData.username}
                        onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                        placeholder="username or email"
                      />
                    </div>

                    {/* Password */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Password {editingConfig && '(leave empty to keep current)'}
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={formData.password}
                          onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                          className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Folder */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Folder
                      </label>
                      <div className="relative">
                        <Folder className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={formData.folder}
                          onChange={(e) => setFormData(prev => ({ ...prev, folder: e.target.value }))}
                          className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                          placeholder="INBOX"
                        />
                      </div>
                      {testResult?.folders && testResult.folders.length > 0 && (
                        <div className="mt-1">
                          <p className="text-xs text-gray-500">Available folders:</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {testResult.folders.slice(0, 5).map(folder => (
                              <button
                                key={folder}
                                onClick={() => setFormData(prev => ({ ...prev, folder }))}
                                className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                              >
                                {folder}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Test Result */}
                  {testResult && (
                    <div className={`p-3 rounded-lg flex items-start gap-2 ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                      {testResult.success ? (
                        <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                      )}
                      <div>
                        <p className={`text-sm ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                          {testResult.message}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                    <button
                      onClick={handleTestConnection}
                      disabled={testing || !formData.server_host || !formData.username || (!formData.password && !editingConfig)}
                      className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 disabled:opacity-50"
                    >
                      {testing ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Server className="h-4 w-4" />
                      )}
                      Test Connection
                    </button>

                    <button
                      onClick={handleSave}
                      disabled={saving || !formData.name || !formData.email_address || !formData.server_host || !formData.username || (!formData.password && !editingConfig)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {saving ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      {editingConfig ? 'Update Configuration' : 'Save Configuration'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
