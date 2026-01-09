'use client';

import { useCustomer } from '@/lib/contexts/CustomerContext';
import { useState, useEffect } from 'react';
import { Building2, ChevronDown, Check, Search } from 'lucide-react';

export default function CustomerSelector() {
  const { selectedCustomer, customers, setSelectedCustomer, isLoading } = useCustomer();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.customer-dropdown')) {
        setIsOpen(false);
        setSearchQuery(''); // Clear search when closing
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter customers based on search query
  const filteredCustomers = customers.filter(customer =>
    customer.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="animate-pulse bg-gray-200 h-10 w-56 rounded-lg"></div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        No customers available
      </div>
    );
  }

  return (
    <div className="relative customer-dropdown">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg hover:from-blue-100 hover:to-purple-100 transition-all shadow-sm"
      >
        <div className="text-sm font-medium text-gray-800 truncate">
          {selectedCustomer?.display_name || 'Select Customer'}
        </div>
        <ChevronDown className={`w-4 h-4 text-blue-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          ></div>

          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
            <div className="p-3">
              <div className="px-1 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Select Customer
              </div>

              {/* Search Input */}
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search customers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 text-sm bg-white"
                  style={{ borderColor: '#1a365d', color: '#1a365d' }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {/* Customer List */}
              <div className="max-h-80 overflow-y-auto">
                {filteredCustomers.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-gray-500">
                    No customers found
                  </div>
                ) : (
                  filteredCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setIsOpen(false);
                        setSearchQuery('');
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                        selectedCustomer?.id === customer.id
                          ? 'bg-gray-100 border'
                          : 'hover:bg-gray-50'
                      }`}
                      style={selectedCustomer?.id === customer.id ? { borderColor: '#1a365d', color: '#1a365d' } : { color: '#4b5563' }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 font-medium text-sm">
                          {customer.display_name}
                        </div>
                        {selectedCustomer?.id === customer.id && (
                          <Check className="w-4 h-4 flex-shrink-0 ml-2" style={{ color: '#1a365d' }} />
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="border-t border-gray-100 p-2">
              <a
                href="/customers"
                className="block w-full text-center px-3 py-2 text-sm font-medium hover:bg-gray-100 rounded-lg transition-colors"
                style={{ color: '#1a365d' }}
                onClick={() => {
                  setIsOpen(false);
                  setSearchQuery('');
                }}
              >
                Manage Customers
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
