// src/components/pipelines/EditPipelineModal.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, Plus } from 'lucide-react';
import type { PipelineFormData, PipelineParameter } from './CreatePipelineModal';

interface EditPipelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (pipelineId: number, data: PipelineFormData) => void;
  onDelete: (pipelineId: number) => void;
  pipeline: any | null;
  agents: Array<{ id: number; name: string; status: string }>;
}

export const EditPipelineModal: React.FC<EditPipelineModalProps> = ({
  isOpen,
  onClose,
  onUpdate,
  onDelete,
  pipeline,
  agents
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [branch, setBranch] = useState('');
  const [agentId, setAgentId] = useState<number | null>(null);
  const [steps, setSteps] = useState<Array<{ name: string; command: string; order: number; shellType: 'powershell' | 'cmd' | 'bash' }>>([]);
  const [parameters, setParameters] = useState<PipelineParameter[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (pipeline) {
      setName(pipeline.name || '');
      setDescription(pipeline.description || '');
      setBranch(pipeline.branch || 'main');
      setAgentId(pipeline.agent_id || null);
      setSteps(pipeline.steps?.map((step: any) => ({
        name: step.name,
        command: step.command,
        order: step.order,
        shellType: step.shellType || 'cmd'
      })) || [
        { name: 'Build', command: 'npm run build', order: 1, shellType: 'cmd' }
      ]);
      setParameters(pipeline.parameters || []);
    }
  }, [pipeline]);

  if (!isOpen || !pipeline) return null;

  const addStep = () => {
    setSteps([...steps, { name: '', command: '', order: steps.length + 1, shellType: 'cmd' }]);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, field: 'name' | 'command' | 'shellType', value: string) => {
    const newSteps = [...steps];
    newSteps[index][field] = value as any;
    setSteps(newSteps);
  };

  // Parameter Management
  const addParameter = () => {
    setParameters([
      ...parameters,
      {
        name: '',
        type: 'string',
        defaultValue: '',
        required: false,
        description: '',
        choices: []
      }
    ]);
  };

  const removeParameter = (index: number) => {
    setParameters(parameters.filter((_, i) => i !== index));
  };

  const updateParameter = (index: number, field: keyof PipelineParameter, value: any) => {
    const newParams = [...parameters];
    newParams[index] = { ...newParams[index], [field]: value };
    setParameters(newParams);
  };

  const addChoice = (paramIndex: number) => {
    const newParams = [...parameters];
    if (!newParams[paramIndex].choices) {
      newParams[paramIndex].choices = [];
    }
    newParams[paramIndex].choices!.push('');
    setParameters(newParams);
  };

  const updateChoice = (paramIndex: number, choiceIndex: number, value: string) => {
    const newParams = [...parameters];
    newParams[paramIndex].choices![choiceIndex] = value;
    setParameters(newParams);
  };

  const removeChoice = (paramIndex: number, choiceIndex: number) => {
    const newParams = [...parameters];
    newParams[paramIndex].choices = newParams[paramIndex].choices!.filter((_, i) => i !== choiceIndex);
    setParameters(newParams);
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!name.trim()) newErrors.name = 'Pipeline name is required';
    if (!branch.trim()) newErrors.branch = 'Branch is required';
    if (!agentId) newErrors.agentId = 'Please select an agent';

    steps.forEach((step, index) => {
      if (!step.name.trim()) newErrors[`step_name_${index}`] = 'Step name is required';
      if (!step.command.trim()) newErrors[`step_command_${index}`] = 'Command is required';
    });

    parameters.forEach((param, index) => {
      if (!param.name.trim()) newErrors[`param_name_${index}`] = 'Parameter name is required';
      if (param.type === 'choice' && (!param.choices || param.choices.length === 0)) {
        newErrors[`param_choices_${index}`] = 'At least one choice is required';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (validateForm()) {
      onUpdate(pipeline.id, {
        name: name.trim(),
        description: description.trim(),
        branch: branch.trim(),
        agentId,
        steps: steps.map((step, index) => ({
          ...step,
          order: index + 1
        })),
        parameters: parameters.map(p => ({
          ...p,
          name: p.name.trim(),
          description: p.description.trim()
        }))
      });

      setErrors({});
      setShowDeleteConfirm(false);
      onClose();
    }
  };

  const handleDelete = () => {
    onDelete(pipeline.id);
    setShowDeleteConfirm(false);
    onClose();
  };

  const handleClose = () => {
    setErrors({});
    setShowDeleteConfirm(false);
    onClose();
  };

  const onlineAgents = agents.filter(a => a.status === 'online' || a.status === 'busy');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-2xl font-bold text-gray-800">Edit Pipeline</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Pipeline Info Badge */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-medium">Pipeline ID</p>
                <p className="text-lg font-bold text-blue-900">#{pipeline.id}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-blue-600 font-medium">Current Status</p>
                <p className={`text-lg font-bold ${
                  pipeline.status === 'success' ? 'text-green-600' :
                  pipeline.status === 'failed' ? 'text-red-600' :
                  pipeline.status === 'running' ? 'text-blue-600' : 'text-gray-600'
                }`}>
                  {pipeline.status.toUpperCase()}
                </p>
              </div>
            </div>
          </div>

          {/* Form fields - Same as Create Modal */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pipeline Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Branch <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 ${
                  errors.branch ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.branch && <p className="mt-1 text-sm text-red-500">{errors.branch}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Execution Agent <span className="text-red-500">*</span>
            </label>
            <select
              value={agentId || ''}
              onChange={(e) => setAgentId(Number(e.target.value) || null)}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 ${
                errors.agentId ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">Select an agent...</option>
              {onlineAgents.map(agent => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
            {errors.agentId && <p className="mt-1 text-sm text-red-500">{errors.agentId}</p>}
          </div>

          {/* Pipeline Parameters */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Pipeline Parameters
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Define parameters that can be set when running this pipeline
                </p>
              </div>
              <button
                type="button"
                onClick={addParameter}
                className="flex items-center space-x-2 px-3 py-1 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Add Parameter</span>
              </button>
            </div>

            {parameters.length > 0 && (
              <div className="space-y-4">
                {parameters.map((param, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-lg p-4 bg-purple-50"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-sm font-medium text-gray-600">
                        Parameter {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeParameter(index)}
                        className="text-red-500 hover:text-red-700 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <input
                          type="text"
                          value={param.name}
                          onChange={(e) => updateParameter(index, 'name', e.target.value)}
                          placeholder="Parameter name (e.g., ENV, VERSION)"
                          className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 ${
                            errors[`param_name_${index}`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {errors[`param_name_${index}`] && (
                          <p className="mt-1 text-xs text-red-500">{errors[`param_name_${index}`]}</p>
                        )}
                      </div>

                      <select
                        value={param.type}
                        onChange={(e) => updateParameter(index, 'type', e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                      >
                        <option value="string">String</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                        <option value="choice">Choice</option>
                      </select>
                    </div>

                    <div className="mt-3">
                      <input
                        type="text"
                        value={param.defaultValue}
                        onChange={(e) => updateParameter(index, 'defaultValue', e.target.value)}
                        placeholder="Default value"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                      />
                    </div>

                    <div className="mt-3">
                      <textarea
                        value={param.description}
                        onChange={(e) => updateParameter(index, 'description', e.target.value)}
                        placeholder="Parameter description"
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 resize-none"
                      />
                    </div>

                    {/* Choices for choice type */}
                    {param.type === 'choice' && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-medium text-gray-600">Choices</label>
                          <button
                            type="button"
                            onClick={() => addChoice(index)}
                            className="text-xs text-purple-600 hover:text-purple-800"
                          >
                            + Add Choice
                          </button>
                        </div>
                        <div className="space-y-2">
                          {param.choices?.map((choice, choiceIndex) => (
                            <div key={choiceIndex} className="flex items-center space-x-2">
                              <input
                                type="text"
                                value={choice}
                                onChange={(e) => updateChoice(index, choiceIndex, e.target.value)}
                                placeholder={`Choice ${choiceIndex + 1}`}
                                className="flex-1 px-3 py-1 border border-gray-300 rounded text-sm text-gray-900"
                              />
                              <button
                                type="button"
                                onClick={() => removeChoice(index, choiceIndex)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                        {errors[`param_choices_${index}`] && (
                          <p className="mt-1 text-xs text-red-500">{errors[`param_choices_${index}`]}</p>
                        )}
                      </div>
                    )}

                    <div className="mt-3">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={param.required}
                          onChange={(e) => updateParameter(index, 'required', e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">Required parameter</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pipeline Steps */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <label className="block text-sm font-medium text-gray-700">
                Pipeline Steps <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={addStep}
                className="flex items-center space-x-2 px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm"
              >
                <Plus className="h-4 w-4" />
                <span>Add Step</span>
              </button>
            </div>

            <div className="space-y-4">
              {steps.map((step, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-sm font-medium text-gray-600">Step {index + 1}</span>
                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStep(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <input
                      type="text"
                      value={step.name}
                      onChange={(e) => updateStep(index, 'name', e.target.value)}
                      placeholder="Step name"
                      className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 ${
                        errors[`step_name_${index}`] ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Shell Type
                      </label>
                      <select
                        value={step.shellType}
                        onChange={(e) => updateStep(index, 'shellType', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900"
                      >
                        <option value="cmd">Command Prompt (cmd)</option>
                        <option value="powershell">PowerShell</option>
                        <option value="bash">Bash</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Select the shell executor for this step
                      </p>
                    </div>
                    <textarea
                      value={step.command}
                      onChange={(e) => updateStep(index, 'command', e.target.value)}
                      placeholder="Command"
                      rows={2}
                      className={`w-full px-3 py-2 border rounded-lg text-sm font-mono text-gray-900 ${
                        errors[`step_command_${index}`] ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Delete Confirmation */}
          {showDeleteConfirm && (
            <div className="bg-red-50 border-2 border-red-500 rounded-lg p-4">
              <p className="text-red-800 font-medium mb-3">
                Are you sure you want to delete this pipeline? This action cannot be undone.
              </p>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg"
                >
                  Yes, Delete
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={showDeleteConfirm}
              className="px-4 py-2 border border-red-300 text-red-600 hover:bg-red-50 rounded-lg flex items-center space-x-2 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete Pipeline</span>
            </button>
            <div className="flex-1"></div>
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center space-x-2"
            >
              <Save className="h-4 w-4" />
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};