// src/components/cards/ServiceCard.tsx

import React from 'react';
import { Globe, Database, Server, Settings, Monitor, MoreVertical, GripVertical } from 'lucide-react';
import { StatusBadge } from '../common/StatusBadge';
import type { Service } from '@/types';

interface ServiceCardProps {
  service: Service;
  onDragStart: (e: React.DragEvent, serviceId: string) => void;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({ service, onDragStart }) => {
  const getServiceIcon = (type: string) => {
    switch (type) {
      case 'website': return Globe;
      case 'database': return Database;
      case 'api': return Server;
      case 'service': return Settings;
      default: return Monitor;
    }
  };

  const ServiceIcon = getServiceIcon(service.type);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, service.id)}
      className="bg-white rounded-lg shadow-md border border-gray-200 p-4 mb-3 cursor-move hover:shadow-lg transition-all duration-200 hover:border-blue-300"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <GripVertical className="h-4 w-4 text-gray-400 mt-1 flex-shrink-0" />
          <ServiceIcon className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-medium text-gray-900 truncate">{service.name}</h4>
            <p className="text-xs text-gray-500 truncate">{service.url}</p>
            <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
              <span>Response: {service.response}</span>
              <span>Uptime: {service.uptime}</span>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              Last check: {service.lastCheck}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <StatusBadge status={service.status} />
          <button className="text-gray-400 hover:text-gray-600">
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};