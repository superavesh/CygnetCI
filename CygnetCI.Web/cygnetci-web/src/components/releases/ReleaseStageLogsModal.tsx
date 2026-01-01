// src/components/releases/ReleaseStageLogsModal.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { X, Terminal, Download, RefreshCw } from 'lucide-react';
import { apiService } from '@/lib/api/apiService';

interface ReleaseStageLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stageExecutionId: number;
  stageName: string;
  releaseName: string;
}

export const ReleaseStageLogsModal: React.FC<ReleaseStageLogsModalProps> = ({
  isOpen,
  onClose,
  stageExecutionId,
  stageName,
  releaseName
}) => {
  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetchLogs();
  }, [isOpen, stageExecutionId]);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);

    try {
      const logsData = await apiService.getReleaseExecutionLogs(stageExecutionId);
      setLogs(logsData.logs || 'No logs available');
    } catch (err) {
      console.error('Error fetching stage logs:', err);
      setError('Failed to fetch logs');
      setLogs('');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${releaseName}-${stageName}-logs.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Terminal className="h-6 w-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Stage Execution Logs</h2>
              <p className="text-sm text-gray-500">{releaseName} - {stageName}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700 disabled:opacity-50"
              title="Refresh Logs"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleDownload}
              disabled={!logs || loading}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700 disabled:opacity-50"
              title="Download Logs"
            >
              <Download className="h-5 w-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Terminal-style log display */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-900">
          {loading && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-400 mx-auto"></div>
              <p className="mt-4 text-green-400">Loading logs...</p>
            </div>
          )}

          {error && (
            <div className="text-red-400 font-mono text-sm">
              ERROR: {error}
            </div>
          )}

          {!loading && !error && (
            <pre className="text-sm font-mono text-green-400 whitespace-pre-wrap break-words">
              {logs}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Stage Execution ID: {stageExecutionId}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
