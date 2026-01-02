// src/app/releases/page.tsx

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Rocket, Plus, Play, Edit, Trash2, Clock, CheckCircle, XCircle, AlertCircle, ArrowRight, RefreshCw, CheckSquare, History } from 'lucide-react';
import { apiService } from '@/lib/api/apiService';
import type { Release, Environment, ReleaseExecution } from '@/types';
import { CreateReleaseModal } from '@/components/releases/CreateReleaseModal';
import { DeployReleaseModal } from '@/components/releases/DeployReleaseModal';
import { ReleaseExecutionHistoryModal } from '@/components/releases/ReleaseExecutionHistoryModal';
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
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [releaseExecutions, setReleaseExecutions] = useState<Record<number, ReleaseExecution[]>>({});

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [releasesData, environmentsData] = await Promise.all([
        apiService.getReleases(selectedCustomer?.id),
        apiService.getEnvironments()
      ]);
      setReleases(releasesData);
      setEnvironments(environmentsData);

      // Fetch executions for releases that have a latest_execution
      const executionsMap: Record<number, ReleaseExecution[]> = {};
      for (const release of releasesData) {
        if (release.latest_execution) {
          try {
            const executions = await apiService.getReleaseExecutions(release.id);
            executionsMap[release.id] = executions;
          } catch (err) {
            console.error(`Failed to fetch executions for release ${release.id}:`, err);
          }
        }
      }
      setReleaseExecutions(executionsMap);

      setError(null);
    } catch (err) {
      setError('Failed to fetch releases');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedCustomer?.id]); // Use only the ID, not the entire object

  // Initial fetch on mount and when customer changes
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
    if (!confirm('Are you sure you want to delete this release?')) return;

    try {
      await apiService.deleteRelease(releaseId);
      await fetchData();
    } catch (err) {
      alert('Failed to delete release');
      console.error(err);
    }
  };

  const handleApproveStage = async (stageExecutionId: number, environmentName: string) => {
    const approvedBy = prompt(`Approve deployment to ${environmentName}.\n\nEnter your name:`);
    if (!approvedBy) return;

    const comments = prompt('Optional comments:') || undefined;

    try {
      await apiService.approveStage(stageExecutionId, {
        approved_by: approvedBy,
        comments: comments
      });
      await fetchData();
    } catch (err) {
      alert('Failed to approve stage');
      console.error(err);
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'succeeded':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'in_progress':
        return <Clock className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'pending':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'succeeded':
        return 'bg-green-600 text-white border-green-200';
      case 'failed':
        return 'bg-red-600 text-white border-red-200';
      case 'in_progress':
        return 'bg-blue-600 text-white border-blue-200';
      case 'pending':
        return 'bg-amber-600 text-white border-yellow-200';
      default:
        return 'bg-gray-600 text-white border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Rocket className="h-8 w-8 text-blue-600" />
            Releases
          </h1>
          <p className="text-gray-600 mt-1">
            Manage multi-environment deployments
            {selectedCustomer && ` • Filtering for ${selectedCustomer.display_name}`}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Create Release
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {/* Releases Grid */}
      {releases.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Rocket className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No releases yet</h3>
          <p className="text-gray-600 mb-4">Create your first release to deploy across environments</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Create Release
          </button>
        </div>
      ) : (
        <div className="grid gap-6">
          {releases.map((release) => (
            <div
              key={release.id}
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow border border-gray-200"
            >
              <div className="p-6">
                {/* Release Header */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                      {release.name}
                      {release.version && (
                        <span className="text-sm font-normal text-gray-500">v{release.version}</span>
                      )}
                    </h3>
                    {release.description && (
                      <p className="text-gray-600 mt-1">{release.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDeploy(release)}
                      className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-200 transition-colors"
                      title="Deploy Release"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleViewHistory(release)}
                      className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-200 transition-colors"
                      title="View Execution History"
                    >
                      <History className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(release.id)}
                      className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-200 transition-colors"
                      title="Delete Release"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Stages Timeline */}
                {release.stages && release.stages.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      {release.stages
                        .sort((a, b) => a.order_index - b.order_index)
                        .map((stage, idx) => {
                          const env = environments.find(e => e.id === stage.environment_id);
                          return (
                            <React.Fragment key={stage.id}>
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-md">
                                <span className="text-sm font-medium text-blue-900">
                                  {env?.name || `Env ${stage.environment_id}`}
                                </span>
                                {env?.requires_approval && (
                                  <span className="text-xs bg-amber-600 text-white px-1.5 py-0.5 rounded">
                                    Approval
                                  </span>
                                )}
                              </div>
                              {idx < release.stages.length - 1 && (
                                <ArrowRight className="h-4 w-4 text-gray-400" />
                              )}
                            </React.Fragment>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Latest Execution */}
                {release.latest_execution && (
                  <div>
                    <div className={`flex items-center justify-between p-3 rounded-lg border ${getStatusColor(release.latest_execution.status)}`}>
                      <div className="flex items-center gap-3">
                        {getStatusIcon(release.latest_execution.status)}
                        <div>
                          <p className="text-sm font-medium">
                            {release.latest_execution.release_number}
                          </p>
                          <p className="text-xs opacity-75">
                            {release.latest_execution.started_at && new Date(release.latest_execution.started_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-medium uppercase">
                        {release.latest_execution.status}
                      </span>
                    </div>

                    {/* Pending Approvals */}
                    {releaseExecutions[release.id]?.length > 0 && (() => {
                      const latestExecution = releaseExecutions[release.id][0];
                      const pendingStages = latestExecution.stages?.filter(
                        stage => stage.status === 'awaiting_approval' && stage.approval_status === 'pending'
                      ) || [];

                      if (pendingStages.length > 0) {
                        return (
                          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              <AlertCircle className="h-4 w-4 text-yellow-600" />
                              <span className="text-sm font-medium text-yellow-900">
                                Pending Approvals ({pendingStages.length})
                              </span>
                            </div>
                            <div className="space-y-2">
                              {pendingStages.map(stage => (
                                <div key={stage.id} className="flex items-center justify-between bg-white p-2 rounded border border-yellow-200">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-700">{stage.environment_name}</span>
                                  </div>
                                  <button
                                    onClick={() => handleApproveStage(stage.id, stage.environment_name)}
                                    className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                                  >
                                    <CheckSquare className="h-3 w-3" />
                                    Approve
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}

                {/* Metadata */}
                <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                  <span>Created {new Date(release.created_at).toLocaleDateString()}</span>
                  {release.created_by && <span>by {release.created_by}</span>}
                  <span className={`px-2 py-1 rounded ${
                    release.status === 'active' ? 'bg-green-600 text-white' : 'bg-gray-600 text-white'
                  }`}>
                    {release.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
          onSuccess={() => {
            setShowDeployModal(false);
            setSelectedRelease(null);
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
    </div>
  );
}
