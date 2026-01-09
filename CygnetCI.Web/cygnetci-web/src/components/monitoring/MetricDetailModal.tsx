// src/components/monitoring/MetricDetailModal.tsx

import React, { useState, useEffect } from 'react';
import { X, Calendar, TrendingUp, RefreshCw, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

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
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

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

  const handleDelete = async () => {
    if (selectedRows.size === 0) {
      alert('Please select rows to delete');
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedRows.size} selected log(s)?`)) {
      return;
    }

    try {
      const deletePromises = Array.from(selectedRows).map(index => {
        const record = history[index];
        return fetch(`http://127.0.0.1:8000/monitoring/agents/${agentUuid}/metrics/${record.timestamp}`, {
          method: 'DELETE'
        });
      });

      await Promise.all(deletePromises);
      setSelectedRows(new Set());
      fetchHistory();
    } catch (error) {
      console.error('Failed to delete logs:', error);
      alert('Failed to delete some logs');
    }
  };

  const toggleRowSelection = (index: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRows(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === history.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(history.map((_, i) => i)));
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
      setSelectedRows(new Set());
    }
  }, [isOpen, agentUuid, timeRange, useCustomRange, startDate, endDate]);

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

  // Pagination logic
  const reversedHistory = history.slice().reverse();
  const totalPages = Math.ceil(reversedHistory.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedHistory = reversedHistory.slice(startIndex, endIndex);

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
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-600" />
                <select
                  value={timeRange}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setTimeRange(value);
                    if (value === 0) {
                      setUseCustomRange(true);
                    } else {
                      setUseCustomRange(false);
                    }
                  }}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[blue-500] focus:border-transparent text-gray-900 bg-white"
                >
                  <option value={1}>Last Hour</option>
                  <option value={6}>Last 6 Hours</option>
                  <option value={12}>Last 12 Hours</option>
                  <option value={24}>Last 24 Hours</option>
                  <option value={48}>Last 2 Days</option>
                  <option value={168}>Last Week</option>
                  <option value={0}>Custom Date Range</option>
                </select>
              </div>

              {useCustomRange && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={startDate.split('T')[0]}
                      onChange={(e) => {
                        const time = startDate.split('T')[1] || '00:00';
                        setStartDate(`${e.target.value}T${time}`);
                      }}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[blue-500] focus:border-transparent text-gray-900 bg-white"
                    />
                    <input
                      type="time"
                      value={startDate.split('T')[1] || '00:00'}
                      onChange={(e) => {
                        const date = startDate.split('T')[0] || new Date().toISOString().split('T')[0];
                        setStartDate(`${date}T${e.target.value}`);
                      }}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[blue-500] focus:border-transparent text-gray-900 bg-white"
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
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[blue-500] focus:border-transparent text-gray-900 bg-white"
                    />
                    <input
                      type="time"
                      value={endDate.split('T')[1] || '23:59'}
                      onChange={(e) => {
                        const date = endDate.split('T')[0] || new Date().toISOString().split('T')[0];
                        setEndDate(`${date}T${e.target.value}`);
                      }}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[blue-500] focus:border-transparent text-gray-900 bg-white"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {selectedRows.size > 0 && (
                <button
                  onClick={handleDelete}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete ({selectedRows.size})
                </button>
              )}
              <button
                onClick={fetchHistory}
                className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
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
              {/* Column Chart */}
              <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 mb-6">
                <div className="flex items-end justify-between gap-1 h-64 border-b border-l border-gray-300 pb-2 pl-2">
                  {history.slice(-20).map((m, i) => {
                    const value = getMetricData(m);
                    const time = new Date(m.timestamp).toLocaleTimeString();
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div className="w-full flex items-end justify-center" style={{ height: '240px' }}>
                          <div
                            className={`w-full rounded-t transition-all relative ${
                              value >= 80 ? 'bg-gradient-to-t from-red-500 to-red-600' :
                              value >= 60 ? 'bg-gradient-to-t from-yellow-500 to-amber-500' :
                              'bg-gradient-to-t from-green-500 to-green-600'
                            }`}
                            style={{ height: `${value}%` }}
                          >
                            <span className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs font-semibold text-gray-700 whitespace-nowrap">
                              {value}%
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-600 transform rotate-45 origin-left whitespace-nowrap mt-2">
                          {time}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-8 flex items-center justify-center gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-gradient-to-t from-green-500 to-green-600"></div>
                    <span className="text-gray-700">Normal (&lt; 60%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-gradient-to-t from-yellow-500 to-amber-500"></div>
                    <span className="text-gray-700">Warning (60-80%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-gradient-to-t from-red-500 to-red-600"></div>
                    <span className="text-gray-700">Critical (&gt;= 80%)</span>
                  </div>
                </div>
              </div>

              {/* Data Table */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-900">Recent Data Points ({history.length} total)</h4>
                  <div className="flex items-center gap-4">
                    {selectedRows.size > 0 && (
                      <span className="text-sm text-gray-600">{selectedRows.size} selected</span>
                    )}
                    <span className="text-sm text-gray-600">
                      Page {currentPage} of {totalPages}
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">
                          <input
                            type="checkbox"
                            checked={selectedRows.size === history.length && history.length > 0}
                            onChange={toggleSelectAll}
                            className="rounded border-gray-300 text-blue-500 focus:ring-[blue-500]"
                          />
                        </th>
                        <th className="px-4 py-2 text-left text-gray-700">Timestamp</th>
                        <th className="px-4 py-2 text-left text-gray-700">{metricName} %</th>
                        <th className="px-4 py-2 text-left text-gray-700">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {paginatedHistory.map((m, i) => {
                        const value = getMetricData(m);
                        const actualIndex = history.length - 1 - (startIndex + i);
                        return (
                          <tr
                            key={i}
                            className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                              selectedRows.has(actualIndex) ? 'bg-blue-50' : ''
                            }`}
                          >
                            <td className="px-4 py-2">
                              <input
                                type="checkbox"
                                checked={selectedRows.has(actualIndex)}
                                onChange={() => toggleRowSelection(actualIndex)}
                                className="rounded border-gray-300 text-blue-500 focus:ring-[blue-500]"
                              />
                            </td>
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
                                value >= 80 ? 'bg-red-600 text-white' :
                                value >= 60 ? 'bg-amber-600 text-white' :
                                'bg-green-600 text-white'
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

                {/* Pagination Controls */}
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-gray-600">
                    Showing {startIndex + 1} to {Math.min(endIndex, history.length)} of {history.length} entries
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
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
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`px-3 py-1.5 border rounded-lg transition-colors font-medium ${
                              currentPage === pageNum
                                ? 'bg-blue-500 text-white border-blue-500'
                                : 'border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900'
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
                      className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
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
