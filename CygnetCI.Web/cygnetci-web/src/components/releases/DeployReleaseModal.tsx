// src/components/releases/DeployReleaseModal.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { X, Play, Lock, ArrowRight, CheckCircle, Server } from 'lucide-react';
import { apiService } from '@/lib/api/apiService';
import type { Release, Environment, Pipeline, Agent } from '@/types';

interface DeployReleaseModalProps {
  release: Release;
  onClose: () => void;
  onSuccess: (executionId: number) => void;
}

export const DeployReleaseModal: React.FC<DeployReleaseModalProps> = ({ release, onClose, onSuccess }) => {
  const [triggeredBy, setTriggeredBy] = useState('');
  const [artifactVersion, setArtifactVersion] = useState('');
  const [parameters, setParameters] = useState<Record<string, any>>({});
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [envsData, agentsData] = await Promise.all([
        apiService.getEnvironments(),
        apiService.getAgents()
      ]);
      setEnvironments(envsData);
      setAgents(agentsData.filter((agent: Agent) => agent.status === 'online'));

      if (release.pipeline_id) {
        const pipelinesData = await apiService.getPipelines();
        const pipelineData = pipelinesData.find((p: any) => p.id === release.pipeline_id);
        if (pipelineData) {
          setPipeline(pipelineData);
          // Initialize parameters with default values
          if (pipelineData.parameters) {
            const initialParams: Record<string, any> = {};
            pipelineData.parameters.forEach((param: any) => {
              initialParams[param.name] = param.defaultValue || '';
            });
            setParameters(initialParams);
          }
        }
      }
    } catch (err) {
      setError('Failed to load data');
      console.error(err);
    }
  };

  const handleParameterChange = (paramName: string, value: any) => {
    setParameters({
      ...parameters,
      [paramName]: value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!triggeredBy.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!selectedAgentId) {
      setError('Please select an agent to execute the deployment');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await apiService.deployRelease(release.id, {
        triggered_by: triggeredBy.trim(),
        artifact_version: artifactVersion.trim() || undefined,
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
        agent_id: selectedAgentId
      });

      // Pass the execution ID to the parent component
      if (result && result.release_execution_id) {
        onSuccess(result.release_execution_id);
      } else {
        onSuccess(0);
      }
    } catch (err) {
      setError('Failed to deploy release');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b bg-gradient-to-r from-green-50 to-blue-50">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Play className="h-6 w-6 text-green-600" />
              Deploy Release
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {release.name} {release.version && `v${release.version}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              {error}
            </div>
          )}

          {/* Pipelines or Stages Preview */}
          <div className="space-y-3">
            {release.pipelines && release.pipelines.length > 0 ? (
              <>
                <h3 className="text-sm font-semibold text-gray-700 uppercase">Pipelines to Execute</h3>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    {release.pipelines
                      .sort((a, b) => a.order_index - b.order_index)
                      .map((rp, idx) => {
                        return (
                          <React.Fragment key={rp.id}>
                            <div className="flex flex-col items-center">
                              <div className={`px-4 py-2 rounded-lg border-2 ${
                                rp.execution_mode === 'parallel'
                                  ? 'bg-purple-50 border-purple-400'
                                  : 'bg-blue-50 border-blue-400'
                              }`}>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900">
                                    {rp.pipeline?.name || `Pipeline ${rp.pipeline_id}`}
                                  </span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                                    rp.execution_mode === 'parallel'
                                      ? 'bg-purple-600 text-white'
                                      : 'bg-blue-600 text-white'
                                  }`}>
                                    {rp.execution_mode === 'parallel' ? '||' : '→'}
                                  </span>
                                </div>
                              </div>
                              <span className="text-xs text-gray-600 mt-1">#{rp.order_index + 1}</span>
                            </div>
                            {idx < release.pipelines.length - 1 && (
                              <ArrowRight className="h-5 w-5 text-gray-400" />
                            )}
                          </React.Fragment>
                        );
                      })}
                  </div>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-gray-700 uppercase">Deployment Stages</h3>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    {release.stages
                      .sort((a, b) => a.order_index - b.order_index)
                      .map((stage, idx) => {
                        const env = environments.find(e => e.id === stage.environment_id);
                        const requiresApproval = stage.pre_deployment_approval || stage.post_deployment_approval || env?.requires_approval;

                        return (
                          <React.Fragment key={stage.id}>
                            <div className="flex flex-col items-center">
                              <div className={`px-4 py-2 rounded-lg border-2 ${
                                requiresApproval
                                  ? 'bg-yellow-50 border-yellow-400'
                                  : 'bg-green-50 border-green-400'
                              }`}>
                                <div className="flex items-center gap-2">
                                  {requiresApproval && <Lock className="h-4 w-4 text-yellow-600" />}
                                  <span className="text-sm font-medium text-gray-900">
                                    {env?.name || `Environment ${stage.environment_id}`}
                                  </span>
                                </div>
                              </div>
                              {requiresApproval && (
                                <span className="text-xs text-yellow-700 mt-1">Approval Required</span>
                              )}
                            </div>
                            {idx < release.stages.length - 1 && (
                              <ArrowRight className="h-5 w-5 text-gray-400" />
                            )}
                          </React.Fragment>
                        );
                      })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Pipeline Parameters */}
          {pipeline && pipeline.parameters && pipeline.parameters.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase">Pipeline Parameters</h3>
              <div className="space-y-3">
                {pipeline.parameters.map((param: any) => (
                  <div key={param.name}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {param.name}
                      {param.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {param.description && (
                      <p className="text-xs text-gray-500 mb-1">{param.description}</p>
                    )}

                    {param.type === 'choice' && param.choices ? (
                      <select
                        value={parameters[param.name] || ''}
                        onChange={(e) => handleParameterChange(param.name, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                        required={param.required}
                      >
                        <option value="">Select...</option>
                        {param.choices.map((choice: string) => (
                          <option key={choice} value={choice}>{choice}</option>
                        ))}
                      </select>
                    ) : param.type === 'boolean' ? (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={parameters[param.name] === 'true' || parameters[param.name] === true}
                          onChange={(e) => handleParameterChange(param.name, e.target.checked.toString())}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-600">Enable</span>
                      </label>
                    ) : param.type === 'number' ? (
                      <input
                        type="number"
                        value={parameters[param.name] || ''}
                        onChange={(e) => handleParameterChange(param.name, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                        required={param.required}
                      />
                    ) : (
                      <input
                        type="text"
                        value={parameters[param.name] || ''}
                        onChange={(e) => handleParameterChange(param.name, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                        required={param.required}
                        placeholder={param.defaultValue}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deployment Settings */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase">Deployment Settings</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Agent <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedAgentId || ''}
                onChange={(e) => setSelectedAgentId(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                required
              >
                <option value="">Select an agent...</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} - {agent.location} ({agent.status})
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {agents.length === 0 ? (
                  <span className="text-yellow-600">⚠ No online agents available</span>
                ) : (
                  <>Choose which agent will execute this deployment</>
                )}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Artifact Version (Optional)
              </label>
              <input
                type="text"
                value={artifactVersion}
                onChange={(e) => setArtifactVersion(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                placeholder="v1.0.0-build.123"
              />
              <p className="text-xs text-gray-500 mt-1">Specify the artifact version to deploy</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Triggered By <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={triggeredBy}
                onChange={(e) => setTriggeredBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                placeholder="Your name"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Your name for audit purposes</p>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-900">
                <p className="font-medium mb-1">Ready to deploy</p>
                {release.pipelines && release.pipelines.length > 0 ? (
                  <p>
                    This release will execute {release.pipelines.length} pipeline(s) on the selected agent.
                    Pipelines will run in {release.pipelines.some(p => p.execution_mode === 'parallel') ? 'sequential and parallel' : 'sequential'} order as configured.
                  </p>
                ) : (
                  <p>
                    This release will deploy through {release.stages.length} stage(s).
                    Stages requiring approval will pause for manual approval.
                  </p>
                )}
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Play className="h-4 w-4" />
            {loading ? 'Deploying...' : 'Deploy Release'}
          </button>
        </div>
      </div>
    </div>
  );
};
