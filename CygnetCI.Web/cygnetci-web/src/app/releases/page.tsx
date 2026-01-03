// src/app/releases/page.tsx

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Rocket, Plus, Play, Trash2, Settings, RefreshCw, History, ArrowRight } from 'lucide-react';
import { apiService } from '@/lib/api/apiService';
import type { Release, Environment, ReleaseExecution } from '@/types';
import { CreateReleaseModal } from '@/components/releases/CreateReleaseModal';
import { DeployReleaseModal } from '@/components/releases/DeployReleaseModal';
import { ReleaseExecutionHistoryModal } from '@/components/releases/ReleaseExecutionHistoryModal';
import { ReleaseExecutionViewModal } from '@/components/releases/ReleaseExecutionViewModal';
import { ReleaseFilter, filterReleases } from '@/components/tables/ReleaseFilter';
import { useCustomer } from '@/lib/contexts/CustomerContext';

export default function ReleasesPage() {
  const { selectedCustomer } = useCustomer();
  const [releases, setReleases] = useState<Release[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showExecutionModal, setShowExecutionModal] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [currentExecutionId, setCurrentExecutionId] = useState<number | null>(null);
  const [filterQuery, setFilterQuery] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [releasesData, environmentsData] = await Promise.all([
        apiService.getReleases(selectedCustomer?.id),
        apiService.getEnvironments()
      ]);
      setReleases(releasesData);
      setEnvironments(environmentsData);
      setError(null);
    } catch (err) {
      setError('Failed to fetch releases');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedCustomer?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDeploy = (release: Release) => {
    setSelectedRelease(release);
    setShowDeployModal(true);
  };

  const handleViewHistory = (release: Release) => {
    setSelectedRelease(release);
    setShowHistoryModal(true);
  };

  const handleDelete = async (releaseId: number) => {
    if (!confirm('Are you sure you want to delete this release? This action cannot be undone.')) {
      return;
    }

    try {
      await apiService.deleteRelease(releaseId);
      await fetchData();
    } catch (err) {
      alert('Failed to delete release');
      console.error(err);
    }
  };

  const getStatusBadge = (status: string) => {
    const classes = {
      active: 'bg-green-600 text-white',
      disabled: 'bg-gray-600 text-white',
      archived: 'bg-orange-600 text-white'
    };
    return classes[status as keyof typeof classes] || 'bg-gray-600 text-white';
  };

  // Apply filters to releases
  const filteredReleases = filterReleases(releases, filterQuery);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Releases</h2>
            <p className="text-sm text-gray-600 mt-1">
              {filteredReleases.length} of {releases.length} releases
              {selectedCustomer && ` • Filtering for ${selectedCustomer.display_name}`}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={fetchData}
              disabled={loading}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>New Release</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        {/* Search Filter */}
        <ReleaseFilter onFilter={setFilterQuery} />

        {/* Releases Table */}
        {filteredReleases.length > 0 ? (
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Release</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Configuration</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredReleases.map(release => {
                    const hasPipelines = release.pipelines && release.pipelines.length > 0;
                    const hasStages = release.stages && release.stages.length > 0;
                    const isPipelineBased = hasPipelines;

                    return (
                      <tr key={release.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <Rocket className="h-5 w-5 text-gray-400 mr-3" />
                            <div>
                              <div className="text-sm font-medium text-gray-900">{release.name}</div>
                              {release.version && (
                                <div className="text-sm text-gray-500">v{release.version}</div>
                              )}
                              {release.description && (
                                <div className="text-xs text-gray-400 mt-1 max-w-xs truncate">{release.description}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            isPipelineBased ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'
                          }`}>
                            {isPipelineBased ? 'Pipeline-Based' : 'Environment-Based'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {isPipelineBased && release.pipelines ? (
                              release.pipelines
                                .sort((a, b) => a.order_index - b.order_index)
                                .slice(0, 3)
                                .map((rp, idx) => (
                                  <React.Fragment key={rp.id}>
                                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                                      rp.execution_mode === 'parallel'
                                        ? 'bg-purple-100 text-purple-800'
                                        : 'bg-blue-100 text-blue-800'
                                    }`}>
                                      <span>{rp.pipeline?.name || `P${rp.pipeline_id}`}</span>
                                      <span className="text-xs">
                                        {rp.execution_mode === 'parallel' ? '||' : '→'}
                                      </span>
                                    </div>
                                    {idx < Math.min(release.pipelines.length, 3) - 1 && (
                                      <ArrowRight className="h-3 w-3 text-gray-400" />
                                    )}
                                  </React.Fragment>
                                ))
                            ) : hasStages && release.stages ? (
                              release.stages
                                .sort((a, b) => a.order_index - b.order_index)
                                .slice(0, 3)
                                .map((stage, idx) => {
                                  const env = environments.find(e => e.id === stage.environment_id);
                                  return (
                                    <React.Fragment key={stage.id}>
                                      <div className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                                        {env?.name || `Env ${stage.environment_id}`}
                                      </div>
                                      {idx < Math.min(release.stages.length, 3) - 1 && (
                                        <ArrowRight className="h-3 w-3 text-gray-400" />
                                      )}
                                    </React.Fragment>
                                  );
                                })
                            ) : (
                              <span className="text-xs text-gray-400">No config</span>
                            )}
                            {isPipelineBased && release.pipelines && release.pipelines.length > 3 && (
                              <span className="text-xs text-gray-500">+{release.pipelines.length - 3} more</span>
                            )}
                            {!isPipelineBased && release.stages && release.stages.length > 3 && (
                              <span className="text-xs text-gray-500">+{release.stages.length - 3} more</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(release.status)}`}>
                            {release.status.charAt(0).toUpperCase() + release.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">
                            {new Date(release.created_at).toLocaleDateString()}
                          </div>
                          {release.created_by && (
                            <div className="text-xs text-gray-400">by {release.created_by}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleDeploy(release)}
                              className="text-green-600 hover:text-green-700 transition-colors"
                              title="Deploy Release"
                            >
                              <Play className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleViewHistory(release)}
                              className="text-blue-600 hover:text-blue-700 transition-colors"
                              title="Execution History"
                            >
                              <History className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(release.id)}
                              className="text-red-600 hover:text-red-700 transition-colors"
                              title="Delete Release"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <Rocket className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-800 mb-2">No releases found</h3>
            <p className="text-gray-600 mb-4">
              {filterQuery
                ? 'Try adjusting your search filters'
                : 'Get started by creating your first release'}
            </p>
            {!filterQuery && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg inline-flex items-center space-x-2 transition-colors"
              >
                <Plus className="h-5 w-5" />
                <span>Create First Release</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateReleaseModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchData();
          }}
        />
      )}

      {showDeployModal && selectedRelease && (
        <DeployReleaseModal
          release={selectedRelease}
          onClose={() => {
            setShowDeployModal(false);
            setSelectedRelease(null);
          }}
          onSuccess={(executionId: number) => {
            setShowDeployModal(false);
            setCurrentExecutionId(executionId);
            setShowExecutionModal(true);
            fetchData();
          }}
        />
      )}

      {showHistoryModal && selectedRelease && (
        <ReleaseExecutionHistoryModal
          isOpen={showHistoryModal}
          onClose={() => {
            setShowHistoryModal(false);
            setSelectedRelease(null);
          }}
          releaseId={selectedRelease.id}
          releaseName={selectedRelease.name}
        />
      )}

      {showExecutionModal && selectedRelease && currentExecutionId && (
        <ReleaseExecutionViewModal
          isOpen={showExecutionModal}
          onClose={() => {
            setShowExecutionModal(false);
            setCurrentExecutionId(null);
            setSelectedRelease(null);
            fetchData();
          }}
          releaseId={selectedRelease.id}
          releaseName={selectedRelease.name}
          executionId={currentExecutionId}
        />
      )}
    </>
  );
}
