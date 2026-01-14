// src/components/monitoring/MetricDetailModal.tsx

import React, { useState, useEffect } from 'react';
import { X, Calendar, TrendingUp, RefreshCw, Trash2, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';

interface MetricHistory {
  id?: number;
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
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [deleteMode, setDeleteMode] = useState(false);
  const [deleteStartDate, setDeleteStartDate] = useState('');
  const [deleteEndDate, setDeleteEndDate] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      let url = `http://127.0.0.1:8000/monitoring/agents/${agentUuid}/metrics/history`;

      if (useCustomRange && startDate && endDate) {
        url += `?start_date=${startDate}&end_date=${endDate}`;
      } else {
        url += `?hours=${timeRange}`;
      }

      const response = await fetch(url);
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

  const handleDeleteRange = async () => {
    if (!deleteStartDate || !deleteEndDate) {
      alert('Please select both start and end dates for deletion');
      return;
    }

    const startDateTime = new Date(deleteStartDate);
    const endDateTime = new Date(deleteEndDate);

    if (startDateTime >= endDateTime) {
      alert('Start date must be before end date');
      return;
    }

    if (!confirm(`Are you sure you want to delete all metrics between ${startDateTime.toLocaleString()} and ${endDateTime.toLocaleString()}?\n\nThis action cannot be undone.`)) {
      return;
    }

    setDeleting(true);
    try {
      const url = `http://127.0.0.1:8000/monitoring/agents/${agentUuid}/metrics/history?start_date=${startDateTime.toISOString()}&end_date=${endDateTime.toISOString()}`;

      const response = await fetch(url, {
        method: 'DELETE'
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Successfully deleted ${result.deleted_count} metrics`);
        setDeleteMode(false);
        setDeleteStartDate('');
        setDeleteEndDate('');
        fetchHistory();
      } else {
        const error = await response.json();
        alert(`Failed to delete metrics: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to delete metrics:', error);
      alert('Failed to delete metrics');
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, agentUuid, timeRange, useCustomRange, startDate, endDate]);

  useEffect(() => {
    if (timeRange === 0) {
      setUseCustomRange(true);
      // Set default range to last 24 hours
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      setStartDate(yesterday.toISOString().slice(0, 16));
      setEndDate(now.toISOString().slice(0, 16));
    } else {
      setUseCustomRange(false);
      setStartDate('');
      setEndDate('');
    }
  }, [timeRange]);

  if (!isOpen) return null;

  const getMetricLabel = () => {
    switch (metricType) {
      case 'cpu': return 'CPU Usage';
      case 'memory': return 'Memory Usage';
      case 'disk': return 'Disk Usage';
      default: return 'Metric';
    }
  };

  const getMetricColor = () => {
    switch (metricType) {
      case 'cpu': return 'bg-blue-500';
      case 'memory': return 'bg-green-500';
      case 'disk': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  // Calculate chart dimensions and data points
  const chartData = history.slice(-50); // Last 50 points for the chart
  const maxValue = Math.max(...chartData.map(h => h[metricType]), 100);
  const chartHeight = 200;
  const chartWidth = 800;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const points = chartData.map((item, index) => {
    const x = padding.left + (index / (chartData.length - 1 || 1)) * innerWidth;
    const y = padding.top + (1 - item[metricType] / maxValue) * innerHeight;
    return { x, y, value: item[metricType], timestamp: item.timestamp };
  });

  const totalPages = Math.ceil(history.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentData = history.slice(startIndex, endIndex);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-3 flex items-center justify-between border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{getMetricLabel()} Details</h2>
            <p className="text-gray-600 text-xs mt-0.5">{agentName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Controls */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-gray-600" />
              <select
                value={timeRange}
                onChange={(e) => {
                  setTimeRange(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              >
                <option value={1}>Last 1 Hour</option>
                <option value={6}>Last 6 Hours</option>
                <option value={12}>Last 12 Hours</option>
                <option value={24}>Last 24 Hours</option>
                <option value={0}>Custom Range</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setDeleteMode(!deleteMode)}
                className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors ${
                  deleteMode
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Trash2 className="h-4 w-4" />
                <span>{deleteMode ? 'Cancel' : 'Delete Old Data'}</span>
              </button>

              <button
                onClick={fetchHistory}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center space-x-2 transition-colors"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Custom Date Range for Viewing */}
          {useCustomRange && !deleteMode && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate.split('T')[0]}
                  onChange={(e) => {
                    const time = startDate.split('T')[1] || '00:00';
                    setStartDate(`${e.target.value}T${time}`);
                  }}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                />
                <input
                  type="time"
                  value={startDate.split('T')[1] || '00:00'}
                  onChange={(e) => {
                    const date = startDate.split('T')[0] || new Date().toISOString().split('T')[0];
                    setStartDate(`${date}T${e.target.value}`);
                  }}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                />
              </div>
              <span className="text-gray-600 font-medium">to</span>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={endDate.split('T')[0]}
                  onChange={(e) => {
                    const time = endDate.split('T')[1] || '23:59';
                    setEndDate(`${e.target.value}T${time}`);
                  }}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                />
                <input
                  type="time"
                  value={endDate.split('T')[1] || '23:59'}
                  onChange={(e) => {
                    const date = endDate.split('T')[0] || new Date().toISOString().split('T')[0];
                    setEndDate(`${date}T${e.target.value}`);
                  }}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                />
              </div>
            </div>
          )}

          {/* Delete Mode Panel */}
          {deleteMode && (
            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-red-900">Delete Metrics by Date Range</h3>
                  <p className="text-sm text-red-700 mt-1">Select start and end date/time to permanently delete metrics.</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date & Time</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={deleteStartDate.split('T')[0] || ''}
                      onChange={(e) => {
                        const time = deleteStartDate.split('T')[1] || '00:00';
                        setDeleteStartDate(`${e.target.value}T${time}`);
                      }}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent text-gray-900 bg-white"
                    />
                    <input
                      type="time"
                      value={deleteStartDate.split('T')[1] || '00:00'}
                      onChange={(e) => {
                        const date = deleteStartDate.split('T')[0] || new Date().toISOString().split('T')[0];
                        setDeleteStartDate(`${date}T${e.target.value}`);
                      }}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent text-gray-900 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date & Time</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={deleteEndDate.split('T')[0] || ''}
                      onChange={(e) => {
                        const time = deleteEndDate.split('T')[1] || '23:59';
                        setDeleteEndDate(`${e.target.value}T${time}`);
                      }}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent text-gray-900 bg-white"
                    />
                    <input
                      type="time"
                      value={deleteEndDate.split('T')[1] || '23:59'}
                      onChange={(e) => {
                        const date = deleteEndDate.split('T')[0] || new Date().toISOString().split('T')[0];
                        setDeleteEndDate(`${date}T${e.target.value}`);
                      }}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent text-gray-900 bg-white"
                    />
                  </div>
                </div>

                <button
                  onClick={handleDeleteRange}
                  disabled={!deleteStartDate || !deleteEndDate || deleting}
                  className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      <span>Delete Metrics</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Chart */}
          {!deleteMode && (
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                  {getMetricLabel()} Trend
                </h3>
                <div className="text-sm text-gray-600">
                  Showing last {chartData.length} data points
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center h-[200px]">
                  <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex items-center justify-center h-[200px] text-gray-500">
                  No data available
                </div>
              ) : (
                <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="overflow-visible">
                  {/* Grid lines */}
                  {[0, 25, 50, 75, 100].map(val => {
                    const y = padding.top + (1 - val / maxValue) * innerHeight;
                    return (
                      <g key={val}>
                        <line
                          x1={padding.left}
                          y1={y}
                          x2={chartWidth - padding.right}
                          y2={y}
                          stroke="#f3f4f6"
                          strokeWidth="1"
                        />
                        <text
                          x={padding.left - 10}
                          y={y + 4}
                          textAnchor="end"
                          fontSize="12"
                          fill="#9ca3af"
                        >
                          {val}%
                        </text>
                      </g>
                    );
                  })}

                  {/* Column chart bars */}
                  {chartData.map((item, index) => {
                    const barWidth = Math.max(3, innerWidth / chartData.length - 2);
                    const x = padding.left + (index / chartData.length) * innerWidth;
                    const barHeight = (item[metricType] / maxValue) * innerHeight;
                    const y = padding.top + innerHeight - barHeight;

                    return (
                      <g key={index}>
                        <rect
                          x={x}
                          y={y}
                          width={barWidth}
                          height={barHeight}
                          fill={
                            metricType === 'cpu' ? '#3b82f6' :
                            metricType === 'memory' ? '#10b981' :
                            '#a855f7'
                          }
                          opacity="0.8"
                          rx="2"
                        >
                          <title>{`${new Date(item.timestamp).toLocaleString()}: ${item[metricType]}%`}</title>
                        </rect>
                      </g>
                    );
                  })}

                  {/* X-axis */}
                  <line
                    x1={padding.left}
                    y1={chartHeight - padding.bottom}
                    x2={chartWidth - padding.right}
                    y2={chartHeight - padding.bottom}
                    stroke="#d1d5db"
                    strokeWidth="1"
                  />

                  {/* Y-axis */}
                  <line
                    x1={padding.left}
                    y1={padding.top}
                    x2={padding.left}
                    y2={chartHeight - padding.bottom}
                    stroke="#d1d5db"
                    strokeWidth="1"
                  />
                </svg>
              )}
            </div>
          )}

          {/* Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Records</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{history.length}</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Average</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">
                {history.length > 0
                  ? Math.round(history.reduce((sum, h) => sum + h[metricType], 0) / history.length)
                  : 0}%
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Maximum</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">
                {history.length > 0 ? Math.max(...history.map(h => h[metricType])) : 0}%
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Minimum</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">
                {history.length > 0 ? Math.min(...history.map(h => h[metricType])) : 0}%
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center p-12">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center p-12">
                <TrendingUp className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No data available</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">
                          Timestamp
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wide">
                          CPU %
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wide">
                          Memory %
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wide">
                          Disk %
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {currentData.map((record, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {new Date(record.timestamp).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                              record.cpu >= 80 ? 'bg-red-100 text-red-700' :
                              record.cpu >= 60 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {record.cpu}%
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                              record.memory >= 80 ? 'bg-red-100 text-red-700' :
                              record.memory >= 60 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {record.memory}%
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                              record.disk >= 80 ? 'bg-red-100 text-red-700' :
                              record.disk >= 60 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {record.disk}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
                  <div className="text-sm text-gray-600">
                    Showing {startIndex + 1} to {Math.min(endIndex, history.length)} of {history.length} entries
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-gray-700 font-medium"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }

                        return (
                          <button
                            key={i}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                              currentPage === pageNum
                                ? 'bg-blue-500 text-white'
                                : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-gray-700 font-medium"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
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
