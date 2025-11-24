// src/app/tasks/page.tsx

'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useData } from '@/lib/hooks/useData';
import { TaskTable } from '@/components/tables/TaskTable';

export default function TasksPage() {
  const { tasks, refetch } = useData();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Active Tasks</h2>
        <div className="flex space-x-2">
          <button 
            onClick={refetch}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <TaskTable tasks={tasks} />
    </div>
  );
}