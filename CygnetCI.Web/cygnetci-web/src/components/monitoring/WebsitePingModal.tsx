// src/components/monitoring/WebsitePingModal.tsx

import React, { useState, useEffect } from 'react';
import { X, Globe, CheckCircle, XCircle, RefreshCw, Clock } from 'lucide-react';

interface WebsitePing {
  url: string;
  name: string;
  status: string;
  response_time_ms: number;
  last_checked: string;
}

interface WebsitePingModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentUuid: string;
  agentName: string;
}

export const WebsitePingModal: React.FC<WebsitePingModalProps> = ({
  isOpen,
  onClose,
  agentUuid,
  agentName
}) => {
  const [pings, setPings] = useState<WebsitePing[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPings = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `http://127.0.0.1:8000/monitoring/agents/${agentUuid}/website-ping`
      );
      if (response.ok) {
        const data = await response.json();
        setPings(data);
      }
    } catch (error) {
      console.error('Failed to fetch website pings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPings();
      const interval = setInterval(fetchPings, 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    }
  }, [isOpen, agentUuid]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Website/API Ping Status</h2>
            <p className="text-sm text-gray-600 mt-1">Agent: {agentName}</p>
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
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Auto-refreshing every 10 seconds
            </p>
            <button
              onClick={fetchPings}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh Now
            </button>
          </div>
        </div>

        {/* Pings List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && pings.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : pings.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-500">
              <p>No ping endpoints configured</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pings.map((ping, index) => {
                const isHealthy = ping.status === 'healthy';
                const responseColor =
                  ping.response_time_ms < 100 ? 'text-green-600' :
                  ping.response_time_ms < 500 ? 'text-yellow-600' :
                  'text-red-600';

                return (
                  <div
                    key={index}
                    className={`border-2 rounded-lg p-4 transition-all ${
                      isHealthy
                        ? 'border-green-200 bg-green-50'
                        : 'border-red-200 bg-red-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        {isHealthy ? (
                          <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0 mt-1" />
                        ) : (
                          <XCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-1" />
                        )}
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900">{ping.name}</h4>
                          <p className="text-sm text-gray-600 mt-1 font-mono">{ping.url}</p>
                          <div className="flex items-center gap-4 mt-2">
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4 text-gray-500" />
                              <span className={`text-sm font-semibold ${responseColor}`}>
                                {ping.response_time_ms}ms
                              </span>
                            </div>
                            <span className="text-xs text-gray-500">
                              Last checked: {new Date(ping.last_checked).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          isHealthy
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {ping.status.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {/* Response Time Bar */}
                    <div className="mt-3">
                      <div className="w-full bg-gray-300 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            ping.response_time_ms < 100 ? 'bg-green-500' :
                            ping.response_time_ms < 500 ? 'bg-yellow-500' :
                            'bg-red-500'
                          }`}
                          style={{
                            width: `${Math.min((ping.response_time_ms / 1000) * 100, 100)}%`
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Total: {pings.length} |
              Healthy: {pings.filter(p => p.status === 'healthy').length} |
              Down: {pings.filter(p => p.status !== 'healthy').length}
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
