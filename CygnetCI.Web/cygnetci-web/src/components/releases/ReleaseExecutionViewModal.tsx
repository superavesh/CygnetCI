// src/components/releases/ReleaseExecutionViewModal.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { X, Rocket, Eye, CheckCircle, XCircle, PlayCircle, Clock } from 'lucide-react';
import { ExecutionViewModal } from '../pipelines/ExecutionViewModal';

interface ReleaseExecutionViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  releaseId: number;
  releaseName: string;
  executionId: number | null;
}

interface PipelineExecutionInfo {
  id: number;
  pipeline_id: number;
  pipeline_name: string;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  started_at: string;
  completed_at: string | null;
  duration: number | null;
}

export const ReleaseExecutionViewModal: React.FC<ReleaseExecutionViewModalProps> = ({
  isOpen,
  onClose,
  releaseId,
  releaseName,
  executionId
}) => {
  const [pipelineExecutions, setPipelineExecutions] = useState<PipelineExecutionInfo[]>([]);
  const [releaseStatus, setReleaseStatus] = useState<string>('in_progress');
  const [loading, setLoading] = useState(true);
  const [selectedPipelineExecution, setSelectedPipelineExecution] = useState<PipelineExecutionInfo | null>(null);
  const [showPipelineLogsModal, setShowPipelineLogsModal] = useState(false);

  // Fetch pipeline executions for this release
  useEffect(() => {
    if (!isOpen || !executionId) return;

    const fetchPipelineExecutions = async () => {
      try {
        setLoading(true);

        // Fetch release execution to get status
        const execResponse = await fetch(`http://127.0.0.1:8000/release-executions/${executionId}`);
        if (execResponse.ok) {
          const execData = await execResponse.json();
          setReleaseStatus(execData.status);
        }

        // Fetch pipeline executions for this release
        const pipelineExecsResponse = await fetch(`http://127.0.0.1:8000/release-executions/${executionId}/pipeline-executions`);
        if (pipelineExecsResponse.ok) {
          const pipelineExecsData = await pipelineExecsResponse.json();
          setPipelineExecutions(pipelineExecsData);
        }
      } catch (error) {
        console.error('Failed to fetch pipeline executions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPipelineExecutions();

    // Poll for updates every 3 seconds
    const pollInterval = setInterval(fetchPipelineExecutions, 3000);
    return () => clearInterval(pollInterval);
  }, [isOpen, executionId]);

  if (!isOpen) return null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'running':
        return <PlayCircle className="h-5 w-5 text-yellow-500 animate-pulse" />;
      case 'cancelled':
        return <XCircle className="h-5 w-5 text-gray-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'succeeded':
        return 'bg-green-600 text-white';
      case 'failed':
        return 'bg-red-600 text-white';
      case 'running':
        return 'bg-amber-600 text-white';
      case 'cancelled':
        return 'bg-gray-600 text-white';
      default:
        return 'bg-gray-600 text-white';
    }
  };

  const getReleaseStatusColor = () => {
    switch (releaseStatus) {
      case 'succeeded': return 'text-green-400';
      case 'failed': return 'text-red-400';
      case 'cancelled': return 'text-orange-400';
      case 'in_progress': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  const getReleaseStatusText = () => {
    switch (releaseStatus) {
      case 'succeeded': return '● Completed Successfully';
      case 'failed': return '● Failed';
      case 'cancelled': return '● Cancelled';
      case 'in_progress': return '● In Progress';
      default: return '● Unknown';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
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

  const handleViewLogs = (pipelineExec: PipelineExecutionInfo) => {
    setSelectedPipelineExecution(pipelineExec);
    setShowPipelineLogsModal(true);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <Rocket className="h-6 w-6 text-purple-600" />
              <div>
                <h2 className="text-xl font-bold text-gray-900">Release Execution Details</h2>
                <p className="text-sm text-gray-500">
                  {releaseName} • Execution #{executionId} • <span className={getReleaseStatusColor()}>{getReleaseStatusText()}</span>
                </p>
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
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading pipeline executions...</p>
                </div>
              </div>
            ) : pipelineExecutions.length === 0 ? (
              <div className="text-center py-12">
                <Rocket className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">No Pipeline Executions</h3>
                <p className="text-gray-500">This release execution has not triggered any pipelines yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-gray-600">
                    Total Pipelines: <span className="font-semibold text-gray-900">{pipelineExecutions.length}</span>
                  </p>
                  <div className="flex items-center space-x-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-gray-600">
                        Success: <span className="font-semibold">{pipelineExecutions.filter(e => e.status === 'succeeded').length}</span>
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <XCircle className="h-4 w-4 text-red-500" />
                      <span className="text-gray-600">
                        Failed: <span className="font-semibold">{pipelineExecutions.filter(e => e.status === 'failed').length}</span>
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <PlayCircle className="h-4 w-4 text-yellow-500" />
                      <span className="text-gray-600">
                        Running: <span className="font-semibold">{pipelineExecutions.filter(e => e.status === 'running').length}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {pipelineExecutions.map((pipelineExec, index) => (
                  <div
                    key={pipelineExec.id}
                    className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-4 flex-1">
                        <div className="mt-1">
                          {getStatusIcon(pipelineExec.status)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="text-sm font-semibold text-gray-900">
                              {pipelineExec.pipeline_name}
                            </h3>
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(pipelineExec.status)}`}>
                              {pipelineExec.status.charAt(0).toUpperCase() + pipelineExec.status.slice(1)}
                            </span>
                            {index === 0 && (
                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-600 text-white">
                                First
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                            <div>
                              <span className="text-gray-500">Started:</span>
                              <p className="font-medium text-gray-900">{formatDate(pipelineExec.started_at)}</p>
                            </div>

                            {pipelineExec.completed_at && (
                              <div>
                                <span className="text-gray-500">Completed:</span>
                                <p className="font-medium text-gray-900">{formatDate(pipelineExec.completed_at)}</p>
                              </div>
                            )}

                            <div>
                              <span className="text-gray-500">Duration:</span>
                              <p className="font-medium text-gray-900">{formatDuration(pipelineExec.duration)}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleViewLogs(pipelineExec)}
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

      {/* Pipeline Execution Logs Modal */}
      {selectedPipelineExecution && (
        <ExecutionViewModal
          isOpen={showPipelineLogsModal}
          onClose={() => {
            setShowPipelineLogsModal(false);
            setSelectedPipelineExecution(null);
          }}
          onStop={() => {}}
          pipelineId={selectedPipelineExecution.pipeline_id}
          pipelineName={selectedPipelineExecution.pipeline_name}
          executionId={selectedPipelineExecution.id}
        />
      )}
    </>
  );
};
