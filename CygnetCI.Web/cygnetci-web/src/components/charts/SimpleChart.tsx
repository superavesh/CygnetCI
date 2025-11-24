// src/components/charts/SimpleChart.tsx

import React from 'react';
import type { ResourceDataPoint } from '@/types';

interface SimpleChartProps {
  data: ResourceDataPoint[];
  title: string;
}

export const SimpleChart: React.FC<SimpleChartProps> = ({ data, title }) => {
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
      <div className="space-y-2">
        {data.slice(0, 6).map((item, index) => (
          <div key={index} className="flex items-center justify-between">
            <span className="text-sm text-gray-600">{item.time}</span>
            <div className="flex space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="text-sm">CPU: {item.cpu}%</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm">RAM: {item.memory}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};