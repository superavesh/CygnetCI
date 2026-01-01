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

// Dummy customers data
const dummyCustomers: Customer[] = [
  {
    id: 1,
    name: 'acme_corp',
    display_name: 'Acme Corporation',
    description: 'Leading technology company',
    contact_email: 'admin@acme.com',
    contact_phone: '+1-555-0100',
    address: '123 Tech Street, Silicon Valley, CA',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 2,
    name: 'techstart_inc',
    display_name: 'TechStart Inc',
    description: 'Innovation startup',
    contact_email: 'contact@techstart.com',
    contact_phone: '+1-555-0200',
    address: '456 Innovation Ave, San Francisco, CA',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 3,
    name: 'global_solutions',
    display_name: 'Global Solutions Ltd',
    description: 'Enterprise software solutions',
    contact_email: 'info@globalsolutions.com',
    contact_phone: '+1-555-0300',
    address: '789 Enterprise Blvd, New York, NY',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

export const CustomerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedCustomer, setSelectedCustomerState] = useState<Customer | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerStats, setCustomerStats] = useState<CustomerStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCustomers = useCallback(async () => {
    try {
      if (!CONFIG.app.useRealAPI) {
        // Use dummy data
        setCustomers(dummyCustomers);
        const savedCustomerId = localStorage.getItem('selectedCustomerId');
        if (savedCustomerId) {
          const savedCustomer = dummyCustomers.find(c => c.id === parseInt(savedCustomerId));
          if (savedCustomer) {
            setSelectedCustomerState(savedCustomer);
            setIsLoading(false);
            return;
          }
        }
        setSelectedCustomerState(dummyCustomers[0]);
        setIsLoading(false);
        return;
      }

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
      // Fallback to dummy data on error
      setCustomers(dummyCustomers);
      if (dummyCustomers.length > 0) {
        setSelectedCustomerState(dummyCustomers[0]);
      }
    } finally {
      setIsLoading(false);
    }
  }, []); // Remove selectedCustomer dependency to prevent infinite loop

  const fetchCustomerStats = useCallback(async (customerId: number) => {
    try {
      if (!CONFIG.app.useRealAPI) {
        // Use dummy stats
        const customer = dummyCustomers.find(c => c.id === customerId);
        if (customer) {
          setCustomerStats({
            customer_id: customer.id,
            customer_name: customer.name,
            display_name: customer.display_name,
            is_active: customer.is_active,
            total_agents: 5,
            online_agents: 3,
            total_pipelines: 12,
            successful_pipelines: 10,
            total_releases: 8,
            total_services: 15,
            total_users: 20
          });
        }
        return;
      }

      const response = await fetch(`${CONFIG.api.baseUrl}/customers/${customerId}/statistics`);
      if (!response.ok) throw new Error('Failed to fetch customer statistics');

      const data = await response.json();
      setCustomerStats(data);
    } catch (error) {
      console.error('Failed to fetch customer statistics:', error);
      // Fallback to dummy stats on error
      const customer = dummyCustomers.find(c => c.id === customerId);
      if (customer) {
        setCustomerStats({
          customer_id: customer.id,
          customer_name: customer.name,
          display_name: customer.display_name,
          is_active: customer.is_active,
          total_agents: 5,
          online_agents: 3,
          total_pipelines: 12,
          successful_pipelines: 10,
          total_releases: 8,
          total_services: 15,
          total_users: 20
        });
      }
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
