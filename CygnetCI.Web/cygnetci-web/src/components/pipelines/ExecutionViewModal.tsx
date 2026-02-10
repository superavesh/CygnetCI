// src/components/pipelines/ExecutionViewModal.tsx

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Square, Terminal, Download, Copy, Check, ArrowDown } from 'lucide-react';
import { CONFIG } from '@/lib/config';

interface ExecutionViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStop: () => void;
  pipelineId: number;
  pipelineName: string;
  executionId: number | null;
}

interface LogLine {
  id: number;
  timestamp: string;
  log_level: 'debug' | 'info' | 'warning' | 'error' | 'success';
  message: string;
  step_name?: string;
  step_index?: number;
  source: 'system' | 'agent' | 'user';
}

export const ExecutionViewModal: React.FC<ExecutionViewModalProps> = ({
  isOpen,
  onClose,
  onStop,
  pipelineId,
  pipelineName,
  executionId
}) => {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [executionStatus, setExecutionStatus] = useState<string>('running');
  const [copied, setCopied] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Check if user is at the bottom of the scroll container
  const handleScroll = () => {
    if (logsContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
      // Consider "at bottom" if within 50px of the bottom
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setIsUserScrolledUp(!isAtBottom);
    }
  };

  // Auto-scroll to bottom only if user hasn't scrolled up
  useEffect(() => {
    if (!isUserScrolledUp) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isUserScrolledUp]);

  // Scroll to bottom function for the button
  const scrollToBottom = () => {
    setIsUserScrolledUp(false);
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch execution status and logs from API
  useEffect(() => {
    console.log('[ExecutionViewModal] useEffect triggered:', { isOpen, executionId, pipelineId });

    if (!isOpen || !executionId) {
      console.log('[ExecutionViewModal] Skipping fetch - modal closed or no executionId');
      return;
    }

    console.log('[ExecutionViewModal] Starting fetch for execution:', executionId);

    const fetchExecutionData = async () => {
      try {
        // Fetch execution status from the executions endpoint (only if pipelineId is provided)
        if (pipelineId && pipelineId > 0) {
          const statusResponse = await fetch(`${CONFIG.api.baseUrl}/pipelines/${pipelineId}/executions?limit=500`);
          if (statusResponse.ok) {
            const executions = await statusResponse.json();
            const currentExecution = executions.find((exec: any) => exec.id === executionId);

            if (currentExecution) {
              // Check if execution is still running based on actual status from database
              const running = currentExecution.status === 'running';
              setIsRunning(running);
              setExecutionStatus(currentExecution.status);
              // Reset stopping state once execution is no longer running
              if (!running) setIsStopping(false);
            } else {
              setIsRunning(false);
              setIsStopping(false);
            }
          } else {
            setIsRunning(false);
          }
        } else {
          // If no pipelineId, assume execution is not running
          console.log('[ExecutionViewModal] No pipelineId provided, assuming execution is not running');
          setIsRunning(false);
        }

        // Fetch logs with high limit to get all logs
        const logsUrl = `${CONFIG.api.baseUrl}/pipeline-executions/${executionId}/logs?limit=10000`;
        console.log('[ExecutionViewModal] Fetching logs from:', logsUrl);
        const logsResponse = await fetch(logsUrl);
        console.log('[ExecutionViewModal] Logs response status:', logsResponse.status, logsResponse.ok);

        if (logsResponse.ok) {
          const data = await logsResponse.json();
          console.log('[ExecutionViewModal] Logs data received:', data.length, 'logs');
          if (data && Array.isArray(data)) {
            setLogs(data);
          } else {
            console.error('[ExecutionViewModal] Invalid logs data format:', data);
          }
        } else {
          console.error('[ExecutionViewModal] Failed to fetch logs, status:', logsResponse.status);
        }
      } catch (error) {
        console.error('Failed to fetch execution data:', error);
        setIsRunning(false);
        setLogs([{
          id: 0,
          timestamp: new Date().toISOString(),
          log_level: 'error',
          message: 'Failed to fetch execution logs',
          source: 'system'
        }]);
      }
    };

    // Initial fetch
    fetchExecutionData();

    // Poll for new data every 2 seconds
    const pollInterval = setInterval(() => {
      fetchExecutionData();
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [isOpen, executionId]);

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

  const downloadLogs = () => {
    const logText = logs
      .map(log => `[${formatTime(log.timestamp)}] ${getLogPrefix(log.log_level, log.source)} ${log.step_name ? `[${log.step_name}] ` : ''}${log.message}`)
      .join('\n');

    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipeline-${pipelineId}-execution-${executionId}-${Date.now()}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyLogs = () => {
    const logText = logs
      .map(log => `[${formatTime(log.timestamp)}] ${getLogPrefix(log.log_level, log.source)} ${log.step_name ? `[${log.step_name}] ` : ''}${log.message}`)
      .join('\n');

    navigator.clipboard.writeText(logText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStop = () => {
    setIsStopping(true);
    onStop();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl shadow-2xl max-w-6xl w-full h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <Terminal className="h-6 w-6 text-green-400" />
            <div>
              <h2 className="text-lg font-bold text-white">{pipelineName}</h2>
              <p className="text-sm text-gray-400">
                Execution #{executionId} • {isRunning ? (
                  <span className="text-yellow-400">● Running</span>
                ) : executionStatus === 'cancelled' ? (
                  <span className="text-orange-400">● Cancelled</span>
                ) : executionStatus === 'failed' ? (
                  <span className="text-red-400">● Failed</span>
                ) : (
                  <span className="text-green-400">● Completed</span>
                )}
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

            {isRunning && (
              <button
                onClick={handleStop}
                disabled={isStopping}
                className={`px-3 py-2 text-white rounded-lg flex items-center space-x-2 transition-colors ${
                  isStopping ? 'bg-red-800 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                <Square className="h-4 w-4" />
                <span>{isStopping ? 'Stopping...' : 'Stop'}</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* CLI Output */}
        <div className="relative flex-1">
          <div
            ref={logsContainerRef}
            onScroll={handleScroll}
            className="absolute inset-0 overflow-y-auto p-6 bg-black font-mono text-sm"
            style={{ fontFamily: 'Consolas, Monaco, "Courier New", monospace' }}
          >
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Terminal className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500">No logs available for this execution</p>
              </div>
            </div>
          ) : (
            <>
              {logs.map((log) => (
                <div key={log.id} className="flex space-x-3 mb-2">
                  <span className="text-gray-600 flex-shrink-0">
                    {formatTime(log.timestamp)}
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
              ))}

              {isRunning && (
                <div className="flex space-x-3 mb-2">
                  <span className="text-gray-600">
                    {formatTime(new Date().toISOString())}
                  </span>
                  <span className="text-yellow-400 animate-pulse">●</span>
                  <span className="text-yellow-400 animate-pulse">
                    Processing...
                  </span>
                </div>
              )}

              <div ref={logsEndRef} />
            </>
          )}
          </div>

          {/* Scroll to bottom button - shows when user has scrolled up */}
          {isUserScrolledUp && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-4 right-4 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg flex items-center space-x-2 transition-colors"
            >
              <ArrowDown className="h-4 w-4" />
              <span>Scroll to bottom</span>
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-4 text-gray-400">
              <span>Lines: {logs.length}</span>
              <span>Duration: {Math.floor(logs.length * 0.8)}s</span>
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