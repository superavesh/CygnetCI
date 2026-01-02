// src/app/users/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Search, Edit2, Trash2, Shield, Mail, Key, UserCheck, UserX } from 'lucide-react';
import { CONFIG } from '@/lib/config';
import { useCustomer } from '@/lib/contexts/CustomerContext';

interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
}

export default function UsersPage() {
  const { selectedCustomer } = useCustomer();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    full_name: '',
    password: '',
    is_superuser: false
  });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const url = selectedCustomer
        ? `${CONFIG.api.baseUrl}/users?customer_id=${selectedCustomer.id}`
        : `${CONFIG.api.baseUrl}/users`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch users');

      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedCustomer?.id]); // Use only the ID, not the entire object

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('username', formData.username);
      formDataToSend.append('email', formData.email);
      formDataToSend.append('full_name', formData.full_name);
      formDataToSend.append('password', formData.password);
      formDataToSend.append('is_superuser', formData.is_superuser.toString());

      const response = await fetch(`${CONFIG.api.baseUrl}/users`, {
        method: 'POST',
        body: formDataToSend
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create user');
      }

      await fetchUsers();
      setShowAddModal(false);
      setFormData({
        username: '',
        email: '',
        full_name: '',
        password: '',
        is_superuser: false
      });
    } catch (error: any) {
      alert(error.message);
      console.error('Error creating user:', error);
    }
  };

  const handleUpdate = async (userId: number, updates: Partial<User>) => {
    try {
      const formDataToSend = new FormData();
      if (updates.email) formDataToSend.append('email', updates.email);
      if (updates.full_name) formDataToSend.append('full_name', updates.full_name);
      if (updates.is_active !== undefined) formDataToSend.append('is_active', updates.is_active.toString());
      if (updates.is_superuser !== undefined) formDataToSend.append('is_superuser', updates.is_superuser.toString());

      const response = await fetch(`${CONFIG.api.baseUrl}/users/${userId}`, {
        method: 'PUT',
        body: formDataToSend
      });

      if (!response.ok) throw new Error('Failed to update user');

      await fetchUsers();
      setEditingUser(null);
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Failed to update user');
    }
  };

  const handleDelete = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      const response = await fetch(`${CONFIG.api.baseUrl}/users/${userId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete user');

      await fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user');
    }
  };

  const filteredUsers = users.filter(user =>
    user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRoleDisplay = (user: User) => {
    if (user.is_superuser) return { text: 'Superuser', color: 'bg-purple-600 text-white border border-purple-300' };
    return { text: 'User', color: 'bg-blue-600 text-white border border-blue-300' };
  };

  const getStatusDisplay = (isActive: boolean) => {
    return isActive
      ? { text: 'Active', color: 'bg-green-600 text-white' }
      : { text: 'Inactive', color: 'bg-gray-600 text-white' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">User Management</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage system users for authentication and authorization
            {selectedCustomer && ` • Filtering for ${selectedCustomer.display_name}`}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>Add User</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search users by name, email, or username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      </div>

      {/* Users Table */}
      {filteredUsers.length > 0 ? (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Last Login</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map(user => {
                  const role = getRoleDisplay(user);
                  const status = getStatusDisplay(user.is_active);

                  return (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                            <span className="text-sm font-bold text-white">
                              {user.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{user.full_name}</div>
                            <div className="text-sm text-gray-500 flex items-center space-x-1">
                              <Mail className="h-3 w-3" />
                              <span>{user.email}</span>
                            </div>
                            <div className="text-xs text-gray-400">@{user.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center space-x-1 w-fit ${role.color}`}>
                          {user.is_superuser && <Shield className="h-3 w-3" />}
                          <span>{role.text}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center space-x-1 w-fit ${status.color}`}>
                          {user.is_active ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                          <span>{status.text}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleUpdate(user.id, { is_active: !user.is_active })}
                            className={`${user.is_active ? 'text-yellow-600 hover:text-yellow-900' : 'text-green-600 hover:text-blue-700'} transition-colors`}
                            title={user.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {user.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => handleUpdate(user.id, { is_superuser: !user.is_superuser })}
                            className="text-purple-600 hover:text-purple-900 transition-colors"
                            title={user.is_superuser ? 'Remove Superuser' : 'Make Superuser'}
                          >
                            <Shield className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="text-red-600 hover:text-red-900 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-800 mb-2">No users found</h3>
          <p className="text-gray-600 mb-4">
            {searchQuery ? 'Try adjusting your search' : 'Get started by adding your first user'}
          </p>
        </div>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 px-6 py-4 rounded-t-xl">
              <h3 className="text-xl font-bold text-white">Add New User</h3>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_superuser"
                  checked={formData.is_superuser}
                  onChange={(e) => setFormData({ ...formData, is_superuser: e.target.checked })}
                  className="h-4 w-4 text-blue-500 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="is_superuser" className="ml-2 block text-sm text-gray-700">
                  Make Superuser
                </label>
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setFormData({ username: '', email: '', full_name: '', password: '', is_superuser: false });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
