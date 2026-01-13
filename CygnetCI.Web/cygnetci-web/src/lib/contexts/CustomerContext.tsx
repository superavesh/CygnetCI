'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CONFIG } from '../config';

interface Customer {
  id: number;
  name: string;
  display_name: string;
  description?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  is_active: boolean;
  logo_url?: string;
  settings?: any;
  created_at: string;
  updated_at: string;
}

interface CustomerStatistics {
  customer_id: number;
  customer_name: string;
  display_name: string;
  is_active: boolean;
  total_agents: number;
  online_agents: number;
  total_pipelines: number;
  successful_pipelines: number;
  total_releases: number;
  total_services: number;
  total_users: number;
}

interface CustomerContextType {
  selectedCustomer: Customer | null;
  customers: Customer[];
  customerStats: CustomerStatistics | null;
  setSelectedCustomer: (customer: Customer) => void;
  isLoading: boolean;
  refreshCustomers: () => Promise<void>;
  refreshStats: () => Promise<void>;
}

const CustomerContext = createContext<CustomerContextType | undefined>(undefined);

export const CustomerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedCustomer, setSelectedCustomerState] = useState<Customer | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerStats, setCustomerStats] = useState<CustomerStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCustomers = useCallback(async () => {
    try {
      const response = await fetch(`${CONFIG.api.baseUrl}/customers/?active_only=true`);
      if (!response.ok) throw new Error('Failed to fetch customers');

      const data = await response.json();
      setCustomers(data);

      // Set selected customer from localStorage or first customer
      const savedCustomerId = localStorage.getItem('selectedCustomerId');
      if (savedCustomerId) {
        const savedCustomer = data.find((c: Customer) => c.id === parseInt(savedCustomerId));
        if (savedCustomer) {
          setSelectedCustomerState(savedCustomer);
          return;
        }
      }

      // Default to first customer
      if (data.length > 0) {
        setSelectedCustomerState(data[0]);
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchCustomerStats = useCallback(async (customerId: number) => {
    try {
      const response = await fetch(`${CONFIG.api.baseUrl}/customers/${customerId}/statistics`);
      if (!response.ok) throw new Error('Failed to fetch customer statistics');

      const data = await response.json();
      setCustomerStats(data);
    } catch (error) {
      console.error('Failed to fetch customer statistics:', error);
    }
  }, []);

  const setSelectedCustomer = useCallback((customer: Customer) => {
    setSelectedCustomerState(customer);
    localStorage.setItem('selectedCustomerId', customer.id.toString());
    fetchCustomerStats(customer.id);
  }, [fetchCustomerStats]);

  const refreshCustomers = useCallback(async () => {
    setIsLoading(true);
    await fetchCustomers();
  }, [fetchCustomers]);

  const refreshStats = useCallback(async () => {
    if (selectedCustomer) {
      await fetchCustomerStats(selectedCustomer.id);
    }
  }, [selectedCustomer, fetchCustomerStats]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    if (selectedCustomer) {
      fetchCustomerStats(selectedCustomer.id);
    }
  }, [selectedCustomer, fetchCustomerStats]);

  return (
    <CustomerContext.Provider
      value={{
        selectedCustomer,
        customers,
        customerStats,
        setSelectedCustomer,
        isLoading,
        refreshCustomers,
        refreshStats
      }}
    >
      {children}
    </CustomerContext.Provider>
  );
};

export const useCustomer = () => {
  const context = useContext(CustomerContext);
  if (!context) {
    throw new Error('useCustomer must be used within CustomerProvider');
  }
  return context;
};
