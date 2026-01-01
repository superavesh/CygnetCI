// src/components/releases/CreateReleaseModal.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { apiService } from '@/lib/api/apiService';
import type { Environment, Pipeline } from '@/types';
import { useCustomer } from '@/lib/contexts/CustomerContext';

interface CreateReleaseModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface ReleaseStageForm {
  environment_id: number;
  order_index: number;
  pipeline_id?: number;
  pre_deployment_approval: boolean;
  post_deployment_approval: boolean;
  auto_deploy: boolean;
}

export const CreateReleaseModal: React.FC<CreateReleaseModalProps> = ({ onClose, onSuccess }) => {
  const { selectedCustomer } = useCustomer();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('');
  const [pipelineId, setPipelineId] = useState<number | undefined>(undefined);
  const [stages, setStages] = useState<ReleaseStageForm[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [envsData, pipelinesData] = await Promise.all([
        apiService.getEnvironments(),
        apiService.getPipelines()
      ]);
      setEnvironments(envsData);
      setPipelines(pipelinesData);
    } catch (err) {
      setError('Failed to load data');
      console.error(err);
    }
  };

  const addStage = () => {
    const newOrderIndex = stages.length > 0 ? Math.max(...stages.map(s => s.order_index)) + 1 : 1;
    setStages([...stages, {
      environment_id: environments[0]?.id || 1,
      order_index: newOrderIndex,
      pre_deployment_approval: false,
      post_deployment_approval: false,
      auto_deploy: false
    }]);
  };

  const removeStage = (index: number) => {
    setStages(stages.filter((_, i) => i !== index));
  };

  const updateStage = (index: number, field: keyof ReleaseStageForm, value: any) => {
    const updated = [...stages];
    updated[index] = { ...updated[index], [field]: value };
    setStages(updated);
  };

  const moveStage = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === stages.length - 1)
    ) {
      return;
    }

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...stages];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];

    // Update order_index
    updated.forEach((stage, idx) => {
      stage.order_index = idx + 1;
    });

    setStages(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Release name is required');
      return;
    }

    if (stages.length === 0) {
      setError('At least one stage is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await apiService.createRelease({
        name: name.trim(),
        description: description.trim() || undefined,
        version: version.trim() || undefined,
        pipeline_id: pipelineId,
        customer_id: selectedCustomer?.id,
        stages: stages
      });

      onSuccess();
    } catch (err) {
      setError('Failed to create release');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">Create Release</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
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

          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Release Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                placeholder="Production Deployment"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                placeholder="Deploy to all environments"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Version
                </label>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                  placeholder="v1.0.0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Default Pipeline
                </label>
                <select
                  value={pipelineId || ''}
                  onChange={(e) => setPipelineId(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                >
                  <option value="">None</option>
                  {pipelines.map(pipeline => (
                    <option key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Stages */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">
                Deployment Stages <span className="text-red-500">*</span>
              </h3>
              <button
                type="button"
                onClick={addStage}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
              >
                <Plus className="h-4 w-4" />
                Add Stage
              </button>
            </div>

            {stages.length === 0 ? (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center text-gray-600">
                No stages added. Click "Add Stage" to create deployment stages.
              </div>
            ) : (
              <div className="space-y-3">
                {stages.map((stage, index) => {
                  const env = environments.find(e => e.id === stage.environment_id);
                  return (
                    <div key={index} className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Environment
                            </label>
                            <select
                              value={stage.environment_id}
                              onChange={(e) => updateStage(index, 'environment_id', Number(e.target.value))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-gray-900 bg-white"
                            >
                              {environments.map(env => (
                                <option key={env.id} value={env.id}>
                                  {env.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Pipeline Override
                            </label>
                            <select
                              value={stage.pipeline_id || ''}
                              onChange={(e) => updateStage(index, 'pipeline_id', e.target.value ? Number(e.target.value) : undefined)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-gray-900 bg-white"
                            >
                              <option value="">Use default</option>
                              {pipelines.map(pipeline => (
                                <option key={pipeline.id} value={pipeline.id}>
                                  {pipeline.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 ml-2">
                          <button
                            type="button"
                            onClick={() => moveStage(index, 'up')}
                            disabled={index === 0}
                            className="p-1 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Move up"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveStage(index, 'down')}
                            disabled={index === stages.length - 1}
                            className="p-1 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Move down"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeStage(index)}
                            className="p-1 hover:bg-red-100 text-red-600 rounded"
                            title="Remove stage"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Options */}
                      <div className="flex flex-wrap gap-3 text-sm">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={stage.pre_deployment_approval}
                            onChange={(e) => updateStage(index, 'pre_deployment_approval', e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span>Pre-deployment Approval</span>
                        </label>

                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={stage.post_deployment_approval}
                            onChange={(e) => updateStage(index, 'post_deployment_approval', e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span>Post-deployment Approval</span>
                        </label>

                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={stage.auto_deploy}
                            onChange={(e) => updateStage(index, 'auto_deploy', e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span>Auto-deploy</span>
                        </label>
                      </div>

                      {env?.requires_approval && (
                        <div className="text-xs text-yellow-800 bg-yellow-50 p-2 rounded">
                          Note: {env.name} requires approval by default
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Release'}
          </button>
        </div>
      </div>
    </div>
  );
};
