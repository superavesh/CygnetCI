// src/components/monitoring/WindowsServicesModal.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { X, Play, Square, RefreshCw, CheckCircle, XCircle, FileText, Loader, Search } from 'lucide-react';
import { ServiceLogsModal } from './ServiceLogsModal';
import { CONFIG } from '@/lib/config';

interface WindowsService {
  name: string;
  display_name: string;
  status: string;
  description: string;
}

interface WindowsServicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentUuid: string;
  agentName: string;
}

export const WindowsServicesModal: React.FC<WindowsServicesModalProps> = ({
  isOpen,
  onClose,
  agentUuid,
  agentName
}) => {
  const [services, setServices] = useState<WindowsService[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'stopped'>('all');

  // Log viewer state
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedService, setSelectedService] = useState<WindowsService | null>(null);

  const fetchServices = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${CONFIG.api.baseUrl}/monitoring/agents/${agentUuid}/windows-services`
      );
      if (response.ok) {
        const data = await response.json();
        setServices(data);
      }
    } catch (error) {
      console.error('Failed to fetch Windows services:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleServiceControl = async (serviceName: string, action: 'start' | 'stop') => {
    setActionLoading(serviceName);
    try {
      const response = await fetch(
        `${CONFIG.api.baseUrl}/monitoring/agents/${agentUuid}/windows-services/control?service_name=${serviceName}&action=${action}`,
        { method: 'POST' }
      );

      if (response.ok) {
        // Refresh services after action
        setTimeout(() => {
          fetchServices();
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to control service:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewLogs = (service: WindowsService) => {
    setSelectedService(service);
    setShowLogsModal(true);
  };

  useEffect(() => {
    if (isOpen) {
      fetchServices();
      setSearchQuery('');
      setStatusFilter('all');
    }
  }, [isOpen, agentUuid]);

  const filteredServices = useMemo(() => {
    return services.filter(service => {
      // Status filter
      if (statusFilter !== 'all' && service.status.toLowerCase() !== statusFilter) {
        return false;
      }
      // Search filter - match against name, display_name, or description
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          service.name.toLowerCase().includes(query) ||
          service.display_name.toLowerCase().includes(query) ||
          (service.description && service.description.toLowerCase().includes(query))
        );
      }
      return true;
    });
  }, [services, searchQuery, statusFilter]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Windows Services (CI*)</h2>
              <p className="text-sm text-gray-600 mt-1">Agent: {agentName}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Controls & Filters */}
          <div className="p-4 border-b border-gray-200 bg-gray-50 space-y-3">
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  style={{ color: '#111827', backgroundColor: '#ffffff' }}
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'running' | 'stopped')}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                style={{ color: '#111827', backgroundColor: '#ffffff' }}
              >
                <option value="all">All Status</option>
                <option value="running">Running</option>
                <option value="stopped">Stopped</option>
              </select>

              {/* Refresh */}
              <button
                onClick={fetchServices}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Showing {filteredServices.length} of {services.length} services
            </p>
          </div>

          {/* Services List */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : services.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <XCircle className="h-12 w-12 mb-3" />
                <p className="text-lg font-medium">No CI services found</p>
                <p className="text-sm">No Windows services starting with "CI" are installed</p>
              </div>
            ) : filteredServices.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <Search className="h-12 w-12 mb-3" />
                <p className="text-lg font-medium">No matching services</p>
                <p className="text-sm">Try adjusting your search or filter</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredServices.map((service) => {
                  const isRunning = service.status.toLowerCase() === 'running';
                  const isLoading = actionLoading === service.name;

                  return (
                    <div
                      key={service.name}
                      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          {isRunning ? (
                            <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                          ) : (
                            <XCircle className="h-6 w-6 text-red-500 flex-shrink-0 mt-1" />
                          )}
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">{service.display_name}</h4>
                            <p className="text-sm text-gray-600 mt-1">{service.name}</p>
                            <p className="text-sm text-gray-500 mt-1">{service.description}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            isRunning
                              ? 'bg-green-600 text-white'
                              : 'bg-red-600 text-white'
                          }`}>
                            {service.status}
                          </span>

                          {isRunning ? (
                            <button
                              onClick={() => handleServiceControl(service.name, 'stop')}
                              disabled={isLoading}
                              className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                              title="Stop service"
                            >
                              {isLoading ? (
                                <Loader className="h-4 w-4 animate-spin" />
                              ) : (
                                <Square className="h-4 w-4" />
                              )}
                              <span className="text-sm">Stop</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleServiceControl(service.name, 'start')}
                              disabled={isLoading}
                              className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                              title="Start service"
                            >
                              {isLoading ? (
                                <Loader className="h-4 w-4 animate-spin" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                              <span className="text-sm">Start</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleViewLogs(service)}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                            title="View logs"
                          >
                            <FileText className="h-4 w-4" />
                            <span className="text-sm">Logs</span>
                          </button>
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
                Total: {services.length} |
                Running: {services.filter(s => s.status.toLowerCase() === 'running').length} |
                Stopped: {services.filter(s => s.status.toLowerCase() === 'stopped').length}
                {filteredServices.length !== services.length && (
                  <span> | Showing: {filteredServices.length}</span>
                )}
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

      {/* Service Logs Modal */}
      {selectedService && (
        <ServiceLogsModal
          isOpen={showLogsModal}
          onClose={() => {
            setShowLogsModal(false);
            setSelectedService(null);
          }}
          agentUuid={agentUuid}
          agentName={agentName}
          serviceName={selectedService.name}
          serviceDisplayName={selectedService.display_name}
        />
      )}
    </>
  );
};
