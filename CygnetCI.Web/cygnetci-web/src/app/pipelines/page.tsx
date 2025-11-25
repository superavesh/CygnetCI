// src/app/pipelines/page.tsx

'use client';

import React, { useState } from 'react';
import { Play, Plus, Settings, Eye, Sliders } from 'lucide-react';
import { useData } from '@/lib/hooks/useData';
import { PipelineFilter, filterPipelines } from '@/components/tables/PipelineFilter';
import { CreatePipelineModal, PipelineFormData } from '@/components/pipelines/CreatePipelineModal';
import { EditPipelineModal } from '@/components/pipelines/EditPipelineModal';
import { ExecutionViewModal } from '@/components/pipelines/ExecutionViewModal';
import { RunPipelineModal } from '@/components/pipelines/RunPipelineModal';
import { apiService } from '@/lib/api/apiService';
import { CONFIG } from '@/lib/config';

export default function PipelinesPage() {
  const { pipelines, agents, refetch } = useData();
  const [filterQuery, setFilterQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showExecutionModal, setShowExecutionModal] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);
  const [selectedPipeline, setSelectedPipeline] = useState<any | null>(null);
  const [currentExecutionId, setCurrentExecutionId] = useState<number | null>(null);

  const handleCreatePipeline = async (data: PipelineFormData) => {
    try {
      await apiService.createPipeline(data);
      refetch();
      setShowCreateModal(false);
    } catch (err) {
      console.error('Error creating pipeline:', err);
      alert('Failed to create pipeline');
    }
  };

  const handleUpdatePipeline = async (pipelineId: number, data: PipelineFormData) => {
    try {
      await apiService.updatePipeline(pipelineId, data);
      refetch();
      setShowEditModal(false);
      setSelectedPipeline(null);
    } catch (err) {
      console.error('Error updating pipeline:', err);
      alert('Failed to update pipeline');
    }
  };

  const handleDeletePipeline = async (pipelineId: number) => {
    if (!confirm('Are you sure you want to delete this pipeline? This action cannot be undone.')) {
      return;
    }

    try {
      await apiService.deletePipeline(pipelineId);
      refetch();
      setShowEditModal(false);
      setSelectedPipeline(null);
    } catch (err) {
      console.error('Error deleting pipeline:', err);
      alert('Failed to delete pipeline');
    }
  };

  const handleRunClick = (pipeline: any) => {
    setSelectedPipeline(pipeline);
    setShowRunModal(true);
  };

  const handleQuickRun = async (pipeline: any) => {
    // Quick run without parameters
    try {
      const result = await apiService.runPipeline(pipeline.id, {});
      
      setSelectedPipeline(pipeline);
      setCurrentExecutionId(result.executionId || Date.now());
      setShowExecutionModal(true);
      
      refetch();
    } catch (err) {
      console.error('Error running pipeline:', err);
      alert('Failed to run pipeline');
    }
  };

  const handleRunPipeline = async (pipelineId: number, parameters: Record<string, any>) => {
    try {
      const result = await apiService.runPipeline(pipelineId, parameters);
      const pipeline = pipelines.find(p => p.id === pipelineId);
      
      if (pipeline) {
        setSelectedPipeline(pipeline);
        setCurrentExecutionId(result.executionId || Date.now());
        setShowExecutionModal(true);
      }
      
      refetch();
    } catch (err) {
      console.error('Error running pipeline:', err);
      alert('Failed to run pipeline');
    }
  };

  const handleStopPipeline = async () => {
    if (selectedPipeline) {
      try {
        await apiService.stopPipeline(selectedPipeline.id);
        refetch();
      } catch (err) {
        console.error('Error stopping pipeline:', err);
      }
    }
  };

  const handleEditClick = (pipeline: any) => {
    setSelectedPipeline(pipeline);
    setShowEditModal(true);
  };

  const handleViewExecution = (pipeline: any) => {
    setSelectedPipeline(pipeline);
    setCurrentExecutionId(Date.now());
    setShowExecutionModal(true);
  };

  // Apply filters to pipelines
  const filteredPipelines = filterPipelines(pipelines, filterQuery);

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Pipelines</h2>
            <p className="text-sm text-gray-600 mt-1">
              {filteredPipelines.length} of {pipelines.length} pipelines
            </p>
          </div>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>New Pipeline</span>
          </button>
        </div>

        {/* Search Filter */}
        <PipelineFilter onFilter={setFilterQuery} />

        {/* Enhanced Pipeline Table with Actions */}
        {filteredPipelines.length > 0 ? (
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Pipeline</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Branch</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Last Run</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Config</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPipelines.map(pipeline => {
                    const hasParameters = pipeline.parameters && pipeline.parameters.length > 0;
                    const hasSteps = pipeline.steps && pipeline.steps.length > 0;
                    
                    return (
                      <tr key={pipeline.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Play className="h-5 w-5 text-gray-400 mr-3" />
                            <div>
                              <div className="text-sm font-medium text-gray-900">{pipeline.name}</div>
                              <div className="text-sm text-gray-500">#{pipeline.commit || 'N/A'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            pipeline.status === 'success' ? 'bg-green-500 text-white' :
                            pipeline.status === 'failed' ? 'bg-red-500 text-white' :
                            pipeline.status === 'running' ? 'bg-blue-500 text-white' :
                            'bg-gray-500 text-white'
                          }`}>
                            {pipeline.status.charAt(0).toUpperCase() + pipeline.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{pipeline.branch}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{pipeline.lastRun}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{pipeline.duration}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col space-y-1">
                            {hasSteps && (
                              <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full inline-block">
                                {pipeline.steps.length} steps
                              </span>
                            )}
                            {hasParameters && (
                              <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full inline-block">
                                {pipeline.parameters.length} params
                              </span>
                            )}
                            {!hasSteps && !hasParameters && (
                              <span className="text-xs text-gray-400">No config</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            {/* Show different run buttons based on parameters */}
                            {hasParameters ? (
                              <button 
                                onClick={() => handleRunClick(pipeline)}
                                className="text-purple-600 hover:text-purple-900 transition-colors flex items-center space-x-1"
                                title="Run with Parameters"
                              >
                                <Sliders className="h-4 w-4" />
                                <span className="text-xs">Params</span>
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleQuickRun(pipeline)}
                                className="text-green-600 hover:text-green-900 transition-colors"
                                title="Quick Run"
                              >
                                <Play className="h-4 w-4" />
                              </button>
                            )}
                            
                            <button 
                              onClick={() => handleViewExecution(pipeline)}
                              className="text-blue-600 hover:text-blue-900 transition-colors"
                              title="View Execution"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button 
                              onClick={() => handleEditClick(pipeline)}
                              className="text-gray-600 hover:text-gray-900 transition-colors"
                              title="Edit Pipeline"
                            >
                              <Settings className="h-4 w-4" />
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
            <Play className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-800 mb-2">No pipelines found</h3>
            <p className="text-gray-600 mb-4">
              {filterQuery 
                ? 'Try adjusting your search filters' 
                : 'Get started by creating your first pipeline'}
            </p>
            {!filterQuery && (
              <button 
                onClick={() => setShowCreateModal(true)}
                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg inline-flex items-center space-x-2 transition-colors"
              >
                <Plus className="h-5 w-5" />
                <span>Create First Pipeline</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <CreatePipelineModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreatePipeline}
        agents={agents}
      />

      <EditPipelineModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedPipeline(null);
        }}
        onUpdate={handleUpdatePipeline}
        onDelete={handleDeletePipeline}
        pipeline={selectedPipeline}
        agents={agents}
      />

      <RunPipelineModal
        isOpen={showRunModal}
        onClose={() => {
          setShowRunModal(false);
          setSelectedPipeline(null);
        }}
        onRun={(params) => {
          handleRunPipeline(selectedPipeline?.id, params);
          setShowRunModal(false);
        }}
        pipeline={selectedPipeline}
        parameters={selectedPipeline?.parameters || []}
      />

      <ExecutionViewModal
        isOpen={showExecutionModal}
        onClose={() => {
          setShowExecutionModal(false);
          setSelectedPipeline(null);
          setCurrentExecutionId(null);
        }}
        onStop={handleStopPipeline}
        pipelineId={selectedPipeline?.id || 0}
        pipelineName={selectedPipeline?.name || ''}
        executionId={currentExecutionId}
      />
    </>
  );
}