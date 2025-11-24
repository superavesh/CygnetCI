// src/components/common/LoadingState.tsx

import React from 'react';
import { RefreshCw } from 'lucide-react';

export const LoadingState: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
      <div className="flex items-center space-x-3">
        <RefreshCw className="h-8 w-8 text-blue-500 animate-spin" />
        <span className="text-xl text-gray-600">Loading Dashboard...</span>
      </div>
    </div>
  );
};