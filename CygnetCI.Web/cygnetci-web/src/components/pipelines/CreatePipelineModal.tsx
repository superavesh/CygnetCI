// src/components/pipelines/CreatePipelineModal.tsx

'use client';

import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';

interface CreatePipelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (pipelineData: PipelineFormData) => void;
  agents: Array<{ id: number; name: string; status: string }>;
}

export interface PipelineParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'choice';
  defaultValue: string;
  required: boolean;
  description: string;
  choices?: string[]; // For choice type
}

export interface PipelineFormData {
  name: string;
  description: string;
  branch: string;
  agentId: number | null;
  steps: Array<{
    name: string;
    command: string;
    order: number;
    shellType: 'powershell' | 'cmd' | 'bash';
  }>;
  parameters: PipelineParameter[];
}

export const CreatePipelineModal: React.FC<CreatePipelineModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  agents
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [branch, setBranch] = useState('main');
  const [agentId, setAgentId] = useState<number | null>(null);
  const [steps, setSteps] = useState([
    { name: 'Build', command: 'npm run build', order: 1, shellType: 'cmd' as const }
  ]);
  const [parameters, setParameters] = useState<PipelineParameter[]>([]);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  if (!isOpen) return null;

  const addStep = () => {
    setSteps([
      ...steps,
      { name: '', command: '', order: steps.length + 1, shellType: 'cmd' }
    ]);
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
    
    if (!name.trim()) {
      newErrors.name = 'Pipeline name is required';
    }
    
    if (!branch.trim()) {
      newErrors.branch = 'Branch is required';
    }
    
    if (!agentId) {
      newErrors.agentId = 'Please select an agent';
    }

    if (steps.length === 0) {
      newErrors.steps = 'At least one step is required';
    }

    steps.forEach((step, index) => {
      if (!step.name.trim()) {
        newErrors[`step_name_${index}`] = 'Step name is required';
      }
      if (!step.command.trim()) {
        newErrors[`step_command_${index}`] = 'Command is required';
      }
    });

    parameters.forEach((param, index) => {
      if (!param.name.trim()) {
        newErrors[`param_name_${index}`] = 'Parameter name is required';
      }
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
      onSubmit({
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
      
      // Reset form
      setName('');
      setDescription('');
      setBranch('main');
      setAgentId(null);
      setSteps([{ name: 'Build', command: 'npm run build', order: 1, shellType: 'cmd' }]);
      setParameters([]);
      setErrors({});
      onClose();
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setBranch('main');
    setAgentId(null);
    setSteps([{ name: 'Build', command: 'npm run build', order: 1, shellType: 'cmd' }]);
    setParameters([]);
    setErrors({});
    onClose();
  };

  const onlineAgents = agents.filter(a => a.status === 'online' || a.status === 'busy');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-2xl font-bold text-gray-800">Create New Pipeline</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pipeline Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pipeline Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Frontend Production Deploy"
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900 placeholder-gray-400 ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-500">{errors.name}</p>
              )}
            </div>

            {/* Branch */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Branch <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="e.g., main, develop"
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900 placeholder-gray-400 ${
                  errors.branch ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.branch && (
                <p className="mt-1 text-sm text-red-500">{errors.branch}</p>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this pipeline does..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none text-gray-900 placeholder-gray-400"
            />
          </div>

          {/* Agent Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Execution Agent <span className="text-red-500">*</span>
            </label>
            <select
              value={agentId || ''}
              onChange={(e) => setAgentId(Number(e.target.value) || null)}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900 ${
                errors.agentId ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">Select an agent...</option>
              {onlineAgents.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} ({agent.status})
                </option>
              ))}
            </select>
            {errors.agentId && (
              <p className="mt-1 text-sm text-red-500">{errors.agentId}</p>
            )}
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
                className="flex items-center space-x-2 px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Add Step</span>
              </button>
            </div>

            <div className="space-y-4">
              {steps.map((step, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-sm font-medium text-gray-600">
                      Step {index + 1}
                    </span>
                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStep(index)}
                        className="text-red-500 hover:text-red-700 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <input
                        type="text"
                        value={step.name}
                        onChange={(e) => updateStep(index, 'name', e.target.value)}
                        placeholder="Step name (e.g., Build, Test, Deploy)"
                        className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 placeholder-gray-400 ${
                          errors[`step_name_${index}`] ? 'border-red-500' : 'border-gray-300'
                        }`}
                      />
                      {errors[`step_name_${index}`] && (
                        <p className="mt-1 text-xs text-red-500">{errors[`step_name_${index}`]}</p>
                      )}
                    </div>

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

                    <div>
                      <textarea
                        value={step.command}
                        onChange={(e) => updateStep(index, 'command', e.target.value)}
                        placeholder="Command (use {{PARAM_NAME}} for parameters)"
                        rows={2}
                        className={`w-full px-3 py-2 border rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none text-gray-900 placeholder-gray-400 ${
                          errors[`step_command_${index}`] ? 'border-red-500' : 'border-gray-300'
                        }`}
                      />
                      {errors[`step_command_${index}`] && (
                        <p className="mt-1 text-xs text-red-500">{errors[`step_command_${index}`]}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        Example: npm run build --env={`{{ENV}}`}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {errors.steps && (
              <p className="mt-2 text-sm text-red-500">{errors.steps}</p>
            )}
          </div>

          {/* Preview */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">Pipeline Preview:</h4>
            <div className="text-sm text-blue-800 space-y-1">
              <p><strong>Name:</strong> {name || '(not set)'}</p>
              <p><strong>Branch:</strong> {branch || '(not set)'}</p>
              <p><strong>Agent:</strong> {agentId ? onlineAgents.find(a => a.id === agentId)?.name : '(not selected)'}</p>
              <p><strong>Steps:</strong> {steps.length} step(s)</p>
              <p><strong>Parameters:</strong> {parameters.length} parameter(s)</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
            >
              Create Pipeline
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};