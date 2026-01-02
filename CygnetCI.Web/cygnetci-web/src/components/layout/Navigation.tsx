// src/components/layout/Navigation.tsx

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <nav className={`fixed left-0 top-16 h-[calc(100vh-4rem)] bg-white shadow-lg border-r border-gray-200 transition-all duration-300 z-30 ${
      isCollapsed ? 'w-16' : 'w-64'
    }`}>
      {/* Toggle Button */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-6 bg-white border border-gray-300 rounded-full p-1 shadow-md hover:bg-blue-50 hover:border-blue-400 transition-colors"
      >
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4 text-gray-600" />
        ) : (
          <ChevronLeft className="w-4 h-4 text-gray-600" />
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
                  ? 'bg-blue-50 text-blue-600 border-blue-500'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900 border-transparent'
              }`}
              title={isCollapsed ? item.name : undefined}
            >
              <item.icon className={`${isCollapsed ? 'w-6 h-6' : 'w-5 h-5'} flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-700'}`} />
              {!isCollapsed && <span className={`truncate ${isActive ? 'text-blue-600' : 'text-gray-700'}`}>{item.name}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
