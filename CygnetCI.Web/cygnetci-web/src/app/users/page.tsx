// src/app/users/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Search, Edit2, Trash2, Shield, Mail, Key, UserCheck, UserX, Lock, FileText, Clock } from 'lucide-react';
import { CONFIG } from '@/lib/config';
import { useCustomer } from '@/lib/contexts/CustomerContext';

interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
  role_id?: number;
  created_at: string;
  updated_at: string;
  last_login?: string;
}

interface Role {
  id: number;
  name: string;
  description: string;
  permissions: {
    [page: string]: {
      read: boolean;
      write: boolean;
      edit: boolean;
      delete: boolean;
    };
  };
  created_at: string;
  updated_at: string;
}

interface AuditLog {
  id: number;
  user_id: number;
  user_name: string;
  action: string;
  resource: string;
  details: string;
  timestamp: string;
}

export default function UsersPage() {
  const { selectedCustomer } = useCustomer();

  // Tab management
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'audit'>('users');

  // Users state
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
    is_superuser: false,
    role_id: undefined as number | undefined
  });

  // Roles state
  const [roles, setRoles] = useState<Role[]>([]);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleFormData, setRoleFormData] = useState({
    name: '',
    description: '',
    permissions: {} as Record<string, { read: boolean; write: boolean; edit: boolean; delete: boolean }>
  });

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditSearchQuery, setAuditSearchQuery] = useState('');

  const pages = ['Overview', 'Pipelines', 'Releases', 'Transfer', 'Rollback', 'Agents', 'Monitoring', 'Customers', 'Users', 'Tasks'];

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const url = selectedCustomer
        ? `${CONFIG.api.baseUrl}/users?customer_id=${selectedCustomer.id}`
        : `${CONFIG.api.baseUrl}/users`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch users');

      const data = await response.json();
      console.log('Fetched users from API:', data);
      console.log('Number of users fetched:', data.length);
      setUsers(data);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedCustomer?.id]); // Use only the ID, not the entire object

  const fetchRoles = useCallback(async () => {
    try {
      const response = await fetch(`${CONFIG.api.baseUrl}/roles`);
      if (response.ok) {
        const data = await response.json();
        setRoles(data);
      }
    } catch (error) {
      console.error('Error fetching roles:', error);
      // Set mock data for now
      setRoles([
        {
          id: 1,
          name: 'Administrator',
          description: 'Full system access',
          permissions: pages.reduce((acc, page) => {
            acc[page] = { read: true, write: true, edit: true, delete: true };
            return acc;
          }, {} as Record<string, { read: boolean; write: boolean; edit: boolean; delete: boolean }>),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 2,
          name: 'Developer',
          description: 'Read and write access to pipelines and releases',
          permissions: pages.reduce((acc, page) => {
            if (['Pipelines', 'Releases', 'Tasks'].includes(page)) {
              acc[page] = { read: true, write: true, edit: true, delete: false };
            } else {
              acc[page] = { read: true, write: false, edit: false, delete: false };
            }
            return acc;
          }, {} as Record<string, { read: boolean; write: boolean; edit: boolean; delete: boolean }>),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]);
    }
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    try {
      const response = await fetch(`${CONFIG.api.baseUrl}/audit-logs`);
      if (response.ok) {
        const data = await response.json();
        setAuditLogs(data);
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      // Set mock data for now
      setAuditLogs([
        {
          id: 1,
          user_id: 1,
          user_name: 'Admin User',
          action: 'CREATE',
          resource: 'User',
          details: 'Created new user: John Doe',
          timestamp: new Date().toISOString()
        },
        {
          id: 2,
          user_id: 1,
          user_name: 'Admin User',
          action: 'UPDATE',
          resource: 'Role',
          details: 'Updated role permissions for Developer',
          timestamp: new Date(Date.now() - 3600000).toISOString()
        }
      ]);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchRoles();
    fetchAuditLogs();
  }, [fetchUsers, fetchRoles, fetchAuditLogs]);

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
        is_superuser: false,
        role_id: undefined
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

  const filteredUsers = users.filter(user => {
    // If no search query, show all users
    if (!searchQuery) return true;

    const query = searchQuery.toLowerCase();
    return (
      (user.full_name?.toLowerCase().includes(query)) ||
      (user.email?.toLowerCase().includes(query)) ||
      (user.username?.toLowerCase().includes(query))
    );
  });

  console.log('Total users:', users.length);
  console.log('Filtered users:', filteredUsers.length);
  console.log('Search query:', searchQuery);
  console.log('Users data:', users);
  console.log('Filtered users data:', filteredUsers);

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
            Manage system users, roles, and audit trail
            {selectedCustomer && ` • Filtering for ${selectedCustomer.display_name}`}
          </p>
        </div>
        <button
          onClick={() => {
            if (activeTab === 'users') setShowAddModal(true);
            else if (activeTab === 'roles') setShowAddRoleModal(true);
          }}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>{activeTab === 'users' ? 'Add User' : activeTab === 'roles' ? 'Add Role' : ''}</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'users'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Users</span>
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'roles'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            <Lock className="h-4 w-4" />
            <span>Roles</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'audit'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>Audit Trail</span>
          </button>
        </div>
      </div>

      {/* Users Tab Content */}
      {activeTab === 'users' && (
        <>
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
                              {user.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{String(user.full_name || '')}</div>
                            <div className="text-sm text-gray-500 flex items-center space-x-1">
                              <Mail className="h-3 w-3" />
                              <span>{String(user.email || '')}</span>
                            </div>
                            <div className="text-xs text-gray-400">@{String(user.username || '')}</div>
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
                        {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleUpdate(user.id, { is_active: !user.is_active })}
                            className={`${
                              user.is_active
                                ? 'text-yellow-600 hover:text-yellow-700'
                                : 'text-green-600 hover:text-green-700'
                            } transition-colors`}
                            title={user.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {user.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => handleUpdate(user.id, { is_superuser: !user.is_superuser })}
                            className="text-purple-600 hover:text-purple-700 transition-colors"
                            title={user.is_superuser ? 'Remove Superuser' : 'Make Superuser'}
                          >
                            <Shield className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="text-red-600 hover:text-red-700 transition-colors"
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
        </>
      )}

      {/* Roles Tab Content */}
      {activeTab === 'roles' && (
        <>
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Roles & Permissions</h3>
              <p className="text-sm text-gray-600 mb-6">Define roles with specific permissions for different pages and actions</p>

              <div className="space-y-4">
                {roles.map(role => (
                  <div key={role.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-base font-semibold text-gray-900">{role.name}</h4>
                        <p className="text-sm text-gray-600">{role.description}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingRole(role);
                            setRoleFormData({
                              name: role.name,
                              description: role.description,
                              permissions: role.permissions
                            });
                            setShowAddRoleModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-700 transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button className="text-red-600 hover:text-red-700 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Permissions Grid */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-gray-700 font-medium">Page</th>
                            <th className="px-3 py-2 text-center text-gray-700 font-medium">Read</th>
                            <th className="px-3 py-2 text-center text-gray-700 font-medium">Write</th>
                            <th className="px-3 py-2 text-center text-gray-700 font-medium">Edit</th>
                            <th className="px-3 py-2 text-center text-gray-700 font-medium">Delete</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(role.permissions).map(([page, perms]) => (
                            <tr key={page} className="border-t border-gray-100">
                              <td className="px-3 py-2 text-gray-900">{page}</td>
                              <td className="px-3 py-2 text-center">
                                {perms.read ? <span className="text-green-600">✓</span> : <span className="text-gray-300">−</span>}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {perms.write ? <span className="text-green-600">✓</span> : <span className="text-gray-300">−</span>}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {perms.edit ? <span className="text-green-600">✓</span> : <span className="text-gray-300">−</span>}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {perms.delete ? <span className="text-green-600">✓</span> : <span className="text-gray-300">−</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Audit Trail Tab Content */}
      {activeTab === 'audit' && (
        <>
          {/* Search */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search audit logs..."
                value={auditSearchQuery}
                onChange={(e) => setAuditSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Resource</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {auditLogs
                    .filter(log =>
                      log.user_name?.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                      log.action?.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                      log.resource?.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                      log.details?.toLowerCase().includes(auditSearchQuery.toLowerCase())
                    )
                    .map(log => (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-gray-400" />
                            {new Date(log.timestamp).toLocaleString()}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.user_name}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            log.action === 'CREATE' ? 'bg-green-100 text-green-700' :
                            log.action === 'UPDATE' ? 'bg-blue-100 text-blue-700' :
                            log.action === 'DELETE' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.resource}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{log.details}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
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
                    setFormData({ username: '', email: '', full_name: '', password: '', is_superuser: false, role_id: undefined });
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

      {/* Add/Edit Role Modal */}
      {showAddRoleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 px-6 py-4 rounded-t-xl sticky top-0">
              <h3 className="text-xl font-bold text-white">{editingRole ? 'Edit Role' : 'Add New Role'}</h3>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                // Handle role creation/update
                console.log('Role form data:', roleFormData);
                setShowAddRoleModal(false);
                setEditingRole(null);
                setRoleFormData({ name: '', description: '', permissions: {} });
              }}
              className="p-6 space-y-6"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role Name</label>
                <input
                  type="text"
                  required
                  value={roleFormData.name}
                  onChange={(e) => setRoleFormData({ ...roleFormData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 bg-white"
                  placeholder="e.g., Developer, Viewer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  required
                  value={roleFormData.description}
                  onChange={(e) => setRoleFormData({ ...roleFormData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 bg-white"
                  rows={2}
                  placeholder="Brief description of this role"
                />
              </div>

              {/* Permissions Table */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Permissions</label>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-gray-700 font-medium">Page</th>
                        <th className="px-4 py-3 text-center text-gray-700 font-medium">Read</th>
                        <th className="px-4 py-3 text-center text-gray-700 font-medium">Write</th>
                        <th className="px-4 py-3 text-center text-gray-700 font-medium">Edit</th>
                        <th className="px-4 py-3 text-center text-gray-700 font-medium">Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pages.map(page => {
                        const perms = roleFormData.permissions[page] || { read: false, write: false, edit: false, delete: false };
                        return (
                          <tr key={page} className="border-t border-gray-100">
                            <td className="px-4 py-3 text-gray-900 font-medium">{page}</td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={perms.read}
                                onChange={(e) => {
                                  setRoleFormData({
                                    ...roleFormData,
                                    permissions: {
                                      ...roleFormData.permissions,
                                      [page]: { ...perms, read: e.target.checked }
                                    }
                                  });
                                }}
                                className="h-4 w-4 text-purple-500 focus:ring-purple-500 border-gray-300 rounded"
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={perms.write}
                                onChange={(e) => {
                                  setRoleFormData({
                                    ...roleFormData,
                                    permissions: {
                                      ...roleFormData.permissions,
                                      [page]: { ...perms, write: e.target.checked }
                                    }
                                  });
                                }}
                                className="h-4 w-4 text-purple-500 focus:ring-purple-500 border-gray-300 rounded"
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={perms.edit}
                                onChange={(e) => {
                                  setRoleFormData({
                                    ...roleFormData,
                                    permissions: {
                                      ...roleFormData.permissions,
                                      [page]: { ...perms, edit: e.target.checked }
                                    }
                                  });
                                }}
                                className="h-4 w-4 text-purple-500 focus:ring-purple-500 border-gray-300 rounded"
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={perms.delete}
                                onChange={(e) => {
                                  setRoleFormData({
                                    ...roleFormData,
                                    permissions: {
                                      ...roleFormData.permissions,
                                      [page]: { ...perms, delete: e.target.checked }
                                    }
                                  });
                                }}
                                className="h-4 w-4 text-purple-500 focus:ring-purple-500 border-gray-300 rounded"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex space-x-3 pt-4 sticky bottom-0 bg-white">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddRoleModal(false);
                    setEditingRole(null);
                    setRoleFormData({ name: '', description: '', permissions: {} });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors font-medium"
                >
                  {editingRole ? 'Update Role' : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
