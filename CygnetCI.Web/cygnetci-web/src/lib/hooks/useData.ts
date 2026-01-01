// src/lib/hooks/useData.ts

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiService } from '../api/apiService';
import type { DashboardData } from '@/types';

const initialStats = {
  activeAgents: { value: "0", trend: 0 },
  runningPipelines: { value: "0", trend: 0 },
  successRate: { value: "0%", trend: 0 },
  avgDeployTime: { value: "0s", trend: 0 }
};

const initialData: DashboardData = {
  agents: [],
  pipelines: [],
  tasks: [],
  stats: initialStats,
  services: { categories: { todo: { title: '', services: [] }, monitoring: { title: '', services: [] }, issues: { title: '', services: [] }, healthy: { title: '', services: [] } } }
};

export const useData = (customerId?: number) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData>(initialData);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Cancel any pending request when customerId changes
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Clear data immediately when customer changes
        setData(initialData);

        // Create new abort controller for this request
        abortControllerRef.current = new AbortController();

        const fetchedData = await apiService.getAllData(customerId);

        // Only set data if this request wasn't aborted
        if (!abortControllerRef.current.signal.aborted) {
          setData(fetchedData);
        }

      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError(`Failed to fetch data: ${err.message}`);
          console.error('Error fetching dashboard data:', err);
        }
      } finally {
        if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
          setLoading(false);
        }
      }
    };

    if (customerId !== undefined) {
      fetchData();
    }

    // Cleanup function
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [customerId]);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setData(initialData);

      const fetchedData = await apiService.getAllData(customerId);
      setData(fetchedData);

    } catch (err: any) {
      setError(`Failed to fetch data: ${err.message}`);
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  return {
    ...data,
    loading,
    error,
    refetch
  };
};
