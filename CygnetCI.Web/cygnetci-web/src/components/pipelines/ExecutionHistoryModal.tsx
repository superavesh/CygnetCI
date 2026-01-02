// src/components/pipelines/ExecutionHistoryModal.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { X, Clock, CheckCircle, XCircle, PlayCircle, History, Eye } from 'lucide-react';

interface ExecutionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineId: number;
  pipelineName: string;
  onViewLogs: (executionId: number) => void;
}

interface ExecutionRecord {
  id: number;
  status: 'success' | 'failed' | 'running' | 'cancelled';
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  parameters: Record<string, string>;
}

export const ExecutionHistoryModal: React.FC<ExecutionHistoryModalProps> = ({
  isOpen,
  onClose,
  pipelineId,
  pipelineName,
  onViewLogs
}) => {
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchExecutions = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`http://127.0.0.1:8000/pipelines/${pipelineId}/executions?limit=50`);
        if (response.ok) {
          const data = await response.json();
          setExecutions(data);
        } else {
          setError('Failed to fetch execution history');
        }
      } catch (err) {
        console.error('Error fetching executions:', err);
        setError('Failed to fetch execution history');
      } finally {
        setLoading(false);
      }
    };

    fetchExecutions();
  }, [isOpen, pipelineId]);

  if (!isOpen) return null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'running':
        return <PlayCircle className="h-5 w-5 text-yellow-500" />;
      case 'cancelled':
        return <XCircle className="h-5 w-5 text-gray-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-600 text-white border-green-200';
      case 'failed':
        return 'bg-red-600 text-white border-red-200';
      case 'running':
        return 'bg-amber-600 text-white border-yellow-200';
      case 'cancelled':
        return 'bg-gray-600 text-white border-gray-200';
      default:
        return 'bg-gray-600 text-white border-gray-200';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'N/A';

    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${mins}m`;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <History className="h-6 w-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Execution History</h2>
              <p className="text-sm text-gray-500">{pipelineName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading execution history...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && executions.length === 0 && (
            <div className="text-center py-12">
              <History className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">No Execution History</h3>
              <p className="text-gray-500">This pipeline hasn't been executed yet.</p>
            </div>
          )}

          {!loading && !error && executions.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-600">
                  Total Executions: <span className="font-semibold text-gray-900">{executions.length}</span>
                </p>
                <div className="flex items-center space-x-4 text-sm">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-gray-600">
                      Success: <span className="font-semibold">{executions.filter(e => e.status === 'success').length}</span>
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-gray-600">
                      Failed: <span className="font-semibold">{executions.filter(e => e.status === 'failed').length}</span>
                    </span>
                  </div>
                </div>
              </div>

              {executions.map((execution, index) => (
                <div
                  key={execution.id}
                  className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4 flex-1">
                      <div className="mt-1">
                        {getStatusIcon(execution.status)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-sm font-semibold text-gray-900">
                            Execution #{execution.id}
                          </h3>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(execution.status)}`}>
                            {execution.status.charAt(0).toUpperCase() + execution.status.slice(1)}
                          </span>
                          {index === 0 && (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-600 text-white border border-blue-200">
                              Latest
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                          <div>
                            <span className="text-gray-500">Started:</span>
                            <p className="font-medium text-gray-900">{formatDate(execution.startedAt)}</p>
                          </div>

                          {execution.completedAt && (
                            <div>
                              <span className="text-gray-500">Completed:</span>
                              <p className="font-medium text-gray-900">{formatDate(execution.completedAt)}</p>
                            </div>
                          )}

                          <div>
                            <span className="text-gray-500">Duration:</span>
                            <p className="font-medium text-gray-900">{formatDuration(execution.duration)}</p>
                          </div>
                        </div>

                        {Object.keys(execution.parameters).length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <span className="text-xs text-gray-500 font-medium">Parameters:</span>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {Object.entries(execution.parameters).map(([key, value]) => (
                                <span
                                  key={key}
                                  className="px-2 py-1 bg-white rounded border border-gray-300 text-xs"
                                >
                                  <span className="font-medium text-gray-700">{key}:</span>
                                  <span className="text-gray-600 ml-1">{value}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        onViewLogs(execution.id);
                        onClose();
                      }}
                      className="ml-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center space-x-2 transition-colors text-sm font-medium"
                    >
                      <Eye className="h-4 w-4" />
                      <span>View Logs</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <div className="flex items-center justify-end">
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
