// src/components/layout/Navigation.tsx

'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from '@/lib/contexts/SidebarContext';
import {
  BarChart3,
  GitBranch,
  Server,
  Activity,
  Monitor,
  Rocket,
  Upload,
  Users,
  Building2,
  RotateCcw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const navItems = [
  { id: 'overview', name: 'Overview', icon: BarChart3, href: '/' },
  { id: 'pipelines', name: 'Pipelines', icon: GitBranch, href: '/pipelines' },
  { id: 'releases', name: 'Releases', icon: Rocket, href: '/releases' },
  { id: 'transfer', name: 'Transfer', icon: Upload, href: '/transfer' },
  { id: 'rollback', name: 'Rollback', icon: RotateCcw, href: '/rollback' },
  { id: 'agents', name: 'Agents', icon: Server, href: '/agents' },
  { id: 'monitoring', name: 'Monitoring', icon: Monitor, href: '/monitoring' },
  { id: 'customers', name: 'Customers', icon: Building2, href: '/customers' },
  { id: 'users', name: 'Users', icon: Users, href: '/users' },
  { id: 'tasks', name: 'Tasks', icon: Activity, href: '/tasks' }
];

export const Navigation: React.FC = () => {
  const pathname = usePathname();
  const { isCollapsed, toggleSidebar } = useSidebar();

  return (
    <nav className={`fixed left-0 top-16 h-[calc(100vh-4rem)] bg-white shadow-lg border-r border-gray-200 transition-all duration-300 z-30 ${
      isCollapsed ? 'w-16' : 'w-64'
    }`}>
      {/* Toggle Button */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-6 rounded-full p-1.5 shadow-lg hover:shadow-xl transition-all"
        style={{
          background: 'linear-gradient(135deg, #1a365d, #2d4a73)',
          border: '2px solid white'
        }}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? (
          <ChevronRight className="w-5 h-5 text-white" />
        ) : (
          <ChevronLeft className="w-5 h-5 text-white" />
        )}
      </button>

      {/* Navigation Items */}
      <div className="flex flex-col py-4 overflow-y-auto h-full">
        {navItems.map(item => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 mx-2 rounded-lg font-medium text-sm transition-all border-l-4 ${
                isActive
                  ? 'bg-gray-100 border-blue-500'
                  : 'hover:bg-gray-50 border-transparent'
              }`}
              style={isActive ? { color: '#1a365d' } : { color: '#4b5563' }}
              title={isCollapsed ? item.name : undefined}
            >
              <item.icon className={`${isCollapsed ? 'w-6 h-6' : 'w-5 h-5'} flex-shrink-0`} style={isActive ? { color: '#1a365d' } : { color: '#4b5563' }} />
              {!isCollapsed && <span className={`truncate`} style={isActive ? { color: '#1a365d' } : { color: '#4b5563' }}>{item.name}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
