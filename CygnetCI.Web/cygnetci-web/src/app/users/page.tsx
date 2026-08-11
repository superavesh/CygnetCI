// src/app/users/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Search, Edit2, Trash2, Shield, Mail, Key, UserCheck, UserX, Lock, FileText, Clock, AlertCircle, CheckCircle, X, RefreshCw, UserCog, Building2 } from 'lucide-react';
import { CONFIG } from '@/lib/config';
import { useCustomer } from '@/lib/contexts/CustomerContext';

interface UserRoleRef {
  id: number;
  name: string;
}

interface UserCustomerRef {
  id: number;
  name: string;
  display_name: string;
}

interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
  role_id?: number;
  roles?: UserRoleRef[];
  role_ids?: number[];
  customers?: UserCustomerRef[];
  customer_ids?: number[];
  created_at: string;
  updated_at: string;
  last_login?: string;
}

interface CustomerRef {
  id: number;
  name: string;
  display_name: string;
  is_active: boolean;
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
  resource_type: string;
  details: string | Record<string, any>;
  created_at: string;
}

type NotificationType = 'success' | 'error' | 'info';

interface Notification {
  id: number;
  type: NotificationType;
  message: string;
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    full_name: '',
    password: '',
    is_superuser: false,
    role_id: undefined as number | undefined
  });
  const [passwordResetData, setPasswordResetData] = useState({
    userId: 0,
    newPassword: '',
    confirmPassword: ''
  });

  // Manage Access (roles + customers) state
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [accessUser, setAccessUser] = useState<User | null>(null);
  const [availableCustomers, setAvailableCustomers] = useState<CustomerRef[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([]);

  // Roles state
  const [roles, setRoles] = useState<Role[]>([]);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleFormData, setRoleFormData] = useState({
    name: '',
    description: '',
    permissions: {} as Record<string, { read: boolean; write: boolean; edit: boolean; delete: boolean }>
  });
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);
  const [roleSearchQuery, setRoleSearchQuery] = useState('');
  const [expandedRoles, setExpandedRoles] = useState<Set<number>>(new Set());

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditFilterAction, setAuditFilterAction] = useState<string>('all');
  const [auditDateFrom, setAuditDateFrom] = useState('');
  const [auditDateTo, setAuditDateTo] = useState('');

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationId, setNotificationId] = useState(0);

  // Loading states
  const [actionLoading, setActionLoading] = useState(false);

  const pages = ['Overview', 'Pipelines', 'Releases', 'Transfer', 'Rollback', 'Agents', 'Monitoring', 'Customers', 'Users', 'Tasks'];

  const showNotification = (type: NotificationType, message: string) => {
    const id = notificationId;
    setNotificationId(prev => prev + 1);
    setNotifications(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const removeNotification = (id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      // Always fetch all users - users are global, not filtered by customer
      const url = `${CONFIG.api.baseUrl}/users`;

      console.log('[UsersPage] Fetching users from:', url);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch users');

      const data = await response.json();
      console.log('[UsersPage] Received users:', data.length, 'users');
      setUsers(data);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  }, []); // No dependencies - users are global

  const fetchRoles = useCallback(async () => {
    try {
      const response = await fetch(`${CONFIG.api.baseUrl}/roles`);
      if (response.ok) {
        const data = await response.json();
        setRoles(data);
      }
    } catch (error) {
      console.error('Error fetching roles:', error);
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
    }
  }, []);

  const fetchCustomers = useCallback(async () => {
    try {
      const response = await fetch(`${CONFIG.api.baseUrl}/customers/?active_only=true`);
      if (response.ok) {
        const data = await response.json();
        setAvailableCustomers(data);
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchRoles();
    fetchAuditLogs();
    fetchCustomers();
  }, [fetchUsers, fetchRoles, fetchAuditLogs, fetchCustomers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);

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
      showNotification('success', `User "${formData.username}" created successfully!`);
    } catch (error: any) {
      showNotification('error', error.message || 'Failed to create user');
      console.error('Error creating user:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdate = async (userId: number, updates: Partial<User>) => {
    setActionLoading(true);
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
      setShowEditModal(false);
      showNotification('success', 'User updated successfully!');
    } catch (error) {
      console.error('Error updating user:', error);
      showNotification('error', 'Failed to update user');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      password: '',
      is_superuser: user.is_superuser,
      role_id: user.role_id
    });
    setShowEditModal(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    await handleUpdate(editingUser.id, {
      email: formData.email,
      full_name: formData.full_name,
      is_superuser: formData.is_superuser
    });
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordResetData.newPassword !== passwordResetData.confirmPassword) {
      showNotification('error', 'Passwords do not match!');
      return;
    }

    if (passwordResetData.newPassword.length < 6) {
      showNotification('error', 'Password must be at least 6 characters long!');
      return;
    }

    setActionLoading(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('password', passwordResetData.newPassword);

      const response = await fetch(`${CONFIG.api.baseUrl}/users/${passwordResetData.userId}`, {
        method: 'PUT',
        body: formDataToSend
      });

      if (!response.ok) throw new Error('Failed to reset password');

      setShowPasswordResetModal(false);
      setPasswordResetData({ userId: 0, newPassword: '', confirmPassword: '' });
      showNotification('success', 'Password reset successfully!');
    } catch (error) {
      console.error('Error resetting password:', error);
      showNotification('error', 'Failed to reset password');
    } finally {
      setActionLoading(false);
    }
  };

  const openAccessModal = (user: User) => {
    setAccessUser(user);
    setSelectedRoleIds(user.role_ids ?? (user.roles ?? []).map(r => r.id));
    setSelectedCustomerIds(user.customer_ids ?? (user.customers ?? []).map(c => c.id));
    setShowAccessModal(true);
  };

  const toggleRoleId = (roleId: number) => {
    setSelectedRoleIds(prev =>
      prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]
    );
  };

  const toggleCustomerId = (customerId: number) => {
    setSelectedCustomerIds(prev =>
      prev.includes(customerId) ? prev.filter(id => id !== customerId) : [...prev, customerId]
    );
  };

  const handleSaveAccess = async () => {
    if (!accessUser) return;
    setActionLoading(true);
    try {
      const response = await fetch(`${CONFIG.api.baseUrl}/users/${accessUser.id}/access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_ids: selectedRoleIds, customer_ids: selectedCustomerIds })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'Failed to update access');
      }

      await fetchUsers();
      setShowAccessModal(false);
      setAccessUser(null);
      showNotification('success', `Access updated for "${accessUser.username}"`);
    } catch (error: any) {
      console.error('Error updating access:', error);
      showNotification('error', error.message || 'Failed to update access');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (userId: number, username: string) => {
    if (!confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) return;

    setActionLoading(true);
    try {
      const response = await fetch(`${CONFIG.api.baseUrl}/users/${userId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete user');

      await fetchUsers();
      showNotification('success', `User "${username}" deleted successfully!`);
    } catch (error) {
      console.error('Error deleting user:', error);
      showNotification('error', 'Failed to delete user');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);

    try {
      const response = await fetch(`${CONFIG.api.baseUrl}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roleFormData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create role');
      }

      await fetchRoles();
      setShowAddRoleModal(false);
      setRoleFormData({ name: '', description: '', permissions: {} });
      showNotification('success', `Role "${roleFormData.name}" created successfully!`);
    } catch (error: any) {
      showNotification('error', error.message || 'Failed to create role');
      console.error('Error creating role:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole) return;

    setActionLoading(true);
    try {
      const response = await fetch(`${CONFIG.api.baseUrl}/roles/${editingRole.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roleFormData)
      });

      if (!response.ok) throw new Error('Failed to update role');

      await fetchRoles();
      setShowAddRoleModal(false);
      setEditingRole(null);
      setRoleFormData({ name: '', description: '', permissions: {} });
      showNotification('success', 'Role updated successfully!');
    } catch (error) {
      console.error('Error updating role:', error);
      showNotification('error', 'Failed to update role');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteRole = async (roleId: number, roleName: string) => {
    if (!confirm(`Are you sure you want to delete role "${roleName}"? This action cannot be undone.`)) return;

    setActionLoading(true);
    try {
      const response = await fetch(`${CONFIG.api.baseUrl}/roles/${roleId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete role');

      await fetchRoles();
      showNotification('success', `Role "${roleName}" deleted successfully!`);
    } catch (error) {
      console.error('Error deleting role:', error);
      showNotification('error', 'Failed to delete role');
    } finally {
      setActionLoading(false);
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

  const getStatusDisplay = (isActive: boolean) => {
    return isActive
      ? { text: 'Active', color: 'bg-green-600 text-white' }
      : { text: 'Inactive', color: 'bg-gray-600 text-white' };
  };

  const toggleRoleExpansion = (roleId: number) => {
    setExpandedRoles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(roleId)) {
        newSet.delete(roleId);
      } else {
        newSet.add(roleId);
      }
      return newSet;
    });
  };

  const getFilteredRoles = () => {
    if (!roleSearchQuery) return roles;
    const query = roleSearchQuery.toLowerCase();
    return roles.filter(role =>
      role.name.toLowerCase().includes(query) ||
      role.description.toLowerCase().includes(query)
    );
  };

  const getFilteredAuditLogs = () => {
    return auditLogs.filter(log => {
      // Search query filter
      const query = auditSearchQuery.toLowerCase();
      const detailsStr = typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || '');
      const matchesSearch = !query || (
        log.user_name?.toLowerCase().includes(query) ||
        log.action?.toLowerCase().includes(query) ||
        log.resource_type?.toLowerCase().includes(query) ||
        detailsStr.toLowerCase().includes(query)
      );

      // Action filter
      const matchesAction = auditFilterAction === 'all' || log.action === auditFilterAction;

      // Date filters
      const logDate = new Date(log.created_at);
      const matchesDateFrom = !auditDateFrom || logDate >= new Date(auditDateFrom);
      const matchesDateTo = !auditDateTo || logDate <= new Date(auditDateTo + 'T23:59:59');

      return matchesSearch && matchesAction && matchesDateFrom && matchesDateTo;
    });
  };

  const getUniqueActions = () => {
    const actions = new Set(auditLogs.map(log => log.action));
    return Array.from(actions).sort();
  };

  const getPermissionSummary = (permissions: Record<string, any>) => {
    const perms = Object.values(permissions).flat();
    const total = perms.length * 4; // 4 permission types
    const granted = perms.reduce((acc: number, perm: any) => {
      return acc + (perm.read ? 1 : 0) + (perm.write ? 1 : 0) + (perm.edit ? 1 : 0) + (perm.delete ? 1 : 0);
    }, 0);
    return { granted, total, percentage: total > 0 ? Math.round((granted / total) * 100) : 0 };
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
      {/* Notifications */}
      <div className="fixed top-4 right-4 z-[60] space-y-2">
        {notifications.map(notification => (
          <div
            key={notification.id}
            className={`flex items-center gap-3 min-w-[300px] px-4 py-3 rounded-lg shadow-lg border animate-slide-in ${
              notification.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : notification.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}
          >
            {notification.type === 'success' && <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />}
            {notification.type === 'error' && <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />}
            {notification.type === 'info' && <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />}
            <span className="text-sm font-medium flex-1">{notification.message}</span>
            <button
              onClick={() => removeNotification(notification.id)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">User Management</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage system users, roles, and audit trail
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              fetchUsers();
              fetchRoles();
              fetchAuditLogs();
              showNotification('info', 'Data refreshed');
            }}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
            disabled={actionLoading}
          >
            <RefreshCw className={`h-4 w-4 ${actionLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          {activeTab !== 'audit' && (
            <button
              onClick={() => {
                if (activeTab === 'users') setShowAddModal(true);
                else if (activeTab === 'roles') setShowAddRoleModal(true);
              }}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
              disabled={actionLoading}
            >
              <Plus className="h-4 w-4" />
              <span>{activeTab === 'users' ? 'Add User' : 'Add Role'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg shadow border border-gray-200 p-1.5">
        <div className="flex gap-1.5">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-md font-medium transition-all duration-200 flex items-center gap-2 ${
              activeTab === 'users'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <div className={`p-1 rounded ${
              activeTab === 'users' ? 'bg-blue-100' : 'bg-transparent'
            }`}>
              <Users className={`h-3.5 w-3.5 ${activeTab === 'users' ? 'text-blue-600' : 'text-gray-500'}`} />
            </div>
            <span className="text-sm">Users</span>
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`px-4 py-2 rounded-md font-medium transition-all duration-200 flex items-center gap-2 ${
              activeTab === 'roles'
                ? 'bg-white text-purple-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <div className={`p-1 rounded ${
              activeTab === 'roles' ? 'bg-purple-100' : 'bg-transparent'
            }`}>
              <Shield className={`h-3.5 w-3.5 ${activeTab === 'roles' ? 'text-purple-600' : 'text-gray-500'}`} />
            </div>
            <span className="text-sm">Roles</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-md font-medium transition-all duration-200 flex items-center gap-2 ${
              activeTab === 'audit'
                ? 'bg-white text-green-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <div className={`p-1 rounded ${
              activeTab === 'audit' ? 'bg-green-100' : 'bg-transparent'
            }`}>
              <FileText className={`h-3.5 w-3.5 ${activeTab === 'audit' ? 'text-green-600' : 'text-gray-500'}`} />
            </div>
            <span className="text-sm">Audit Trail</span>
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
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex flex-wrap gap-1 items-center">
                            {user.is_superuser && (
                              <span className="px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit bg-purple-600 text-white border border-purple-300">
                                <Shield className="h-3 w-3" />
                                <span>Superuser</span>
                              </span>
                            )}
                            {(user.roles ?? []).map(r => (
                              <span key={r.id} className="px-2.5 py-1 rounded-full text-xs font-medium w-fit bg-blue-600 text-white border border-blue-300">
                                {r.name}
                              </span>
                            ))}
                            {!user.is_superuser && (user.roles ?? []).length === 0 && (
                              <span className="px-2.5 py-1 rounded-full text-xs font-medium w-fit bg-gray-200 text-gray-600">
                                No role
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Building2 className="h-3 w-3" />
                            <span>
                              {(user.customers ?? []).length > 0
                                ? `${(user.customers ?? []).length} customer${(user.customers ?? []).length > 1 ? 's' : ''}`
                                : 'No customer access'}
                            </span>
                          </div>
                        </div>
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
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditUser(user)}
                            className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                            title="Edit User"
                            disabled={actionLoading}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              setPasswordResetData({ userId: user.id, newPassword: '', confirmPassword: '' });
                              setShowPasswordResetModal(true);
                            }}
                            className="p-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded transition-colors"
                            title="Reset Password"
                            disabled={actionLoading}
                          >
                            <Key className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleUpdate(user.id, { is_active: !user.is_active })}
                            className={`p-1.5 rounded transition-colors ${
                              user.is_active
                                ? 'text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50'
                                : 'text-green-600 hover:text-green-700 hover:bg-green-50'
                            }`}
                            title={user.is_active ? 'Deactivate' : 'Activate'}
                            disabled={actionLoading}
                          >
                            {user.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => openAccessModal(user)}
                            className="p-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded transition-colors"
                            title="Manage Access (roles & customers)"
                            disabled={actionLoading}
                          >
                            <UserCog className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleUpdate(user.id, { is_superuser: !user.is_superuser })}
                            className="p-1.5 text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded transition-colors"
                            title={user.is_superuser ? 'Remove Superuser' : 'Make Superuser'}
                            disabled={actionLoading}
                          >
                            <Shield className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(user.id, user.username)}
                            className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                            title="Delete User"
                            disabled={actionLoading}
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
          {/* Search */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search roles by name or description..."
                value={roleSearchQuery}
                onChange={(e) => setRoleSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>

          {getFilteredRoles().length === 0 ? (
            <div className="bg-white rounded-xl shadow-lg p-12 text-center">
              <Lock className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                {roleSearchQuery ? 'No matching roles found' : 'No roles found'}
              </h3>
              <p className="text-gray-600 mb-4">
                {roleSearchQuery
                  ? 'Try adjusting your search criteria'
                  : 'Create roles to manage user permissions across different pages'}
              </p>
              {!roleSearchQuery && (
                <button
                  onClick={() => setShowAddRoleModal(true)}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center space-x-2 transition-colors mx-auto"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Your First Role</span>
                </button>
              )}
            </div>
          ) : (
          <div className="space-y-4">
            {/* Roles Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Roles</p>
                    <p className="text-2xl font-bold text-gray-900">{roles.length}</p>
                  </div>
                  <Lock className="h-10 w-10 text-purple-500" />
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Showing</p>
                    <p className="text-2xl font-bold text-gray-900">{getFilteredRoles().length}</p>
                  </div>
                  <Shield className="h-10 w-10 text-blue-500" />
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Pages</p>
                    <p className="text-2xl font-bold text-gray-900">{pages.length}</p>
                  </div>
                  <FileText className="h-10 w-10 text-green-500" />
                </div>
              </div>
            </div>

            {/* Roles List */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Roles & Permissions</h3>
                <p className="text-sm text-gray-600 mb-6">Define roles with specific permissions for different pages and actions</p>

                <div className="space-y-4">
                  {getFilteredRoles().map(role => {
                    const isExpanded = expandedRoles.has(role.id);
                    const permSummary = getPermissionSummary(role.permissions);
                    return (
                    <div key={role.id} className="border-2 border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-all">
                      {/* Role Header */}
                      <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="bg-purple-600 p-2 rounded-lg">
                                <Shield className="h-5 w-5 text-white" />
                              </div>
                              <div>
                                <h4 className="text-lg font-bold text-gray-900">{role.name}</h4>
                                <p className="text-sm text-gray-600">{role.description}</p>
                              </div>
                            </div>
                            {/* Permission Summary */}
                            <div className="flex items-center gap-4 mt-3">
                              <div className="flex items-center gap-2">
                                <div className="text-xs text-gray-600">Permissions:</div>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-semibold text-gray-900">{permSummary.granted}</span>
                                  <span className="text-xs text-gray-500">/ {permSummary.total}</span>
                                </div>
                              </div>
                              <div className="flex-1 max-w-xs">
                                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all"
                                    style={{ width: `${permSummary.percentage}%` }}
                                  />
                                </div>
                              </div>
                              <span className="text-xs font-medium text-gray-600">{permSummary.percentage}%</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <button
                              onClick={() => toggleRoleExpansion(role.id)}
                              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg transition-colors"
                              title={isExpanded ? 'Collapse' : 'Expand'}
                            >
                              {isExpanded ? (
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                </svg>
                              ) : (
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              )}
                            </button>
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
                              className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-colors"
                              title="Edit Role"
                              disabled={actionLoading}
                            >
                              <Edit2 className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteRole(role.id, role.name)}
                              className="p-2 text-red-600 hover:text-red-700 hover:bg-red-100 rounded-lg transition-colors"
                              title="Delete Role"
                              disabled={actionLoading}
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Permissions Grid - Collapsible */}
                      {isExpanded && (
                        <div className="p-4 bg-white">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-100 border-b-2 border-gray-200">
                                <tr>
                                  <th className="px-4 py-3 text-left text-gray-700 font-semibold">Page</th>
                                  <th className="px-4 py-3 text-center text-gray-700 font-semibold">Read</th>
                                  <th className="px-4 py-3 text-center text-gray-700 font-semibold">Write</th>
                                  <th className="px-4 py-3 text-center text-gray-700 font-semibold">Edit</th>
                                  <th className="px-4 py-3 text-center text-gray-700 font-semibold">Delete</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(role.permissions).map(([page, perms]) => (
                                  <tr key={page} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 text-gray-900 font-medium">{page}</td>
                                    <td className="px-4 py-3 text-center">
                                      {perms.read ? (
                                        <CheckCircle className="h-5 w-5 text-green-600 inline" />
                                      ) : (
                                        <X className="h-5 w-5 text-gray-300 inline" />
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      {perms.write ? (
                                        <CheckCircle className="h-5 w-5 text-green-600 inline" />
                                      ) : (
                                        <X className="h-5 w-5 text-gray-300 inline" />
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      {perms.edit ? (
                                        <CheckCircle className="h-5 w-5 text-green-600 inline" />
                                      ) : (
                                        <X className="h-5 w-5 text-gray-300 inline" />
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      {perms.delete ? (
                                        <CheckCircle className="h-5 w-5 text-green-600 inline" />
                                      ) : (
                                        <X className="h-5 w-5 text-gray-300 inline" />
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Quick Permission Summary - When Collapsed */}
                      {!isExpanded && (
                        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(role.permissions).slice(0, 5).map(([page, perms]) => {
                              const hasAnyPerm = perms.read || perms.write || perms.edit || perms.delete;
                              return (
                                <span
                                  key={page}
                                  className={`px-2 py-1 text-xs rounded ${
                                    hasAnyPerm ? 'bg-purple-100 text-purple-700' : 'bg-gray-200 text-gray-500'
                                  }`}
                                >
                                  {page}
                                </span>
                              );
                            })}
                            {Object.keys(role.permissions).length > 5 && (
                              <span className="px-2 py-1 text-xs rounded bg-gray-200 text-gray-600">
                                +{Object.keys(role.permissions).length - 5} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                  })}
                </div>
              </div>
            </div>
          </div>
          )}
        </>
      )}

      {/* Audit Trail Tab Content */}
      {activeTab === 'audit' && (
        <>
          {/* Filters */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Search */}
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by user, action, resource..."
                    value={auditSearchQuery}
                    onChange={(e) => setAuditSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>

              {/* Action Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Action Type</label>
                <select
                  value={auditFilterAction}
                  onChange={(e) => setAuditFilterAction(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                >
                  <option value="all">All Actions</option>
                  {getUniqueActions().map(action => (
                    <option key={action} value={action}>{action}</option>
                  ))}
                </select>
              </div>

              {/* Clear Filters */}
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setAuditSearchQuery('');
                    setAuditFilterAction('all');
                    setAuditDateFrom('');
                    setAuditDateTo('');
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            </div>

            {/* Date Range Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">From Date</label>
                <input
                  type="date"
                  value={auditDateFrom}
                  onChange={(e) => setAuditDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">To Date</label>
                <input
                  type="date"
                  value={auditDateTo}
                  onChange={(e) => setAuditDateTo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                />
              </div>
            </div>
          </div>

          {/* Audit Logs Statistics */}
          {auditLogs.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Logs</p>
                    <p className="text-2xl font-bold text-gray-900">{auditLogs.length}</p>
                  </div>
                  <FileText className="h-10 w-10 text-blue-500" />
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Filtered Results</p>
                    <p className="text-2xl font-bold text-gray-900">{getFilteredAuditLogs().length}</p>
                  </div>
                  <Search className="h-10 w-10 text-green-500" />
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Create Actions</p>
                    <p className="text-2xl font-bold text-green-700">
                      {auditLogs.filter(log => log.action === 'CREATE').length}
                    </p>
                  </div>
                  <Plus className="h-10 w-10 text-green-500" />
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Delete Actions</p>
                    <p className="text-2xl font-bold text-red-700">
                      {auditLogs.filter(log => log.action === 'DELETE').length}
                    </p>
                  </div>
                  <Trash2 className="h-10 w-10 text-red-500" />
                </div>
              </div>
            </div>
          )}

          {/* Audit Logs Table */}
          {getFilteredAuditLogs().length === 0 ? (
            <div className="bg-white rounded-xl shadow-lg p-12 text-center">
              <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                {auditLogs.length === 0 ? 'No audit logs' : 'No matching logs found'}
              </h3>
              <p className="text-gray-600">
                {auditLogs.length === 0
                  ? 'User activities will be tracked and displayed here'
                  : 'Try adjusting your filters or search criteria'}
              </p>
            </div>
          ) : (
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Timestamp</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">User</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Action</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Resource</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Details</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {getFilteredAuditLogs().map(log => {
                    const detailsDisplay = typeof log.details === 'object'
                      ? JSON.stringify(log.details, null, 2)
                      : String(log.details || '');

                    return (
                      <tr key={log.id} className="hover:bg-blue-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-blue-500" />
                            <div>
                              <div className="font-medium">{new Date(log.created_at).toLocaleDateString()}</div>
                              <div className="text-xs text-gray-500">{new Date(log.created_at).toLocaleTimeString()}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                              <span className="text-xs font-bold text-white">
                                {log.user_name?.charAt(0).toUpperCase() || '?'}
                              </span>
                            </div>
                            <span className="text-sm font-medium text-gray-900">{log.user_name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 w-fit ${
                            log.action === 'CREATE' ? 'bg-green-100 text-green-700 border border-green-300' :
                            log.action === 'UPDATE' ? 'bg-blue-100 text-blue-700 border border-blue-300' :
                            log.action === 'DELETE' ? 'bg-red-100 text-red-700 border border-red-300' :
                            'bg-gray-100 text-gray-700 border border-gray-300'
                          }`}>
                            {log.action === 'CREATE' && <Plus className="h-3 w-3" />}
                            {log.action === 'UPDATE' && <Edit2 className="h-3 w-3" />}
                            {log.action === 'DELETE' && <Trash2 className="h-3 w-3" />}
                            {log.action}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900 bg-gray-100 px-2 py-1 rounded">
                            {log.resource_type}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 max-w-md">
                          <details className="cursor-pointer">
                            <summary className="text-blue-600 hover:text-blue-700 font-medium">
                              View Details
                            </summary>
                            <pre className="mt-2 whitespace-pre-wrap font-mono text-xs bg-gray-50 p-3 rounded border border-gray-200 overflow-x-auto">
                              {detailsDisplay}
                            </pre>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Info */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>
                  Showing <span className="font-semibold text-gray-900">{getFilteredAuditLogs().length}</span> of{' '}
                  <span className="font-semibold text-gray-900">{auditLogs.length}</span> total logs
                </span>
                <span className="text-xs">
                  Last updated: {auditLogs.length > 0 ? new Date(auditLogs[0].created_at).toLocaleString() : 'N/A'}
                </span>
              </div>
            </div>
          </div>
          )}
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
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
                  disabled={actionLoading}
                >
                  {actionLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
                  <span>{actionLoading ? 'Creating...' : 'Create User'}</span>
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
              onSubmit={editingRole ? handleUpdateRole : handleCreateRole}
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
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
                  disabled={actionLoading}
                >
                  {actionLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
                  <span>{actionLoading ? (editingRole ? 'Updating...' : 'Creating...') : (editingRole ? 'Update Role' : 'Create Role')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 px-6 py-4 rounded-t-xl">
              <h3 className="text-xl font-bold text-white">Edit User</h3>
              <p className="text-blue-100 text-sm mt-1">@{editingUser.username}</p>
            </div>
            <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  value={formData.username}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">Username cannot be changed</p>
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
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="edit_is_superuser"
                  checked={formData.is_superuser}
                  onChange={(e) => setFormData({ ...formData, is_superuser: e.target.checked })}
                  className="h-4 w-4 text-blue-500 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="edit_is_superuser" className="ml-2 block text-sm text-gray-700">
                  Superuser privileges
                </label>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  To change the password, use the "Reset Password" button in the actions menu.
                </p>
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingUser(null);
                    setFormData({ username: '', email: '', full_name: '', password: '', is_superuser: false, role_id: undefined });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
                  disabled={actionLoading}
                >
                  {actionLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
                  <span>{actionLoading ? 'Updating...' : 'Update User'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showPasswordResetModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 px-6 py-4 rounded-t-xl">
              <h3 className="text-xl font-bold text-white">Reset Password</h3>
              <p className="text-amber-100 text-sm mt-1">Set a new password for this user</p>
            </div>
            <form onSubmit={handlePasswordReset} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={passwordResetData.newPassword}
                  onChange={(e) => setPasswordResetData({ ...passwordResetData, newPassword: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900 bg-white"
                  placeholder="Enter new password"
                />
                <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={passwordResetData.confirmPassword}
                  onChange={(e) => setPasswordResetData({ ...passwordResetData, confirmPassword: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900 bg-white"
                  placeholder="Confirm new password"
                />
              </div>
              {passwordResetData.newPassword && passwordResetData.confirmPassword &&
                passwordResetData.newPassword !== passwordResetData.confirmPassword && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                  <p className="text-xs text-red-800">Passwords do not match</p>
                </div>
              )}
              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordResetModal(false);
                    setPasswordResetData({ userId: 0, newPassword: '', confirmPassword: '' });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
                  disabled={actionLoading}
                >
                  {actionLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
                  <span>{actionLoading ? 'Resetting...' : 'Reset Password'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Access Modal (roles + customers) */}
      {showAccessModal && accessUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 px-6 py-4 rounded-t-xl sticky top-0 z-10">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <UserCog className="h-5 w-5" /> Manage Access
              </h3>
              <p className="text-indigo-100 text-sm mt-1">
                Assign roles and customer access for <span className="font-semibold">{accessUser.full_name || accessUser.username}</span>
              </p>
            </div>

            <div className="p-6 space-y-6">
              {/* Roles */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                    <Shield className="h-4 w-4 text-blue-600" /> Roles
                    <span className="text-xs font-normal text-gray-500">({selectedRoleIds.length} selected)</span>
                  </label>
                </div>
                {roles.length === 0 ? (
                  <p className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg p-4 text-center">
                    No roles defined yet. Create roles in the Roles tab first.
                  </p>
                ) : (
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-52 overflow-y-auto">
                    {roles.map(r => (
                      <label key={r.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedRoleIds.includes(r.id)}
                          onChange={() => toggleRoleId(r.id)}
                          className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="flex-1">
                          <span className="block text-sm font-medium text-gray-900">{r.name}</span>
                          {r.description && <span className="block text-xs text-gray-500">{r.description}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Customers */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-emerald-600" /> Customer Access
                    <span className="text-xs font-normal text-gray-500">({selectedCustomerIds.length} selected)</span>
                  </label>
                </div>
                {availableCustomers.length === 0 ? (
                  <p className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg p-4 text-center">
                    No active customers available.
                  </p>
                ) : (
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-52 overflow-y-auto">
                    {availableCustomers.map(c => (
                      <label key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCustomerIds.includes(c.id)}
                          onChange={() => toggleCustomerId(c.id)}
                          className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                        />
                        <span className="flex-1">
                          <span className="block text-sm font-medium text-gray-900">{c.display_name}</span>
                          <span className="block text-xs text-gray-500">{c.name}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAccessModal(false); setAccessUser(null); }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAccess}
                  className="flex-1 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
                  disabled={actionLoading}
                >
                  {actionLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
                  <span>{actionLoading ? 'Saving...' : 'Save Access'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
