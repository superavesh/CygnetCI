// src/app/monitoring/page.tsx

'use client';

import React, { useEffect } from 'react';
import { Monitor, RefreshCw, CheckCircle, AlertTriangle, Activity } from 'lucide-react';
import { useData } from '@/lib/hooks/useData';
import { useDragDrop } from '@/lib/hooks/useDragDrop';
import { ServiceColumn } from '@/components/monitoring/ServiceColumn';
import { StatCard } from '@/components/cards/StatCard';
import { StatusBadge } from '@/components/common/StatusBadge';

export default function MonitoringPage() {
  const { services: initialServices, refetch } = useData();
  const { services, handleDragStart, handleDragOver, handleDrop } = useDragDrop(initialServices, refetch);

  const totalServices = Object.values(services.categories).reduce((acc: number, cat: any) => acc + cat.services.length, 0);
  const healthyCount = services.categories.healthy?.services?.length || 0;
  const issuesCount = services.categories.issues?.services?.length || 0;
  const monitoringCount = services.categories.monitoring?.services?.length || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Service Monitoring</h2>
        <div className="flex space-x-2">
          <button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors">
            <Monitor className="h-4 w-4" />
            <span>Add Service</span>
          </button>
          <button 
            onClick={refetch}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Service Monitoring Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Monitor className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-medium text-blue-900">Drag & Drop Service Management</h4>
            <p className="text-sm text-blue-700 mt-1">
              Drag services between columns to update their monitoring status. Services are organized by health status and monitoring priority.
            </p>
          </div>
        </div>
      </div>

      {/* Drag and Drop Service Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Object.entries(services.categories).map(([categoryId, category]: [string, any]) => (
          <ServiceColumn
            key={categoryId}
            title={category.title}
            services={category.services}
            categoryId={categoryId}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragStart={handleDragStart}
          />
        ))}
      </div>

      {/* Service Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
        <StatCard 
          title="Total Services" 
          value={totalServices.toString()}
          icon={Monitor} 
          color="bg-gradient-to-br from-blue-500 to-blue-600"
        />
        <StatCard 
          title="Healthy Services" 
          value={healthyCount.toString()}
          icon={CheckCircle} 
          color="bg-gradient-to-br from-green-500 to-green-600"
        />
        <StatCard 
          title="Issues Detected" 
          value={issuesCount.toString()}
          icon={AlertTriangle} 
          color="bg-gradient-to-br from-red-500 to-red-600"
        />
        <StatCard 
          title="Monitoring Active" 
          value={monitoringCount.toString()}
          icon={Activity} 
          color="bg-gradient-to-br from-purple-500 to-purple-600"
        />
      </div>

      {/* Simple Response Time Overview */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center">
            <Activity className="h-5 w-5 mr-2 text-blue-500" />
            Service Response Overview
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            ...services.categories.healthy?.services?.slice(0, 3) || [],
            ...services.categories.monitoring?.services?.slice(0, 3) || [],
            ...services.categories.issues?.services?.slice(0, 3) || []
          ].slice(0, 6).map((service: any) => (
            <div key={service.id} className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-800 truncate">{service.name}</h4>
                <StatusBadge status={service.status} />
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>Response:</span>
                  <span className="font-medium">{service.response}</span>
                </div>
                <div className="flex justify-between">
                  <span>Uptime:</span>
                  <span className="font-medium">{service.uptime}</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Check:</span>
                  <span className="font-medium">{service.lastCheck}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}