// src/app/email-alerts/page.tsx

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail, Inbox, AlertTriangle, AlertCircle, CheckCircle, Trash2,
  RefreshCw, Search, Filter, Clock, User, Paperclip, Star,
  ChevronDown, GripVertical, X, Settings, Plus
} from 'lucide-react';
import { apiService } from '@/lib/api/apiService';
import { useCustomer } from '@/lib/contexts/CustomerContext';
import { EmailSettingsModal } from '@/components/email/EmailSettingsModal';

interface EmailAlert {
  id: number;
  subject: string;
  sender: string;
  senderEmail: string;
  preview: string;
  body: string;
  receivedAt: string;
  category: 'inbox' | 'ignorable' | 'moderate' | 'critical' | 'resolved';
  isRead: boolean;
  isStarred: boolean;
  hasAttachment: boolean;
  priority: 'low' | 'medium' | 'high';
}

type Category = 'inbox' | 'ignorable' | 'moderate' | 'critical' | 'resolved';

const categoryConfig: Record<Category, { label: string; color: string; bgColor: string; borderColor: string; icon: React.ElementType }> = {
  inbox: { label: 'Inbox', color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', icon: Inbox },
  ignorable: { label: 'Ignorable', color: 'text-gray-600', bgColor: 'bg-gray-50', borderColor: 'border-gray-200', icon: Trash2 },
  moderate: { label: 'Moderate', color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-200', icon: AlertTriangle },
  critical: { label: 'Critical', color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-200', icon: AlertCircle },
  resolved: { label: 'Resolved', color: 'text-green-600', bgColor: 'bg-green-50', borderColor: 'border-green-200', icon: CheckCircle }
};

// Mock data - used when API returns empty or for demo purposes
const mockEmails: EmailAlert[] = [
  {
    id: 1,
    subject: 'Pipeline Build Failed - Production Deploy',
    sender: 'CI/CD System',
    senderEmail: 'cicd@company.com',
    preview: 'The production deployment pipeline has failed at stage 3...',
    body: 'The production deployment pipeline has failed at stage 3. Error: Connection timeout to database server. Please check the logs and retry the deployment.',
    receivedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    category: 'inbox',
    isRead: false,
    isStarred: true,
    hasAttachment: true,
    priority: 'high'
  },
  {
    id: 2,
    subject: 'Weekly System Health Report',
    sender: 'Monitoring Service',
    senderEmail: 'monitoring@company.com',
    preview: 'Your weekly system health report is ready for review...',
    body: 'Your weekly system health report is ready for review. All systems are operating within normal parameters. CPU usage averaged 45%, memory at 60%.',
    receivedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    category: 'inbox',
    isRead: true,
    isStarred: false,
    hasAttachment: false,
    priority: 'low'
  },
  {
    id: 3,
    subject: 'Security Alert: Unusual Login Activity',
    sender: 'Security Team',
    senderEmail: 'security@company.com',
    preview: 'We detected unusual login activity on your account...',
    body: 'We detected unusual login activity on your account from IP 192.168.1.100. If this was not you, please reset your password immediately.',
    receivedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    category: 'critical',
    isRead: false,
    isStarred: true,
    hasAttachment: false,
    priority: 'high'
  },
  {
    id: 4,
    subject: 'Agent Disk Space Warning',
    sender: 'Agent Monitor',
    senderEmail: 'agents@company.com',
    preview: 'Agent "Production-Server-01" disk space is at 85%...',
    body: 'Agent "Production-Server-01" disk space is at 85%. Consider cleaning up old logs or expanding storage capacity.',
    receivedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    category: 'moderate',
    isRead: true,
    isStarred: false,
    hasAttachment: false,
    priority: 'medium'
  },
  {
    id: 5,
    subject: 'Scheduled Maintenance Notification',
    sender: 'IT Operations',
    senderEmail: 'it-ops@company.com',
    preview: 'Scheduled maintenance window: Saturday 2AM-4AM...',
    body: 'Scheduled maintenance window: Saturday 2AM-4AM. During this time, all services will be unavailable. Please plan accordingly.',
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    category: 'ignorable',
    isRead: true,
    isStarred: false,
    hasAttachment: false,
    priority: 'low'
  },
  {
    id: 6,
    subject: 'Release v2.5.0 Deployed Successfully',
    sender: 'Release Manager',
    senderEmail: 'releases@company.com',
    preview: 'Release v2.5.0 has been successfully deployed to production...',
    body: 'Release v2.5.0 has been successfully deployed to production. All health checks passed. No rollback required.',
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    category: 'resolved',
    isRead: true,
    isStarred: false,
    hasAttachment: true,
    priority: 'low'
  },
  {
    id: 7,
    subject: 'Database Connection Pool Exhausted',
    sender: 'Database Monitor',
    senderEmail: 'db-monitor@company.com',
    preview: 'Warning: Database connection pool is exhausted...',
    body: 'Warning: Database connection pool is exhausted. Current connections: 100/100. Application performance may be degraded.',
    receivedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    category: 'inbox',
    isRead: false,
    isStarred: false,
    hasAttachment: false,
    priority: 'high'
  },
  {
    id: 8,
    subject: 'Certificate Expiry Warning',
    sender: 'SSL Monitor',
    senderEmail: 'ssl@company.com',
    preview: 'SSL certificate for api.company.com expires in 30 days...',
    body: 'SSL certificate for api.company.com expires in 30 days. Please renew the certificate before expiration to avoid service interruption.',
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    category: 'moderate',
    isRead: false,
    isStarred: true,
    hasAttachment: false,
    priority: 'medium'
  }
];

export default function EmailAlertsPage() {
  const { selectedCustomer } = useCustomer();
  const [emails, setEmails] = useState<EmailAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<EmailAlert | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedEmail, setDraggedEmail] = useState<EmailAlert | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<Category | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [collapsedColumns, setCollapsedColumns] = useState<Set<Category>>(new Set());
  const [useMockData, setUseMockData] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hasEmailConfig, setHasEmailConfig] = useState(false);

  const categories: Category[] = ['inbox', 'ignorable', 'moderate', 'critical', 'resolved'];

  const checkEmailConfig = useCallback(async () => {
    try {
      const configs = await apiService.getEmailConfigs(selectedCustomer?.id);
      setHasEmailConfig(configs && configs.length > 0);
    } catch (error) {
      console.error('Failed to check email configs:', error);
      setHasEmailConfig(false);
    }
  }, [selectedCustomer]);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiService.getEmailAlerts({
        customerId: selectedCustomer?.id
      });
      if (data && data.length > 0) {
        setEmails(data);
        setUseMockData(false);
      } else {
        // Use mock data if no emails in database
        setEmails(mockEmails);
        setUseMockData(true);
      }
    } catch (error) {
      console.error('Failed to fetch email alerts:', error);
      // Use mock data on error
      setEmails(mockEmails);
      setUseMockData(true);
    } finally {
      setLoading(false);
    }
  }, [selectedCustomer]);

  useEffect(() => {
    fetchEmails();
    checkEmailConfig();
  }, [fetchEmails, checkEmailConfig]);

  const getEmailsByCategory = useCallback((category: Category) => {
    return emails.filter(email => {
      const matchesCategory = email.category === category;
      const matchesSearch = searchQuery === '' ||
        email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        email.sender.toLowerCase().includes(searchQuery.toLowerCase()) ||
        email.preview.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [emails, searchQuery]);

  const handleDragStart = (e: React.DragEvent, email: EmailAlert) => {
    setDraggedEmail(email);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', email.id.toString());
  };

  const handleDragOver = (e: React.DragEvent, category: Category) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCategory(category);
  };

  const handleDragLeave = () => {
    setDragOverCategory(null);
  };

  const handleDrop = async (e: React.DragEvent, targetCategory: Category) => {
    e.preventDefault();
    setDragOverCategory(null);

    if (draggedEmail && draggedEmail.category !== targetCategory) {
      // Optimistically update UI
      setEmails(prev => prev.map(email =>
        email.id === draggedEmail.id
          ? { ...email, category: targetCategory }
          : email
      ));

      // Update in API if not using mock data
      if (!useMockData) {
        try {
          await apiService.updateEmailAlert(draggedEmail.id, { category: targetCategory });
        } catch (error) {
          console.error('Failed to update email category:', error);
          // Revert on error
          setEmails(prev => prev.map(email =>
            email.id === draggedEmail.id
              ? { ...email, category: draggedEmail.category }
              : email
          ));
        }
      }
    }
    setDraggedEmail(null);
  };

  const handleDragEnd = () => {
    setDraggedEmail(null);
    setDragOverCategory(null);
  };

  const toggleStar = async (emailId: number) => {
    const email = emails.find(e => e.id === emailId);
    if (!email) return;

    const newStarred = !email.isStarred;

    // Optimistically update UI
    setEmails(prev => prev.map(e =>
      e.id === emailId ? { ...e, isStarred: newStarred } : e
    ));

    // Update in API if not using mock data
    if (!useMockData) {
      try {
        await apiService.updateEmailAlert(emailId, { is_starred: newStarred });
      } catch (error) {
        console.error('Failed to update email starred status:', error);
        // Revert on error
        setEmails(prev => prev.map(e =>
          e.id === emailId ? { ...e, isStarred: !newStarred } : e
        ));
      }
    }
  };

  const markAsRead = async (emailId: number) => {
    const email = emails.find(e => e.id === emailId);
    if (!email || email.isRead) return;

    // Optimistically update UI
    setEmails(prev => prev.map(e =>
      e.id === emailId ? { ...e, isRead: true } : e
    ));

    // Update in API if not using mock data
    if (!useMockData) {
      try {
        await apiService.updateEmailAlert(emailId, { is_read: true });
      } catch (error) {
        console.error('Failed to mark email as read:', error);
      }
    }
  };

  const updateEmailCategory = async (emailId: number, category: Category) => {
    // Optimistically update UI
    setEmails(prev => prev.map(email =>
      email.id === emailId ? { ...email, category } : email
    ));

    if (selectedEmail && selectedEmail.id === emailId) {
      setSelectedEmail(prev => prev ? { ...prev, category } : null);
    }

    // Update in API if not using mock data
    if (!useMockData) {
      try {
        await apiService.updateEmailAlert(emailId, { category });
      } catch (error) {
        console.error('Failed to update email category:', error);
      }
    }
  };

  const toggleColumnCollapse = (category: Category) => {
    setCollapsedColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-amber-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const totalUnread = emails.filter(e => !e.isRead).length;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-[calc(100vh-6rem)]">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-gray-600">Loading email alerts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-full mx-auto h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Mail className="h-8 w-8 text-blue-600" />
              Email Alerts
              {totalUnread > 0 && (
                <span className="px-2 py-1 text-sm bg-red-500 text-white rounded-full">
                  {totalUnread} unread
                </span>
              )}
            </h1>
            <p className="text-gray-600 mt-1">
              Manage and categorize your email alerts with drag and drop
              {useMockData && <span className="text-amber-600 ml-2">(Demo data)</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setViewMode(viewMode === 'kanban' ? 'list' : 'kanban')}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
            >
              {viewMode === 'kanban' ? 'List View' : 'Kanban View'}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
            >
              <Settings className="h-4 w-4" />
              Configure
            </button>
            <button
              onClick={fetchEmails}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mt-4 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700">
            <Filter className="h-4 w-4" />
            Filters
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      {viewMode === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100%-8rem)]">
          {categories.map(category => {
            const config = categoryConfig[category];
            const categoryEmails = getEmailsByCategory(category);
            const isCollapsed = collapsedColumns.has(category);
            const isDragOver = dragOverCategory === category;
            const Icon = config.icon;

            return (
              <div
                key={category}
                className={`flex-shrink-0 ${isCollapsed ? 'w-12' : 'w-80'} flex flex-col transition-all duration-300`}
              >
                {/* Column Header */}
                <div
                  className={`flex items-center justify-between px-3 py-2 rounded-t-lg border ${config.borderColor} ${config.bgColor} cursor-pointer`}
                  onClick={() => toggleColumnCollapse(category)}
                >
                  {isCollapsed ? (
                    <div className="flex flex-col items-center gap-2 py-2">
                      <Icon className={`h-5 w-5 ${config.color}`} />
                      <span className={`text-xs font-medium ${config.color}`} style={{ writingMode: 'vertical-rl' }}>
                        {config.label}
                      </span>
                      <span className={`px-1.5 py-0.5 text-xs rounded-full ${config.bgColor} ${config.color} border ${config.borderColor}`}>
                        {categoryEmails.length}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <Icon className={`h-5 w-5 ${config.color}`} />
                        <span className={`font-semibold ${config.color}`}>{config.label}</span>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${config.bgColor} ${config.color} border ${config.borderColor}`}>
                          {categoryEmails.length}
                        </span>
                      </div>
                      <ChevronDown className={`h-4 w-4 ${config.color}`} />
                    </>
                  )}
                </div>

                {/* Column Body */}
                {!isCollapsed && (
                  <div
                    className={`flex-1 p-2 rounded-b-lg border border-t-0 ${config.borderColor} overflow-y-auto transition-colors ${
                      isDragOver ? 'bg-blue-50 border-blue-300' : 'bg-white'
                    }`}
                    onDragOver={(e) => handleDragOver(e, category)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, category)}
                  >
                    <div className="space-y-2">
                      {categoryEmails.map(email => (
                        <div
                          key={email.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, email)}
                          onDragEnd={handleDragEnd}
                          onClick={() => {
                            setSelectedEmail(email);
                            markAsRead(email.id);
                          }}
                          className={`p-3 rounded-lg border cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${
                            draggedEmail?.id === email.id ? 'opacity-50' : ''
                          } ${email.isRead ? 'bg-white border-gray-200' : 'bg-blue-50 border-blue-200'}`}
                        >
                          <div className="flex items-start gap-2">
                            <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-sm font-medium truncate ${email.isRead ? 'text-gray-700' : 'text-gray-900'}`}>
                                  {email.sender}
                                </span>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <span className={`w-2 h-2 rounded-full ${getPriorityColor(email.priority)}`} />
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleStar(email.id);
                                    }}
                                    className="p-0.5 hover:bg-gray-100 rounded"
                                  >
                                    <Star className={`h-3.5 w-3.5 ${email.isStarred ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'}`} />
                                  </button>
                                </div>
                              </div>
                              <p className={`text-sm truncate mt-1 ${email.isRead ? 'text-gray-600' : 'text-gray-800 font-medium'}`}>
                                {email.subject}
                              </p>
                              <p className="text-xs text-gray-500 truncate mt-1">
                                {email.preview}
                              </p>
                              <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                                <Clock className="h-3 w-3" />
                                <span>{formatTime(email.receivedAt)}</span>
                                {email.hasAttachment && <Paperclip className="h-3 w-3" />}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      {categoryEmails.length === 0 && (
                        <div className="text-center py-8 text-gray-400">
                          <Icon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No emails</p>
                          <p className="text-xs">Drag emails here</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden h-[calc(100%-8rem)]">
          <div className="overflow-y-auto h-full">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">From</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Received</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {emails
                  .filter(email =>
                    searchQuery === '' ||
                    email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    email.sender.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map(email => {
                    const config = categoryConfig[email.category];
                    return (
                      <tr
                        key={email.id}
                        onClick={() => {
                          setSelectedEmail(email);
                          markAsRead(email.id);
                        }}
                        className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                          email.isRead ? '' : 'bg-blue-50'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <span className={`w-3 h-3 rounded-full inline-block ${getPriorityColor(email.priority)}`} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleStar(email.id);
                              }}
                            >
                              <Star className={`h-4 w-4 ${email.isStarred ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'}`} />
                            </button>
                            <span className={`text-sm ${email.isRead ? 'text-gray-700' : 'font-medium text-gray-900'}`}>
                              {email.sender}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm ${email.isRead ? 'text-gray-600' : 'font-medium text-gray-900'}`}>
                              {email.subject}
                            </span>
                            {email.hasAttachment && <Paperclip className="h-4 w-4 text-gray-400" />}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${config.bgColor} ${config.color} border ${config.borderColor}`}>
                            {config.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {formatTime(email.receivedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={email.category}
                            onChange={(e) => {
                              e.stopPropagation();
                              updateEmailCategory(email.id, e.target.value as Category);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700"
                          >
                            {categories.map(cat => (
                              <option key={cat} value={cat}>{categoryConfig[cat].label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Email Detail Modal */}
      {selectedEmail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-3 flex items-center justify-between border-b border-gray-200">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${getPriorityColor(selectedEmail.priority)}`} />
                  <h2 className="text-lg font-semibold text-gray-900">Email Details</h2>
                </div>
                <p className="text-gray-600 text-xs mt-0.5">{selectedEmail.sender}</p>
              </div>
              <button
                onClick={() => setSelectedEmail(null)}
                className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Subject */}
              <div>
                <h3 className="text-xl font-semibold text-gray-900">{selectedEmail.subject}</h3>
              </div>

              {/* Sender Info */}
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <User className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{selectedEmail.sender}</p>
                    <p className="text-sm text-gray-500">{selectedEmail.senderEmail}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">{new Date(selectedEmail.receivedAt).toLocaleString()}</p>
                  <div className="flex items-center gap-2 mt-1 justify-end">
                    {selectedEmail.hasAttachment && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Paperclip className="h-3 w-3" />
                        Attachment
                      </span>
                    )}
                    <button
                      onClick={() => toggleStar(selectedEmail.id)}
                      className="hover:bg-gray-100 p-1 rounded transition-colors"
                    >
                      <Star className={`h-4 w-4 ${selectedEmail.isStarred ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="py-4">
                <p className="text-gray-700 whitespace-pre-wrap">{selectedEmail.body}</p>
              </div>

              {/* Category Selection */}
              <div className="pt-4 border-t border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Move to Category
                </label>
                <div className="flex flex-wrap gap-2">
                  {categories.map(category => {
                    const config = categoryConfig[category];
                    const Icon = config.icon;
                    const isActive = selectedEmail.category === category;
                    return (
                      <button
                        key={category}
                        onClick={() => updateEmailCategory(selectedEmail.id, category)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                          isActive
                            ? `${config.bgColor} ${config.borderColor} ${config.color}`
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-sm font-medium">{config.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email Settings Modal */}
      <EmailSettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        customerId={selectedCustomer?.id}
        onSyncComplete={() => {
          fetchEmails();
          checkEmailConfig();
        }}
      />

      {/* No Email Config Prompt */}
      {!loading && !hasEmailConfig && useMockData && (
        <div className="fixed bottom-6 right-6 bg-white rounded-lg shadow-lg border border-gray-200 p-4 max-w-sm z-40">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Mail className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Connect Your Email</h4>
              <p className="text-sm text-gray-500 mt-1">
                Configure an email account to fetch real alerts from your inbox.
              </p>
              <button
                onClick={() => setShowSettings(true)}
                className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                <Plus className="h-4 w-4" />
                Configure Email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
