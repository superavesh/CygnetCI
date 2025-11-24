// src/app/pipelines/page.tsx

'use client';

import React, { useState } from 'react';
import { Play } from 'lucide-react';
import { useData } from '@/lib/hooks/useData';
import { PipelineTable } from '@/components/tables/PipelineTable';
import { PipelineFilter, filterPipelines } from '@/components/tables/PipelineFilter';
import { apiService } from '@/lib/api/apiService';

export default function PipelinesPage() {
  const { pipelines, refetch } = useData();
  const [filterQuery, setFilterQuery] = useState('');

  const handleRunPipeline = async (pipelineId: number) => {
    try {
      await apiService.runPipeline(pipelineId);
      refetch();
    } catch (err) {
      console.error('Error running pipeline:', err);
    }
  };

  // Apply filters to pipelines
  const filteredPipelines = filterPipelines(pipelines, filterQuery);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Pipelines</h2>
          <p className="text-sm text-gray-600 mt-1">
            {filteredPipelines.length} of {pipelines.length} pipelines
          </p>
        </div>
        <button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors">
          <Play className="h-4 w-4" />
          <span>New Pipeline</span>
        </button>
      </div>

      {/* Search Filter */}
      <PipelineFilter onFilter={setFilterQuery} />

      {/* Pipelines Table */}
      {filteredPipelines.length > 0 ? (
        <PipelineTable pipelines={filteredPipelines} onRunPipeline={handleRunPipeline} />
      ) : (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <div className="text-gray-400 mb-4">
            <Play className="h-16 w-16 mx-auto" />
          </div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">No pipelines found</h3>
          <p className="text-gray-600">
            {filterQuery 
              ? 'Try adjusting your search filters' 
              : 'Get started by creating your first pipeline'}
          </p>
        </div>
      )}
    </div>
  );
}