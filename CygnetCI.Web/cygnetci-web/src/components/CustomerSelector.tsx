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
      <div className="animate-pulse bg-[#0F2A3D] h-10 w-56 rounded-lg"></div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="text-sm text-gray-300">
        No customers available
      </div>
    );
  }

  return (
    <div className="relative customer-dropdown">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-[#FEB114] hover:text-[#081D2B] hover:border-[#FEB114] transition-colors min-w-[200px] shadow-sm"
      >
        <div className="p-1 bg-gradient-to-r from-[#FEB114] to-[#E59D00] rounded">
          <Building2 className="w-4 h-4 text-[#081D2B]" />
        </div>
        <div className="flex-1 text-left">
          <div className="text-xs text-gray-500">Customer</div>
          <div className="text-sm font-medium text-[#081D2B] truncate">
            {selectedCustomer?.display_name || 'Select Customer'}
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-[#081D2B] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          ></div>

          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-100 rounded-xl shadow-lg z-50 overflow-hidden">
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
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FEB114] text-sm text-[#081D2B] bg-white"
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
                          ? 'bg-[#FEB114] text-[#081D2B]'
                          : 'hover:bg-gray-50 text-[#081D2B]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 font-medium text-sm">
                          {customer.display_name}
                        </div>
                        {selectedCustomer?.id === customer.id && (
                          <Check className="w-4 h-4 text-[#081D2B] flex-shrink-0 ml-2" />
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
                className="block w-full text-center px-3 py-2 text-sm font-medium text-[#FEB114] hover:bg-[#FEB114] hover:text-[#081D2B] rounded-lg transition-colors"
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
