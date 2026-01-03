// src/components/releases/ReleaseExecutionViewModal.tsx

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Square, Terminal, Download, Copy, Check, Rocket } from 'lucide-react';

interface ReleaseExecutionViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  releaseId: number;
  releaseName: string;
  executionId: number | null;
}

interface PipelineExecutionLog {
  id: number;
  pipeline_execution_id: number;
  pipeline_name: string;
  timestamp: string;
  log_level: 'debug' | 'info' | 'warning' | 'error' | 'success';
  message: string;
  step_name?: string;
  step_index?: number;
  source: 'system' | 'agent' | 'user';
}

export const ReleaseExecutionViewModal: React.FC<ReleaseExecutionViewModalProps> = ({
  isOpen,
  onClose,
  releaseId,
  releaseName,
  executionId
}) => {
  const [logs, setLogs] = useState<PipelineExecutionLog[]>([]);
  const [isRunning, setIsRunning] = useState(true);
  const [copied, setCopied] = useState(false);
  const [releaseStatus, setReleaseStatus] = useState<string>('in_progress');
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Fetch execution logs from API
  useEffect(() => {
    if (!isOpen || !executionId) return;

    const fetchLogs = async () => {
      try {
        // First, trigger status update check (this will update the status if all pipelines are complete)
        if (isRunning) {
          try {
            await fetch(`http://127.0.0.1:8000/release-executions/${executionId}/update-status`, {
              method: 'POST'
            });
          } catch (err) {
            // Ignore errors from status update
          }
        }

        // Fetch release execution to get status
        const execResponse = await fetch(`http://127.0.0.1:8000/release-executions/${executionId}`);
        if (execResponse.ok) {
          const execData = await execResponse.json();
          setReleaseStatus(execData.status);

          // Check if execution is complete
          const isComplete = execData.status === 'succeeded' ||
                           execData.status === 'failed' ||
                           execData.status === 'cancelled';
          setIsRunning(!isComplete);
        }

        // Fetch all pipeline execution logs for this release execution
        const logsResponse = await fetch(`http://127.0.0.1:8000/release-executions/${executionId}/logs`);
        if (logsResponse.ok) {
          const logsData = await logsResponse.json();
          setLogs(logsData);
        }
      } catch (error) {
        console.error('Failed to fetch logs:', error);
        setLogs([{
          id: 0,
          pipeline_execution_id: 0,
          pipeline_name: 'System',
          timestamp: new Date().toISOString(),
          log_level: 'error',
          message: 'Failed to fetch execution logs',
          source: 'system'
        }]);
      }
    };

    // Initial fetch
    fetchLogs();

    // Poll for new logs every 2 seconds while running
    const logInterval = setInterval(() => {
      if (isRunning) {
        fetchLogs();
      }
    }, 2000);

    return () => clearInterval(logInterval);
  }, [isOpen, executionId, isRunning]);

  if (!isOpen) return null;

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case 'success': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'warning': return 'text-yellow-400';
      case 'debug': return 'text-gray-500';
      default: return 'text-gray-300';
    }
  };

  const getLogPrefix = (level: string, source: string) => {
    if (source === 'agent') return '▶';
    switch (level) {
      case 'success': return '✓';
      case 'error': return '✗';
      case 'warning': return '⚠';
      case 'debug': return '◦';
      default: return '•';
    }
  };

  const getStatusColor = () => {
    switch (releaseStatus) {
      case 'succeeded': return 'text-green-400';
      case 'failed': return 'text-red-400';
      case 'cancelled': return 'text-orange-400';
      case 'in_progress': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusText = () => {
    switch (releaseStatus) {
      case 'succeeded': return '● Completed';
      case 'failed': return '● Failed';
      case 'cancelled': return '● Cancelled';
      case 'in_progress': return '● Running';
      default: return '● Unknown';
    }
  };

  const downloadLogs = () => {
    const logText = logs
      .map(log => `[${formatTime(log.timestamp)}] [${log.pipeline_name}] ${getLogPrefix(log.log_level, log.source)} ${log.step_name ? `[${log.step_name}] ` : ''}${log.message}`)
      .join('\n');

    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `release-${releaseId}-execution-${executionId}-${Date.now()}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyLogs = () => {
    const logText = logs
      .map(log => `[${formatTime(log.timestamp)}] [${log.pipeline_name}] ${getLogPrefix(log.log_level, log.source)} ${log.step_name ? `[${log.step_name}] ` : ''}${log.message}`)
      .join('\n');

    navigator.clipboard.writeText(logText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl shadow-2xl max-w-6xl w-full h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <Rocket className="h-6 w-6 text-purple-400" />
            <div>
              <h2 className="text-lg font-bold text-white">{releaseName}</h2>
              <p className="text-sm text-gray-400">
                Execution #{executionId} • <span className={getStatusColor()}>{getStatusText()}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={copyLogs}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
              title="Copy logs"
            >
              {copied ? <Check className="h-5 w-5 text-green-400" /> : <Copy className="h-5 w-5" />}
            </button>

            <button
              onClick={downloadLogs}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
              title="Download logs"
            >
              <Download className="h-5 w-5" />
            </button>

            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* CLI Output */}
        <div
          ref={logsContainerRef}
          className="flex-1 overflow-y-auto p-6 bg-black font-mono text-sm"
          style={{ fontFamily: 'Consolas, Monaco, "Courier New", monospace' }}
        >
          {logs.length === 0 && !isRunning ? (
            <div className="text-gray-400 text-center py-8">
              No logs available for this execution.
            </div>
          ) : (
            logs.map((log) => (
              <div key={`${log.pipeline_execution_id}-${log.id}`} className="flex space-x-3 mb-2">
                <span className="text-gray-600 flex-shrink-0">
                  {formatTime(log.timestamp)}
                </span>
                <span className="text-purple-400 flex-shrink-0 min-w-[120px]">
                  [{log.pipeline_name}]
                </span>
                <span className={`flex-shrink-0 ${getLogColor(log.log_level)}`}>
                  {getLogPrefix(log.log_level, log.source)}
                </span>
                {log.step_name && (
                  <span className="text-blue-400 flex-shrink-0">
                    [{log.step_name}]
                  </span>
                )}
                <span className={getLogColor(log.log_level)}>
                  {log.message}
                </span>
              </div>
            ))
          )}

          {isRunning && (
            <div className="flex space-x-3 mb-2">
              <span className="text-gray-600">
                {formatTime(new Date().toISOString())}
              </span>
              <span className="text-purple-400 flex-shrink-0 min-w-[120px]">
                [System]
              </span>
              <span className="text-yellow-400 animate-pulse">●</span>
              <span className="text-yellow-400 animate-pulse">
                Waiting for logs...
              </span>
            </div>
          )}

          <div ref={logsEndRef} />
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-4 text-gray-400">
              <span>Lines: {logs.length}</span>
              <span>Status: {releaseStatus}</span>
            </div>
            {!isRunning && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
