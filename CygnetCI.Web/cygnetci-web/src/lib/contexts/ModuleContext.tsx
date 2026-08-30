'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CONFIG } from '../config';
import { apiFetch } from '../apiClient';

interface SystemModule {
  key: string;
  display_name: string;
  enabled: boolean;
}

interface ModuleContextType {
  modules: SystemModule[];
  isModuleEnabled: (key: string) => boolean;
  isLoading: boolean;
  refreshModules: () => Promise<void>;
}

const ModuleContext = createContext<ModuleContextType | undefined>(undefined);

export const ModuleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modules, setModules] = useState<SystemModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchModules = useCallback(async () => {
    try {
      const response = await apiFetch(`${CONFIG.api.baseUrl}/system/modules`);
      if (!response.ok) throw new Error('Failed to fetch modules');
      const data = await response.json();
      setModules(data);
    } catch (error) {
      console.error('Failed to fetch modules:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  // Before the list has loaded, treat every module as enabled so nav/pages don't flash
  // hidden-then-shown — a disabled module is still enforced server-side regardless.
  const isModuleEnabled = (key: string) => {
    if (isLoading || modules.length === 0) return true;
    const found = modules.find(m => m.key === key);
    return found ? found.enabled : true;
  };

  return (
    <ModuleContext.Provider value={{ modules, isModuleEnabled, isLoading, refreshModules: fetchModules }}>
      {children}
    </ModuleContext.Provider>
  );
};

export const useModules = () => {
  const context = useContext(ModuleContext);
  if (!context) {
    throw new Error('useModules must be used within ModuleProvider');
  }
  return context;
};
