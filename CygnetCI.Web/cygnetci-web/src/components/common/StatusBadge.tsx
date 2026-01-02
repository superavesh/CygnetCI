// src/components/common/StatusBadge.tsx

import React from 'react';

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const statusConfig: Record<string, string> = {
    online: 'bg-green-600 text-white',
    offline: 'bg-gray-600 text-white',
    busy: 'bg-amber-600 text-white',
    success: 'bg-green-600 text-white',
    failed: 'bg-red-600 text-white',
    running: 'bg-blue-600 text-white',
    pending: 'bg-amber-600 text-white',
    completed: 'bg-green-600 text-white',
    queued: 'bg-gray-600 text-white',
    healthy: 'bg-green-600 text-white',
    warning: 'bg-amber-600 text-white',
    critical: 'bg-red-600 text-white',
    down: 'bg-red-600 text-white',
    unknown: 'bg-gray-600 text-white',
    analyzing: 'bg-blue-600 text-white',
    active: 'bg-green-600 text-white',
    inactive: 'bg-gray-600 text-white'
  };

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusConfig[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};