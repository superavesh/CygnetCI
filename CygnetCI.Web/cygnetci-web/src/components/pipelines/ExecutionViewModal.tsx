// src/components/pipelines/ExecutionViewModal.tsx

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Square, Terminal, Download, Copy, Check } from 'lucide-react';

interface ExecutionViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStop: () => void;
  pipelineId: number;
  pipelineName: string;
  executionId: number | null;
}

interface LogLine {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'command';
  message: string;
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
  const [isRunning, setIsRunning] = useState(true);
  const [copied, setCopied] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Simulate real-time log streaming
  useEffect(() => {
    if (!isOpen || !executionId) return;

    // Initial logs
    const initialLogs: LogLine[] = [
      { timestamp: new Date().toISOString(), type: 'info', message: `Starting pipeline: ${pipelineName}` },
      { timestamp: new Date().toISOString(), type: 'info', message: `Execution ID: ${executionId}` },
      { timestamp: new Date().toISOString(), type: 'info', message: 'Connecting to agent...' },
      { timestamp: new Date().toISOString(), type: 'success', message: 'Agent connected successfully' },
      { timestamp: new Date().toISOString(), type: 'info', message: 'Preparing execution environment...' }
    ];

    setLogs(initialLogs);

    // Simulate streaming logs
    const logInterval = setInterval(() => {
      const sampleLogs = [
        { type: 'command' as const, message: '$ npm install' },
        { type: 'info' as const, message: 'Installing dependencies...' },
        { type: 'info' as const, message: 'added 1523 packages in 12s' },
        { type: 'success' as const, message: 'Dependencies installed successfully' },
        { type: 'command' as const, message: '$ npm run build' },
        { type: 'info' as const, message: 'Building application...' },
        { type: 'info' as const, message: 'Compiling TypeScript...' },
        { type: 'info' as const, message: 'Generating bundle...' },
        { type: 'success' as const, message: 'Build completed: dist/bundle.js (245 KB)' },
        { type: 'command' as const, message: '$ npm test' },
        { type: 'info' as const, message: 'Running test suites...' },
        { type: 'info' as const, message: 'Test Suites: 5 passed, 5 total' },
        { type: 'info' as const, message: 'Tests: 42 passed, 42 total' },
        { type: 'success' as const, message: 'All tests passed!' },
        { type: 'command' as const, message: '$ npm run deploy' },
        { type: 'info' as const, message: 'Deploying to production...' },
        { type: 'info' as const, message: 'Uploading files to server...' },
        { type: 'info' as const, message: 'Files uploaded: 156/156' },
        { type: 'success' as const, message: 'Deployment successful!' },
        { type: 'success' as const, message: `Pipeline ${pipelineName} completed successfully` }
      ];

      setLogs(prev => {
        if (prev.length >= initialLogs.length + sampleLogs.length) {
          clearInterval(logInterval);
          setIsRunning(false);
          return prev;
        }

        const nextLog = sampleLogs[prev.length - initialLogs.length];
        if (nextLog) {
          return [...prev, {
            timestamp: new Date().toISOString(),
            ...nextLog
          }];
        }
        return prev;
      });
    }, 800);

    return () => clearInterval(logInterval);
  }, [isOpen, executionId, pipelineName]);

  if (!isOpen) return null;

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getLogColor = (type: string) => {
    switch (type) {
      case 'success': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'command': return 'text-cyan-400';
      default: return 'text-gray-300';
    }
  };

  const getLogPrefix = (type: string) => {
    switch (type) {
      case 'success': return '✓';
      case 'error': return '✗';
      case 'command': return '>';
      default: return '•';
    }
  };

  const downloadLogs = () => {
    const logText = logs
      .map(log => `[${formatTime(log.timestamp)}] ${getLogPrefix(log.type)} ${log.message}`)
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
      .map(log => `[${formatTime(log.timestamp)}] ${getLogPrefix(log.type)} ${log.message}`)
      .join('\n');

    navigator.clipboard.writeText(logText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStop = () => {
    setIsRunning(false);
    setLogs(prev => [...prev, {
      timestamp: new Date().toISOString(),
      type: 'error',
      message: 'Pipeline execution stopped by user'
    }]);
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
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center space-x-2 transition-colors"
              >
                <Square className="h-4 w-4" />
                <span>Stop</span>
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
        <div
          ref={logsContainerRef}
          className="flex-1 overflow-y-auto p-6 bg-black font-mono text-sm"
          style={{ fontFamily: 'Consolas, Monaco, "Courier New", monospace' }}
        >
          {logs.map((log, index) => (
            <div key={index} className="flex space-x-3 mb-2">
              <span className="text-gray-600 flex-shrink-0">
                {formatTime(log.timestamp)}
              </span>
              <span className={`flex-shrink-0 ${getLogColor(log.type)}`}>
                {getLogPrefix(log.type)}
              </span>
              <span className={getLogColor(log.type)}>
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