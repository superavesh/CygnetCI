// src/components/monitoring/MetricDetailModal.tsx

import React, { useState, useEffect } from 'react';
import { X, Calendar, TrendingUp, RefreshCw } from 'lucide-react';

interface MetricHistory {
  timestamp: string;
  cpu: number;
  memory: number;
  disk: number;
}

interface MetricDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentUuid: string;
  agentName: string;
  metricType: 'cpu' | 'memory' | 'disk';
  currentValue: number;
}

export const MetricDetailModal: React.FC<MetricDetailModalProps> = ({
  isOpen,
  onClose,
  agentUuid,
  agentName,
  metricType,
  currentValue
}) => {
  const [history, setHistory] = useState<MetricHistory[]>([]);
  const [timeRange, setTimeRange] = useState(24); // hours
  const [loading, setLoading] = useState(false);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `http://127.0.0.1:8000/monitoring/agents/${agentUuid}/metrics/history?hours=${timeRange}`
      );
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, agentUuid, timeRange]);

  if (!isOpen) return null;

  const getMetricData = (m: MetricHistory) => {
    switch (metricType) {
      case 'cpu': return m.cpu;
      case 'memory': return m.memory;
      case 'disk': return m.disk;
    }
  };

  const getMetricColor = () => {
    switch (metricType) {
      case 'cpu': return 'blue';
      case 'memory': return 'purple';
      case 'disk': return 'orange';
    }
  };

  const color = getMetricColor();
  const metricName = metricType.toUpperCase();

  const avgValue = history.length > 0
    ? Math.round(history.reduce((sum, m) => sum + getMetricData(m), 0) / history.length)
    : 0;

  const maxValue = history.length > 0
    ? Math.max(...history.map(m => getMetricData(m)))
    : 0;

  const minValue = history.length > 0
    ? Math.min(...history.map(m => getMetricData(m)))
    : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{metricName} Metrics</h2>
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
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-600" />
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(Number(e.target.value))}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                >
                  <option value={1}>Last Hour</option>
                  <option value={6}>Last 6 Hours</option>
                  <option value={12}>Last 12 Hours</option>
                  <option value={24}>Last 24 Hours</option>
                  <option value={48}>Last 2 Days</option>
                  <option value={168}>Last Week</option>
                </select>
              </div>
            </div>
            <button
              onClick={fetchHistory}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="p-6 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <p className="text-sm text-gray-600 mb-1">Current</p>
              <p className={`text-3xl font-bold text-${color}-600`}>{currentValue}%</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <p className="text-sm text-gray-600 mb-1">Average</p>
              <p className="text-3xl font-bold text-gray-900">{avgValue}%</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <p className="text-sm text-gray-600 mb-1">Maximum</p>
              <p className="text-3xl font-bold text-red-600">{maxValue}%</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <p className="text-sm text-gray-600 mb-1">Minimum</p>
              <p className="text-3xl font-bold text-green-600">{minValue}%</p>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className={`h-5 w-5 text-${color}-600`} />
            <h3 className="text-lg font-semibold text-gray-900">{metricName} Trend Over Time</h3>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-96">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex items-center justify-center h-96 text-gray-500">
              <p>No data available</p>
            </div>
          ) : (
            <div>
              {/* Bar Chart */}
              <div className={`p-6 bg-${color}-50 rounded-lg`}>
                <div className="flex items-end justify-between h-64 gap-1">
                  {history.map((m, i) => {
                    const value = getMetricData(m);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center group">
                        <div
                          className={`w-full bg-${color}-500 rounded-t transition-all hover:bg-${color}-600 relative`}
                          style={{ height: `${value}%`, minHeight: '2px' }}
                          title={`${value}% at ${new Date(m.timestamp).toLocaleString()}`}
                        >
                          <span className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white px-2 py-1 rounded whitespace-nowrap">
                            {value}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Data Table */}
              <div className="mt-6">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Recent Data Points</h4>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-gray-700">Timestamp</th>
                        <th className="px-4 py-2 text-left text-gray-700">{metricName} %</th>
                        <th className="px-4 py-2 text-left text-gray-700">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.slice().reverse().map((m, i) => {
                        const value = getMetricData(m);
                        return (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="px-4 py-2 text-gray-900">
                              {new Date(m.timestamp).toLocaleString()}
                            </td>
                            <td className="px-4 py-2">
                              <span className={`font-semibold ${
                                value >= 80 ? 'text-red-600' :
                                value >= 60 ? 'text-yellow-600' :
                                'text-green-600'
                              }`}>
                                {value}%
                              </span>
                            </td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                value >= 80 ? 'bg-red-100 text-red-800' :
                                value >= 60 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-green-100 text-green-800'
                              }`}>
                                {value >= 80 ? 'Critical' : value >= 60 ? 'Warning' : 'Normal'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
