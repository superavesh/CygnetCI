// src/components/common/StatusBadge.tsx

import React from 'react';

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const statusConfig: Record<string, string> = {
    online: 'bg-green-500 text-white',
    offline: 'bg-red-500 text-white',
    busy: 'bg-yellow-500 text-black',
    success: 'bg-green-500 text-white',
    failed: 'bg-red-500 text-white',
    running: 'bg-blue-500 text-white',
    pending: 'bg-gray-500 text-white',
    completed: 'bg-green-500 text-white',
    queued: 'bg-gray-400 text-white',
    healthy: 'bg-green-500 text-white',
    warning: 'bg-yellow-500 text-black',
    critical: 'bg-orange-500 text-white',
    down: 'bg-red-500 text-white',
    unknown: 'bg-gray-500 text-white'
  };

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusConfig[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};