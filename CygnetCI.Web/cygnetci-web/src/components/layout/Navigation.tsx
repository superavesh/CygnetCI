// src/components/layout/Navigation.tsx

'use client';

import React, { useState, useEffect } from 'react';
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
  Mail
} from 'lucide-react';

const navItems = [
  { id: 'overview', name: 'Overview', icon: BarChart3, href: '/' },
  { id: 'pipelines', name: 'Pipelines', icon: GitBranch, href: '/pipelines' },
  { id: 'releases', name: 'Releases', icon: Rocket, href: '/releases' },
  { id: 'transfer', name: 'Transfer', icon: Upload, href: '/transfer' },
  { id: 'rollback', name: 'Rollback', icon: RotateCcw, href: '/rollback' },
  { id: 'agents', name: 'Agents', icon: Server, href: '/agents' },
  { id: 'monitoring', name: 'Monitoring', icon: Monitor, href: '/monitoring' },
  { id: 'email-alerts', name: 'Email Alerts', icon: Mail, href: '/email-alerts' },
  { id: 'customers', name: 'Customers', icon: Building2, href: '/customers' },
  { id: 'users', name: 'Users', icon: Users, href: '/users' },
  { id: 'tasks', name: 'Tasks', icon: Activity, href: '/tasks' }
];

export const Navigation: React.FC = () => {
  const pathname = usePathname();
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const [currentPath, setCurrentPath] = useState('');

  useEffect(() => {
    const p = window.location.pathname.replace(/\/$/, '') || '/';
    setCurrentPath(p);
  }, [pathname]);

  return (
    <nav
      className={`fixed left-0 top-16 h-[calc(100vh-4rem)] bg-gradient-to-b from-gray-50 to-white shadow-lg border-r border-gray-100 transition-all duration-300 z-30 ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
      onMouseEnter={() => setIsCollapsed(false)}
      onMouseLeave={() => setIsCollapsed(true)}
    >
      {/* Navigation Items */}
      <div className="flex flex-col py-4 overflow-y-auto h-full">
        {navItems.map(item => {
          const isActive = currentPath === item.href;
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => setIsCollapsed(true)}
              className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 mx-2 rounded-xl font-medium text-sm transition-all relative group ${
                isActive
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-md'
                  : 'text-gray-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 hover:text-blue-600'
              }`}
              title={isCollapsed ? item.name : undefined}
            >
              <item.icon className={`${isCollapsed ? 'w-6 h-6' : 'w-5 h-5'} flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-600 group-hover:text-blue-600'} transition-colors`} />
              {!isCollapsed && <span className={`truncate ${isActive ? 'text-white' : 'text-gray-700 group-hover:text-blue-600'}`}>{item.name}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
