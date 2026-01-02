'use client';

import { useState, useEffect } from 'react';
import { CONFIG } from '@/lib/config';
import { useCustomer } from '@/lib/contexts/CustomerContext';
import { Building2, Plus, Edit2, Trash2, Power, Mail, Phone, MapPin, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';

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
  created_at: string;
  updated_at: string;
}

interface CustomerStats {
  total_agents: number;
  online_agents: number;
  total_pipelines: number;
  successful_pipelines: number;
  total_releases: number;
  total_services: number;
  total_users: number;
}

export default function CustomersPage() {
  const { refreshCustomers } = useCustomer();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [customerStats, setCustomerStats] = useState<Record<number, CustomerStats>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    display_name: '',
    description: '',
    contact_email: '',
    contact_phone: '',
    address: ''
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    filterCustomers();
  }, [customers, searchQuery]);

  const fetchCustomers = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${CONFIG.api.baseUrl}/customers/`);
      const data = await response.json();
      setCustomers(data);

      for (const customer of data) {
        fetchCustomerStats(customer.id);
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCustomerStats = async (customerId: number) => {
    try {
      const response = await fetch(`${CONFIG.api.baseUrl}/customers/${customerId}/statistics`);
      const data = await response.json();
      setCustomerStats(prev => ({ ...prev, [customerId]: data }));
    } catch (error) {
      console.error(`Failed to fetch stats for customer ${customerId}:`, error);
    }
  };

  const filterCustomers = () => {
    if (!searchQuery.trim()) {
      setFilteredCustomers(customers);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = customers.filter(customer =>
      customer.display_name.toLowerCase().includes(query) ||
      customer.name.toLowerCase().includes(query) ||
      (customer.description && customer.description.toLowerCase().includes(query)) ||
      (customer.contact_email && customer.contact_email.toLowerCase().includes(query)) ||
      (customer.contact_phone && customer.contact_phone.toLowerCase().includes(query))
    );
    setFilteredCustomers(filtered);
    setCurrentPage(1); // Reset to first page when filtering
  };

  const handleCreate = async () => {
    try {
      const response = await fetch(`${CONFIG.api.baseUrl}/customers/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.detail || 'Failed to create customer'}`);
        return;
      }

      setShowCreateModal(false);
      setFormData({ name: '', display_name: '', description: '', contact_email: '', contact_phone: '', address: '' });
      fetchCustomers();
      refreshCustomers();
    } catch (error) {
      console.error('Failed to create customer:', error);
      alert('Failed to create customer');
    }
  };

  const handleUpdate = async () => {
    if (!selectedCustomer) return;

    try {
      const response = await fetch(`${CONFIG.api.baseUrl}/customers/${selectedCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.detail || 'Failed to update customer'}`);
        return;
      }

      setShowEditModal(false);
      setSelectedCustomer(null);
      fetchCustomers();
      refreshCustomers();
    } catch (error) {
      console.error('Failed to update customer:', error);
      alert('Failed to update customer');
    }
  };

  const handleToggleActive = async (customer: Customer) => {
    try {
      const endpoint = customer.is_active ? 'deactivate' : 'activate';
      const response = await fetch(`${CONFIG.api.baseUrl}/customers/${customer.id}/${endpoint}`, {
        method: 'POST'
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.detail || 'Failed to toggle customer status'}`);
        return;
      }

      fetchCustomers();
      refreshCustomers();
    } catch (error) {
      console.error('Failed to toggle customer status:', error);
      alert('Failed to toggle customer status');
    }
  };

  const handleDelete = async (customer: Customer) => {
    if (!confirm(`Are you sure you want to delete "${customer.display_name}"? This action cannot be undone and will delete all associated data.`)) {
      return;
    }

    try {
      const response = await fetch(`${CONFIG.api.baseUrl}/customers/${customer.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.detail || 'Failed to delete customer'}`);
        return;
      }

      fetchCustomers();
      refreshCustomers();
    } catch (error) {
      console.error('Failed to delete customer:', error);
      alert('Failed to delete customer');
    }
  };

  const openEditModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name,
      display_name: customer.display_name,
      description: customer.description || '',
      contact_email: customer.contact_email || '',
      contact_phone: customer.contact_phone || '',
      address: customer.address || ''
    });
    setShowEditModal(true);
  };

  // Pagination logic
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentCustomers = filteredCustomers.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading customers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Customer Management</h2>
          <p className="text-sm text-gray-600 mt-1">
            {filteredCustomers.length} of {customers.length} customers
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg flex items-center space-x-2 transition-all shadow-md hover:shadow-lg"
        >
          <Plus className="h-4 w-4" />
          <span>Add Customer</span>
        </button>
      </div>

      {/* Search Filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search customers by name, email, phone..."
          className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900 placeholder-gray-400"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full transition-colors"
            title="Clear search"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        )}
      </div>

      {/* Customer Table */}
      {filteredCustomers.length > 0 ? (
        <>
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 hover:border-blue-400 transition-all overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Statistics</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {currentCustomers.map((customer) => {
                    const stats = customerStats[customer.id];
                    return (
                      <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg mr-3">
                              <Building2 className="h-5 w-5 text-white" />
                            </div>
                            <div>
                              <div className="text-sm font-medium text-gray-900">{customer.display_name}</div>
                              <div className="text-xs text-gray-500">{customer.name}</div>
                              {customer.description && (
                                <div className="text-xs text-gray-500 mt-1 max-w-xs truncate">{customer.description}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            customer.is_active
                              ? 'bg-green-600 text-white'
                              : 'bg-red-600 text-white'
                          }`}>
                            {customer.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm space-y-1">
                            {customer.contact_email && (
                              <div className="flex items-center space-x-2 text-gray-600">
                                <Mail className="h-3 w-3 text-gray-400" />
                                <span className="truncate max-w-[200px]">{customer.contact_email}</span>
                              </div>
                            )}
                            {customer.contact_phone && (
                              <div className="flex items-center space-x-2 text-gray-600">
                                <Phone className="h-3 w-3 text-gray-400" />
                                <span>{customer.contact_phone}</span>
                              </div>
                            )}
                            {customer.address && (
                              <div className="flex items-center space-x-2 text-gray-600">
                                <MapPin className="h-3 w-3 text-gray-400" />
                                <span className="truncate max-w-[200px]">{customer.address}</span>
                              </div>
                            )}
                            {!customer.contact_email && !customer.contact_phone && !customer.address && (
                              <span className="text-xs text-gray-400">No contact info</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {stats ? (
                            <div className="flex flex-wrap gap-2">
                              <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                                {stats.total_agents} Agents
                              </span>
                              <span className="px-2 py-1 bg-green-600 text-white text-xs rounded-full">
                                {stats.total_pipelines} Pipelines
                              </span>
                              <span className="px-2 py-1 bg-purple-600 text-white text-xs rounded-full">
                                {stats.total_releases} Releases
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">Loading...</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => openEditModal(customer)}
                              className="text-blue-500 hover:text-blue-600 transition-colors"
                              title="Edit Customer"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleToggleActive(customer)}
                              className="text-gray-600 hover:text-gray-900 transition-colors"
                              title={customer.is_active ? 'Deactivate' : 'Activate'}
                            >
                              <Power className="h-4 w-4" />
                            </button>
                            {customer.name !== 'default' && (
                              <button
                                onClick={() => handleDelete(customer)}
                                className="text-red-600 hover:text-red-900 transition-colors"
                                title="Delete Customer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white px-6 py-4 rounded-lg border border-gray-200">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-700">
                  Showing {startIndex + 1} to {Math.min(endIndex, filteredCustomers.length)} of {filteredCustomers.length} customers
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4 text-gray-600" />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
                      currentPage === page
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {page}
                  </button>
                ))}

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4 text-gray-600" />
                </button>
              </div>

              <div className="flex items-center space-x-2">
                <label htmlFor="itemsPerPage" className="text-sm text-gray-700">
                  Items per page:
                </label>
                <select
                  id="itemsPerPage"
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-3 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 hover:border-blue-400 transition-all p-12 text-center">
          <Building2 className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            {searchQuery ? 'No customers found' : 'No Customers Found'}
          </h3>
          <p className="text-gray-600 mb-4">
            {searchQuery ? 'Try adjusting your search query' : 'Get started by creating your first customer'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
            >
              Create First Customer
            </button>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 bg-white">
              <h2 className="text-2xl font-bold text-gray-800">Create New Customer</h2>
              <p className="text-gray-600 text-sm mt-1">Add a new tenant customer to the system</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer Name (ID) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., acme-corp"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Lowercase, no spaces (unique identifier)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Display Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.display_name}
                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    placeholder="e.g., Acme Corporation"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the customer"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contact Email</label>
                  <input
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    placeholder="contact@example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contact Phone</label>
                  <input
                    type="tel"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                    placeholder="+1 234 567 8900"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Physical address"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setFormData({ name: '', display_name: '', description: '', contact_email: '', contact_phone: '', address: '' });
                }}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!formData.name || !formData.display_name}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
              >
                Create Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 bg-white">
              <h2 className="text-2xl font-bold text-gray-800">Edit Customer</h2>
              <p className="text-gray-600 text-sm mt-1">{selectedCustomer.display_name}</p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Display Name</label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contact Email</label>
                  <input
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contact Phone</label>
                  <input
                    type="tel"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedCustomer(null);
                }}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-all shadow-md hover:shadow-lg"
              >
                Update Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
