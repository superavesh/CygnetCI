// src/app/pipelines/page.tsx

'use client';

import React, { useState } from 'react';
import { Play, Plus, Settings, Sliders, RefreshCw, History, ChevronUp, ChevronDown, Download, Upload, FileDown } from 'lucide-react';
import { useData } from '@/lib/hooks/useData';
import { useCustomer } from '@/lib/contexts/CustomerContext';
import { PipelineFilter, filterPipelines } from '@/components/tables/PipelineFilter';
import { CreatePipelineModal, PipelineFormData } from '@/components/pipelines/CreatePipelineModal';
import { PipelineImportModal } from '@/components/pipelines/PipelineImportModal';
import { EditPipelineModal } from '@/components/pipelines/EditPipelineModal';
import { ExecutionViewModal } from '@/components/pipelines/ExecutionViewModal';
import { ExecutionHistoryModal } from '@/components/pipelines/ExecutionHistoryModal';
import { RunPipelineModal } from '@/components/pipelines/RunPipelineModal';
import { apiService } from '@/lib/api/apiService';
import { CONFIG } from '@/lib/config';

export default function PipelinesPage() {
  const { selectedCustomer } = useCustomer();
  const { pipelines, agents, refetch } = useData(selectedCustomer?.id);
  const [filterQuery, setFilterQuery] = useState('');
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showExecutionModal, setShowExecutionModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);
  const [selectedPipeline, setSelectedPipeline] = useState<any | null>(null);
  const [currentExecutionId, setCurrentExecutionId] = useState<number | null>(null);
  const [openedLogsFromHistory, setOpenedLogsFromHistory] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleCreatePipeline = async (data: PipelineFormData) => {
    if (!selectedCustomer) {
      alert('Please select a customer first');
      return;
    }
    try {
      await apiService.createPipeline({
        ...data,
        customerId: selectedCustomer.id
      });
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

  const handleRunClick = async (pipeline: any) => {
    try {
      // Fetch full pipeline details including steps and parameters
      const fullPipeline = await apiService.getPipeline(pipeline.id);
      setSelectedPipeline(fullPipeline);
      setShowRunModal(true);
    } catch (err) {
      console.error('Error fetching pipeline details:', err);
      alert('Failed to fetch pipeline details');
    }
  };

  const handleQuickRun = async (pipeline: any) => {
    // Check if pipeline has a default agent
    if (!pipeline.agent_id) {
      alert('No default agent assigned to this pipeline. Please configure an agent or use "Run with Parameters" to select one.');
      return;
    }

    // Quick run without parameters using pipeline's default agent
    try {
      const result = await apiService.runPipeline(pipeline.id, {}, pipeline.agent_id);

      if (result.executionId) {
        setSelectedPipeline(pipeline);
        setCurrentExecutionId(result.executionId);
        setShowExecutionModal(true);
      } else {
        alert('Pipeline queued but no execution ID returned');
      }

      refetch();
    } catch (err) {
      console.error('Error running pipeline:', err);
      alert('Failed to run pipeline');
    }
  };

  const handleRunPipeline = async (pipelineId: number, parameters: Record<string, any>, agentId: number | null) => {
    try {
      const result = await apiService.runPipeline(pipelineId, parameters, agentId);
      const pipeline = pipelines.find(p => p.id === pipelineId);

      if (pipeline && result.executionId) {
        setSelectedPipeline(pipeline);
        setCurrentExecutionId(result.executionId);
        setShowExecutionModal(true);
      } else if (!result.executionId) {
        alert('Pipeline queued but no execution ID returned');
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

  const handleEditClick = async (pipeline: any) => {
    try {
      // Fetch full pipeline details including steps and parameters
      const fullPipeline = await apiService.getPipeline(pipeline.id);
      setSelectedPipeline(fullPipeline);
      setShowEditModal(true);
    } catch (err) {
      console.error('Error fetching pipeline details:', err);
      alert('Failed to fetch pipeline details');
    }
  };

  const handleViewExecution = (pipeline: any) => {
    setSelectedPipeline(pipeline);
    setShowHistoryModal(true);
  };

  const handleViewLogs = (executionId: number) => {
    setCurrentExecutionId(executionId);
    setOpenedLogsFromHistory(true);
    setShowExecutionModal(true);
  };

  const downloadJson = (data: object, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const buildExportPayload = (ps: any[]) => ({
    cygnetci_version: 1,
    exported_at: new Date().toISOString(),
    type: ps.length === 1 ? 'pipeline' : 'pipeline_collection',
    pipelines: ps.map(p => ({
      name: p.name,
      description: p.description ?? '',
      branch: p.branch ?? '',
      steps: (p.steps ?? []).map((s: any) => ({ name: s.name, command: s.command, order: s.order, shellType: s.shellType })),
      parameters: (p.parameters ?? []).map((pm: any) => ({ name: pm.name, type: pm.type, defaultValue: pm.defaultValue, required: pm.required, description: pm.description, choices: pm.choices ?? [] })),
    })),
  });

  const handleExportSingle = async (pipeline: any) => {
    try {
      const full = await apiService.getPipeline(pipeline.id);
      downloadJson(buildExportPayload([full]), `pipeline-${pipeline.name.replace(/\s+/g, '-')}.json`);
    } catch { alert('Failed to export pipeline'); }
  };

  const handleExportAll = async () => {
    setExporting(true);
    try {
      const full = await Promise.all(sortedPipelines.map(p => apiService.getPipeline(p.id)));
      const name = selectedCustomer?.display_name ?? 'all';
      downloadJson(buildExportPayload(full), `pipelines-${name.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`);
    } catch { alert('Failed to export pipelines'); }
    finally { setExporting(false); }
  };

  const handleSort = (col: string) => {
    if (sortKey === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(col); setSortDir('asc'); }
  };

  // Apply filters then sort
  const filteredPipelines = filterPipelines(pipelines, filterQuery);
  const sortedPipelines = [...filteredPipelines].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'name':     cmp = (a.name ?? '').localeCompare(b.name ?? ''); break;
      case 'status':   cmp = (a.status ?? '').localeCompare(b.status ?? ''); break;
      case 'branch':   cmp = (a.branch ?? '').localeCompare(b.branch ?? ''); break;
      case 'lastRun':  cmp = (a.lastRun ?? '').localeCompare(b.lastRun ?? ''); break;
      case 'duration': cmp = (a.duration ?? '').localeCompare(b.duration ?? ''); break;
      default:         cmp = (a.name ?? '').localeCompare(b.name ?? '');
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Pipelines</h2>
            <p className="text-sm text-gray-600 mt-1">
              {filteredPipelines.length} of {pipelines.length} pipelines
              {selectedCustomer && ` • Filtering for ${selectedCustomer.display_name}`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={refetch} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm">
              <RefreshCw className="h-4 w-4" /><span>Refresh</span>
            </button>
            <button onClick={handleExportAll} disabled={exporting || sortedPipelines.length === 0}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm disabled:opacity-50">
              {exporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span>Export All</span>
            </button>
            <button onClick={() => setShowImportModal(true)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm">
              <Upload className="h-4 w-4" /><span>Import</span>
            </button>
            <button onClick={() => setShowCreateModal(true)} className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm">
              <Plus className="h-4 w-4" /><span>New Pipeline</span>
            </button>
          </div>
        </div>

        {/* Search Filter */}
        <PipelineFilter onFilter={setFilterQuery} />

        {/* Enhanced Pipeline Table with Actions */}
        {sortedPipelines.length > 0 ? (
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {[
                      { label: 'Pipeline', col: 'name' },
                      { label: 'Status',   col: 'status' },
                      { label: 'Branch',   col: 'branch' },
                      { label: 'Last Run', col: 'lastRun' },
                      { label: 'Duration', col: 'duration' },
                    ].map(({ label, col }) => (
                      <th key={col} onClick={() => handleSort(col)}
                        className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:text-gray-800 group">
                        <div className="flex items-center gap-1">
                          {label}
                          <span className={`transition-opacity ${sortKey === col ? 'opacity-100 text-blue-500' : 'opacity-0 group-hover:opacity-40'}`}>
                            {sortKey === col && sortDir === 'asc'
                              ? <ChevronUp className="h-3.5 w-3.5" />
                              : <ChevronDown className="h-3.5 w-3.5" />}
                          </span>
                        </div>
                      </th>
                    ))}
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Config</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedPipelines.map(pipeline => {
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
                            pipeline.status === 'success' ? 'bg-green-600 text-white' :
                            pipeline.status === 'failed' ? 'bg-red-600 text-white' :
                            pipeline.status === 'running' ? 'bg-blue-600 text-white' :
                            'bg-gray-600 text-white'
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
                              <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded-full inline-block">
                                {pipeline.steps?.length || 0} steps
                              </span>
                            )}
                            {hasParameters && (
                              <span className="px-2 py-1 bg-purple-600 text-white text-xs rounded-full inline-block">
                                {pipeline.parameters?.length || 0} params
                              </span>
                            )}
                            {!hasSteps && !hasParameters && (
                              <span className="text-xs text-gray-400">No config</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            {/* Always show Run with Parameters button */}
                            <button
                              onClick={() => handleRunClick(pipeline)}
                              className="text-purple-600 hover:text-purple-700 transition-colors"
                              title="Run with Parameters"
                            >
                              <Sliders className="h-4 w-4" />
                            </button>

                            {/* Show Quick Run only if pipeline has default agent and no parameters */}
                            {!hasParameters && pipeline.agent_id && (
                              <button
                                onClick={() => handleQuickRun(pipeline)}
                                className="text-green-600 hover:text-green-700 transition-colors"
                                title="Quick Run (with default agent)"
                              >
                                <Play className="h-4 w-4" />
                              </button>
                            )}

                            <button
                              onClick={() => handleViewExecution(pipeline)}
                              className="text-blue-600 hover:text-blue-700 transition-colors"
                              title="Execution History"
                            >
                              <History className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleEditClick(pipeline)}
                              className="text-gray-600 hover:text-gray-700 transition-colors"
                              title="Edit Pipeline"
                            >
                              <Settings className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleExportSingle(pipeline)}
                              className="text-gray-400 hover:text-green-600 transition-colors"
                              title="Export Pipeline"
                            >
                              <FileDown className="h-4 w-4" />
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
        onRun={(params, agentId) => {
          handleRunPipeline(selectedPipeline?.id, params, agentId);
          setShowRunModal(false);
        }}
        pipeline={selectedPipeline}
        parameters={selectedPipeline?.parameters || []}
      />

      <ExecutionHistoryModal
        isOpen={showHistoryModal && !showExecutionModal}
        onClose={() => {
          setShowHistoryModal(false);
          setSelectedPipeline(null);
        }}
        pipelineId={selectedPipeline?.id || 0}
        pipelineName={selectedPipeline?.name || ''}
        onViewLogs={handleViewLogs}
      />

      {showImportModal && (
        <PipelineImportModal
          onClose={() => setShowImportModal(false)}
          onImported={() => { setShowImportModal(false); refetch(); }}
        />
      )}

      <ExecutionViewModal
        isOpen={showExecutionModal}
        onClose={() => {
          setShowExecutionModal(false);
          setCurrentExecutionId(null);
          // If opened from history, go back to history modal
          if (openedLogsFromHistory) {
            setOpenedLogsFromHistory(false);
            // showHistoryModal is still true, so it will re-appear
          }
        }}
        onStop={handleStopPipeline}
        pipelineId={selectedPipeline?.id || 0}
        pipelineName={selectedPipeline?.name || ''}
        executionId={currentExecutionId}
      />
    </>
  );
}