// src/components/monitoring/DriveInfoModal.tsx

import React, { useState, useEffect } from 'react';
import { X, HardDrive, RefreshCw } from 'lucide-react';

interface DriveInfo {
  letter: string;
  label: string;
  total_gb: number;
  used_gb: number;
  free_gb: number;
  percent_used: number;
}

interface DriveInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentUuid: string;
  agentName: string;
}

export const DriveInfoModal: React.FC<DriveInfoModalProps> = ({
  isOpen,
  onClose,
  agentUuid,
  agentName
}) => {
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDrives = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `http://127.0.0.1:8000/monitoring/agents/${agentUuid}/drive-info`
      );
      if (response.ok) {
        const data = await response.json();
        setDrives(data);
      }
    } catch (error) {
      console.error('Failed to fetch drive info:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDrives();
    }
  }, [isOpen, agentUuid]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Drive Information</h2>
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
          <div className="flex items-center justify-end">
            <button
              onClick={fetchDrives}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Drives List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : drives.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-500">
              <p>No drive information available</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {drives.map((drive) => (
                <div
                  key={drive.letter}
                  className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-6"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <HardDrive className="h-8 w-8 text-orange-600" />
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">{drive.letter}</h3>
                        <p className="text-sm text-gray-600">{drive.label}</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      drive.percent_used >= 80 ? 'bg-red-200 text-red-800' :
                      drive.percent_used >= 60 ? 'bg-yellow-200 text-yellow-800' :
                      'bg-green-200 text-green-800'
                    }`}>
                      {drive.percent_used}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="w-full bg-gray-300 rounded-full h-6 overflow-hidden">
                      <div
                        className={`h-6 rounded-full transition-all flex items-center justify-end pr-2 ${
                          drive.percent_used >= 80 ? 'bg-red-600' :
                          drive.percent_used >= 60 ? 'bg-yellow-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${drive.percent_used}%` }}
                      >
                        <span className="text-xs font-semibold text-white">
                          {drive.percent_used >= 20 ? `${drive.used_gb} GB` : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white bg-opacity-70 rounded-lg p-3">
                      <p className="text-xs text-gray-600">Total</p>
                      <p className="text-lg font-bold text-gray-900">{drive.total_gb} GB</p>
                    </div>
                    <div className="bg-white bg-opacity-70 rounded-lg p-3">
                      <p className="text-xs text-gray-600">Used</p>
                      <p className="text-lg font-bold text-orange-600">{drive.used_gb} GB</p>
                    </div>
                    <div className="bg-white bg-opacity-70 rounded-lg p-3">
                      <p className="text-xs text-gray-600">Free</p>
                      <p className="text-lg font-bold text-green-600">{drive.free_gb} GB</p>
                    </div>
                  </div>
                </div>
              ))}
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
