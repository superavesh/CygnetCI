// src/lib/hooks/useDragDrop.ts

'use client';

import { useState, useEffect } from 'react';
import { apiService } from '../api/apiService';
import type { Services } from '@/types';

export const useDragDrop = (initialServices: Services, onUpdate: () => void) => {
  const [services, setServices] = useState(initialServices);
  const [draggedService, setDraggedService] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Update local state only when initialServices changes from external source
  // but not during active drag operations
  useEffect(() => {
    if (!isDragging) {
      setServices(initialServices);
    }
  }, [initialServices, isDragging]);

  const handleDragStart = (e: React.DragEvent, serviceId: string) => {
    setDraggedService(serviceId);
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetCategory: string) => {
    e.preventDefault();
    
    if (!draggedService) {
      setIsDragging(false);
      return;
    }

    // Find the service and its current category
    let sourceCategory = '';
    let serviceToMove = null;

    Object.keys(services.categories).forEach(categoryKey => {
      const category = services.categories[categoryKey as keyof typeof services.categories];
      const service = category.services.find(s => s.id === draggedService);
      if (service) {
        sourceCategory = categoryKey;
        serviceToMove = service;
      }
    });

    if (serviceToMove && sourceCategory !== targetCategory) {
      // Update local state immediately for better UX
      const updatedServices = JSON.parse(JSON.stringify(services)); // Deep clone
      
      // Remove from source category
      const sourceCat = updatedServices.categories[sourceCategory as keyof typeof updatedServices.categories];
      sourceCat.services = sourceCat.services.filter((s: any) => s.id !== draggedService);
      
      // Add to target category
      const targetCat = updatedServices.categories[targetCategory as keyof typeof updatedServices.categories];
      targetCat.services.push(serviceToMove);
      
      setServices(updatedServices);

      // Call API to update backend
      try {
        await apiService.updateServiceStatus(draggedService, targetCategory);
        // Don't call onUpdate here as it would reset our local state
      } catch (err) {
        console.error('Error updating service status:', err);
        // Revert on error
        onUpdate();
      }
    }

    setDraggedService(null);
    setIsDragging(false);
  };

  return {
    services,
    setServices,
    handleDragStart,
    handleDragOver,
    handleDrop
  };
};