// src/components/tables/PipelineTable.tsx

import React from 'react';
import { GitBranch, Play, Settings } from 'lucide-react';
import { StatusBadge } from '../common/StatusBadge';
import type { Pipeline } from '@/types';

interface PipelineTableProps {
  pipelines: Pipeline[];
  onRunPipeline: (pipelineId: number) => void;
}

export const PipelineTable: React.FC<PipelineTableProps> = ({ pipelines, onRunPipeline }) => {
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pipeline</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Branch</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Run</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {pipelines.map(pipeline => (
              <tr key={pipeline.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <GitBranch className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{pipeline.name}</div>
                      <div className="text-sm text-gray-500">#{pipeline.commit}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusBadge status={pipeline.status} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{pipeline.branch}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{pipeline.lastRun}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{pipeline.duration}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => onRunPipeline(pipeline.id)}
                      className="text-blue-600 hover:text-blue-900 transition-colors"
                      title="Run Pipeline"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                    <button className="text-gray-600 hover:text-gray-900 transition-colors">
                      <Settings className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};