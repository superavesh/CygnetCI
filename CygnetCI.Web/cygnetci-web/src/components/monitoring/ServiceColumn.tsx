// src/components/monitoring/ServiceColumn.tsx

import React from 'react';
import { Monitor } from 'lucide-react';
import { ServiceCard } from '../cards/ServiceCard';
import type { Service } from '@/types';

interface ServiceColumnProps {
  title: string;
  services: Service[];
  categoryId: string;
  onDrop: (e: React.DragEvent, category: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragStart: (e: React.DragEvent, serviceId: string) => void;
}

export const ServiceColumn: React.FC<ServiceColumnProps> = ({ 
  title, 
  services, 
  categoryId, 
  onDrop, 
  onDragOver, 
  onDragStart 
}) => {
  const getColumnColor = (categoryId: string) => {
    switch (categoryId) {
      case 'healthy': return 'border-green-200 bg-green-50';
      case 'monitoring': return 'border-blue-200 bg-blue-50';
      case 'issues': return 'border-red-200 bg-red-50';
      case 'todo': return 'border-gray-200 bg-gray-50';
      default: return 'border-gray-200 bg-gray-50';
    }
  };

  return (
    <div 
      className={`rounded-lg p-4 ${getColumnColor(categoryId)} border-2 border-dashed transition-colors duration-200`}
      onDrop={(e) => onDrop(e, categoryId)}
      onDragOver={onDragOver}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800 flex items-center">
          {title}
          <span className="ml-2 bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-full">
            {services.length}
          </span>
        </h3>
      </div>
      <div className="space-y-2">
        {services.map(service => (
          <ServiceCard 
            key={service.id} 
            service={service} 
            onDragStart={onDragStart}
          />
        ))}
        {services.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <Monitor className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No services</p>
          </div>
        )}
      </div>
    </div>
  );
};