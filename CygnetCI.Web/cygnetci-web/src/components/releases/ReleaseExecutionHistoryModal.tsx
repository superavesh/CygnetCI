// src/components/releases/ReleaseExecutionHistoryModal.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { X, Clock, CheckCircle, XCircle, PlayCircle, History, Eye, ArrowRight } from 'lucide-react';
import { apiService } from '@/lib/api/apiService';
import { ReleaseStageLogsModal } from './ReleaseStageLogsModal';
import { ReleaseExecution } from '@/types';

interface ReleaseExecutionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  releaseId: number;
  releaseName: string;
}

export const ReleaseExecutionHistoryModal: React.FC<ReleaseExecutionHistoryModalProps> = ({
  isOpen,
  onClose,
  releaseId,
  releaseName
}) => {
  const [executions, setExecutions] = useState<ReleaseExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedStage, setSelectedStage] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchExecutions = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await apiService.getReleaseExecutions(releaseId);
        setExecutions(data);
      } catch (err) {
        console.error('Error fetching release executions:', err);
        setError('Failed to fetch execution history');
      } finally {
        setLoading(false);
      }
    };

    fetchExecutions();
  }, [isOpen, releaseId]);

  if (!isOpen) return null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'in_progress':
        return <PlayCircle className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'awaiting_approval':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'succeeded':
        return 'bg-green-600 text-white border-green-200';
      case 'failed':
        return 'bg-red-600 text-white border-red-200';
      case 'in_progress':
        return 'bg-blue-600 text-white border-blue-200';
      case 'pending':
      case 'awaiting_approval':
        return 'bg-amber-600 text-white border-yellow-200';
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
      <div className="bg-white rounded-xl shadow-2xl max-w-7xl w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <History className="h-6 w-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Release Execution History</h2>
              <p className="text-sm text-gray-500">{releaseName}</p>
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
              <p className="text-gray-500">This release hasn't been deployed yet.</p>
            </div>
          )}

          {!loading && !error && executions.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-600">
                  Total Deployments: <span className="font-semibold text-gray-900">{executions.length}</span>
                </p>
                <div className="flex items-center space-x-4 text-sm">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-gray-600">
                      Success: <span className="font-semibold">{executions.filter(e => e.status === 'succeeded').length}</span>
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
                  className="bg-gray-50 rounded-lg p-5 border border-gray-200 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start space-x-4 flex-1">
                      <div className="mt-1">
                        {getStatusIcon(execution.status)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-sm font-semibold text-gray-900">
                            {execution.release_number}
                          </h3>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(execution.status)}`}>
                            {execution.status.replace('_', ' ').charAt(0).toUpperCase() + execution.status.slice(1)}
                          </span>
                          {index === 0 && (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-600 text-white border border-blue-200">
                              Latest
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm mb-4">
                          {execution.started_at && (
                            <div>
                              <span className="text-gray-500">Started:</span>
                              <p className="font-medium text-gray-900">{formatDate(execution.started_at)}</p>
                            </div>
                          )}

                          {execution.completed_at && (
                            <div>
                              <span className="text-gray-500">Completed:</span>
                              <p className="font-medium text-gray-900">{formatDate(execution.completed_at)}</p>
                            </div>
                          )}

                          <div>
                            <span className="text-gray-500">Duration:</span>
                            <p className="font-medium text-gray-900">{formatDuration(execution.duration_seconds || null)}</p>
                          </div>
                        </div>

                        {/* Stages Pipeline */}
                        {execution.stages && execution.stages.length > 0 ? (
                          <div className="pt-3 border-t border-gray-200">
                            <span className="text-xs text-gray-500 font-medium mb-3 block">Deployment Pipeline ({execution.stages.length} stages):</span>
                            <div className="flex items-start gap-3 flex-wrap">
                              {execution.stages.map((stage, idx) => (
                                  <React.Fragment key={stage.id}>
                                    <div className="flex flex-col gap-2">
                                      <div className={`flex items-center gap-2 px-3 py-2 rounded-md border ${getStatusColor(stage.status)}`}>
                                        {getStatusIcon(stage.status)}
                                        <div className="flex-1">
                                          <span className="text-xs font-medium block">{stage.environment_name}</span>
                                          {stage.started_at && stage.completed_at && (
                                            <span className="text-xs opacity-75">{formatDuration(Math.floor((new Date(stage.completed_at).getTime() - new Date(stage.started_at).getTime()) / 1000))}</span>
                                          )}
                                          {stage.approval_status === 'approved' && stage.approved_by && (
                                            <span className="text-xs opacity-75 block">✓ {stage.approved_by}</span>
                                          )}
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => {
                                          console.log('Eye button clicked for stage:', stage.id, stage.environment_name);
                                          setSelectedStage({ id: stage.id, name: stage.environment_name });
                                          setShowLogsModal(true);
                                        }}
                                        className="px-3 py-2 text-white rounded-md transition-colors shadow-md flex items-center justify-center gap-2 font-medium text-xs"
                                        style={{
                                          background: 'linear-gradient(135deg, #1a365d, #2d4a73)',
                                          border: '1px solid #1a365d'
                                        }}
                                        title="View Pipeline Logs"
                                      >
                                        <Eye className="h-4 w-4" />
                                        <span>View Logs</span>
                                      </button>
                                    </div>
                                    {idx < execution.stages.length - 1 && (
                                      <ArrowRight className="h-5 w-5 text-gray-400 mt-4" />
                                    )}
                                  </React.Fragment>
                                ))}
                            </div>
                          </div>
                        ) : (
                          <div className="pt-3 border-t border-gray-200">
                            <span className="text-xs text-gray-500 font-medium">No stages found for this execution</span>
                          </div>
                        )}
                      </div>
                    </div>
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

      {/* Stage Logs Modal */}
      {showLogsModal && selectedStage && (
        <ReleaseStageLogsModal
          isOpen={showLogsModal}
          onClose={() => {
            setShowLogsModal(false);
            setSelectedStage(null);
          }}
          stageExecutionId={selectedStage.id}
          stageName={selectedStage.name}
          releaseName={releaseName}
        />
      )}
    </div>
  );
};
