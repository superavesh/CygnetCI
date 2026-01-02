// src/components/agents/AgentLogsModal.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { X, Download, RefreshCw, AlertCircle, CheckCircle, Info, XCircle, Filter } from 'lucide-react';
import type { Agent } from '@/types';

interface LogEntry {
  id: number;
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  details?: string;
}

interface AgentLogsModalProps {
  isOpen: boolean;
  agent: Agent | null;
  onClose: () => void;
}

export const AgentLogsModal: React.FC<AgentLogsModalProps> = ({ isOpen, agent, onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Function to generate sample logs - MOVED BEFORE useEffect
  const generateSampleLogs = (agent: Agent): LogEntry[] => {
    const now = new Date();
    const logs: LogEntry[] = [];

    for (let i = 0; i < 20; i++) {
      const timestamp = new Date(now.getTime() - i * 60000); // Each log 1 minute apart
      const logTypes = [
        {
          level: 'success' as const,
          messages: [
            'Agent heartbeat received',
            'Job execution completed successfully',
            'Health check passed',
            'Connection to server established',
            'Resource monitoring updated'
          ]
        },
        {
          level: 'info' as const,
          messages: [
            `CPU usage at ${agent.cpu}%`,
            `Memory usage at ${agent.memory}%`,
            'Agent status synchronized',
            'Configuration loaded',
            `Active jobs: ${agent.jobs}`
          ]
        },
        {
          level: 'warning' as const,
          messages: [
            'High CPU usage detected',
            'Memory usage approaching limit',
            'Slow response time detected',
            'Connection retry attempt',
            'Job queue filling up'
          ]
        },
        {
          level: 'error' as const,
          messages: [
            'Failed to connect to database',
            'Job execution failed',
            'Timeout error occurred',
            'Authentication failure',
            'Resource allocation failed'
          ]
        }
      ];

      const randomType = logTypes[Math.floor(Math.random() * logTypes.length)];
      const randomMessage = randomType.messages[Math.floor(Math.random() * randomType.messages.length)];

      logs.push({
        id: i,
        timestamp: timestamp.toLocaleTimeString(),
        level: randomType.level,
        message: randomMessage,
        details: randomType.level === 'error' ? 'Stack trace available in detailed logs' : undefined
      });
    }

    return logs;
  };

  // Generate sample logs for the agent
  useEffect(() => {
    if (agent) {
      const sampleLogs = generateSampleLogs(agent);
      setLogs(sampleLogs);
    }
  }, [agent]);

  // Auto-refresh logs
  useEffect(() => {
    if (autoRefresh && agent) {
      const interval = setInterval(() => {
        const newLog: LogEntry = {
          id: Date.now(),
          timestamp: new Date().toLocaleTimeString(),
          level: Math.random() > 0.8 ? 'warning' : 'info',
          message: `Health check completed - CPU: ${agent.cpu}%, Memory: ${agent.memory}%`
        };
        setLogs(prev => [newLog, ...prev].slice(0, 50)); // Keep last 50 logs
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, [autoRefresh, agent]);

  if (!isOpen || !agent) return null;

  const getLogIcon = (level: string) => {
    switch (level) {
      case 'success': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error': return <XCircle className="h-5 w-5 text-red-500" />;
      case 'warning': return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      default: return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getLogBgColor = (level: string) => {
    switch (level) {
      case 'success': return 'bg-green-50 border-green-200';
      case 'error': return 'bg-red-50 border-red-200';
      case 'warning': return 'bg-yellow-50 border-yellow-200';
      default: return 'bg-blue-50 border-blue-200';
    }
  };

  const filteredLogs = filterLevel === 'all' 
    ? logs 
    : logs.filter(log => log.level === filterLevel);

  const downloadLogs = () => {
    const logText = filteredLogs
      .map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`)
      .join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-${agent.id}-logs-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Agent Health Logs</h2>
            <p className="text-sm text-gray-500 mt-1">{agent.name} - {agent.location}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Controls */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center space-x-3">
              {/* Filter */}
              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <select
                  value={filterLevel}
                  onChange={(e) => setFilterLevel(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="all">All Levels</option>
                  <option value="info">Info</option>
                  <option value="success">Success</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                </select>
              </div>

              {/* Stats */}
              <div className="flex items-center space-x-3 text-sm">
                <span className="text-gray-600">Total: <strong>{filteredLogs.length}</strong></span>
                <span className="text-red-600">Errors: <strong>{logs.filter(l => l.level === 'error').length}</strong></span>
                <span className="text-yellow-600">Warnings: <strong>{logs.filter(l => l.level === 'warning').length}</strong></span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {/* Auto Refresh */}
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-3 py-1 rounded-lg text-sm flex items-center space-x-2 transition-colors ${
                  autoRefresh 
                    ? 'bg-green-600 text-white border border-green-300' 
                    : 'bg-gray-100 text-gray-600 border border-gray-300'
                }`}
              >
                <RefreshCw className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
                <span>{autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}</span>
              </button>

              {/* Download */}
              <button
                onClick={downloadLogs}
                className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm flex items-center space-x-2 transition-colors"
              >
                <Download className="h-4 w-4" />
                <span>Download</span>
              </button>
            </div>
          </div>
        </div>

        {/* Logs List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <Info className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">No logs found for the selected filter</p>
            </div>
          ) : (
            filteredLogs.map(log => (
              <div
                key={log.id}
                className={`border rounded-lg p-4 ${getLogBgColor(log.level)} transition-all hover:shadow-md`}
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {getLogIcon(log.level)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-500">{log.timestamp}</span>
                      <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
                        log.level === 'success' ? 'bg-green-200 text-green-800' :
                        log.level === 'error' ? 'bg-red-200 text-red-800' :
                        log.level === 'warning' ? 'bg-yellow-200 text-yellow-800' :
                        'bg-blue-200 text-blue-800'
                      }`}>
                        {log.level}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 font-medium">{log.message}</p>
                    {log.details && (
                      <p className="text-xs text-gray-600 mt-1">{log.details}</p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};