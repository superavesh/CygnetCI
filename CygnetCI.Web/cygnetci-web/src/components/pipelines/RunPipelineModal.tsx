// src/components/pipelines/RunPipelineModal.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { X, Play } from 'lucide-react';
import type { PipelineParameter } from './CreatePipelineModal';

interface RunPipelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRun: (parameters: Record<string, any>) => void;
  pipeline: any | null;
  parameters: PipelineParameter[];
}

export const RunPipelineModal: React.FC<RunPipelineModalProps> = ({
  isOpen,
  onClose,
  onRun,
  pipeline,
  parameters
}) => {
  const [paramValues, setParamValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (parameters && parameters.length > 0) {
      const initialValues: Record<string, any> = {};
      parameters.forEach(param => {
        initialValues[param.name] = param.defaultValue || '';
      });
      setParamValues(initialValues);
    }
  }, [parameters]);

  if (!isOpen || !pipeline) return null;

  const handleParamChange = (paramName: string, value: any) => {
    setParamValues(prev => ({
      ...prev,
      [paramName]: value
    }));
    // Clear error for this field
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[paramName];
      return newErrors;
    });
  };

  const validateParams = () => {
    const newErrors: Record<string, string> = {};

    parameters.forEach(param => {
      if (param.required && !paramValues[param.name]) {
        newErrors[param.name] = `${param.name} is required`;
      }

      // Type validation
      if (paramValues[param.name]) {
        if (param.type === 'number' && isNaN(Number(paramValues[param.name]))) {
          newErrors[param.name] = `${param.name} must be a number`;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRun = () => {
    if (validateParams()) {
      // Convert values to appropriate types
      const convertedParams: Record<string, any> = {};
      parameters.forEach(param => {
        const value = paramValues[param.name];
        
        if (param.type === 'number') {
          convertedParams[param.name] = Number(value);
        } else if (param.type === 'boolean') {
          convertedParams[param.name] = value === 'true' || value === true;
        } else {
          convertedParams[param.name] = value;
        }
      });

      onRun(convertedParams);
      onClose();
    }
  };

  const renderParameterInput = (param: PipelineParameter) => {
    switch (param.type) {
      case 'boolean':
        return (
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                name={param.name}
                value="true"
                checked={paramValues[param.name] === 'true' || paramValues[param.name] === true}
                onChange={(e) => handleParamChange(param.name, e.target.value)}
                className="form-radio"
              />
              <span className="text-sm text-gray-700">True</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                name={param.name}
                value="false"
                checked={paramValues[param.name] === 'false' || paramValues[param.name] === false}
                onChange={(e) => handleParamChange(param.name, e.target.value)}
                className="form-radio"
              />
              <span className="text-sm text-gray-700">False</span>
            </label>
          </div>
        );

      case 'choice':
        return (
          <select
            value={paramValues[param.name] || ''}
            onChange={(e) => handleParamChange(param.name, e.target.value)}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 ${
              errors[param.name] ? 'border-red-500' : 'border-gray-300'
            }`}
          >
            <option value="">Select {param.name}...</option>
            {param.choices?.map((choice, index) => (
              <option key={index} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        );

      case 'number':
        return (
          <input
            type="number"
            value={paramValues[param.name] || ''}
            onChange={(e) => handleParamChange(param.name, e.target.value)}
            placeholder={`Enter ${param.name}`}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 ${
              errors[param.name] ? 'border-red-500' : 'border-gray-300'
            }`}
          />
        );

      default: // string
        return (
          <input
            type="text"
            value={paramValues[param.name] || ''}
            onChange={(e) => handleParamChange(param.name, e.target.value)}
            placeholder={`Enter ${param.name}`}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 ${
              errors[param.name] ? 'border-red-500' : 'border-gray-300'
            }`}
          />
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Run Pipeline</h2>
            <p className="text-sm text-gray-500 mt-1">{pipeline.name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Pipeline Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-blue-600 font-medium">Branch:</span>
                <span className="text-blue-900 ml-2">{pipeline.branch}</span>
              </div>
              <div>
                <span className="text-blue-600 font-medium">Status:</span>
                <span className="text-blue-900 ml-2">{pipeline.status}</span>
              </div>
            </div>
          </div>

          {/* Parameters */}
          {parameters && parameters.length > 0 ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Configure Parameters
              </h3>

              {parameters.map((param, index) => (
                <div key={index} className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {param.name}
                    {param.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  
                  {param.description && (
                    <p className="text-xs text-gray-500">{param.description}</p>
                  )}

                  {renderParameterInput(param)}

                  {errors[param.name] && (
                    <p className="text-xs text-red-500">{errors[param.name]}</p>
                  )}

                  {param.defaultValue && !paramValues[param.name] && (
                    <p className="text-xs text-gray-500">
                      Default: {param.defaultValue}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Play className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">
                This pipeline has no parameters. Click "Run Pipeline" to start execution.
              </p>
            </div>
          )}

          {/* Parameter Preview */}
          {parameters && parameters.length > 0 && Object.keys(paramValues).length > 0 && (
            <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Parameters Preview:
              </h4>
              <div className="text-xs font-mono text-gray-600 space-y-1">
                {Object.entries(paramValues).map(([key, value]) => (
                  <div key={key}>
                    <span className="text-blue-600">{key}</span>
                    <span className="text-gray-500">:</span>
                    <span className="text-green-600 ml-2">
                      {value === '' ? '(empty)' : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex space-x-3 p-6 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRun}
            className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors flex items-center justify-center space-x-2"
          >
            <Play className="h-4 w-4" />
            <span>Run Pipeline</span>
          </button>
        </div>
      </div>
    </div>
  );
};