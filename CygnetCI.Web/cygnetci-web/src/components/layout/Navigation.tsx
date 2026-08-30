// src/components/layout/Navigation.tsx

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from '@/lib/contexts/SidebarContext';
import { useModules } from '@/lib/contexts/ModuleContext';
import { canRead, isSuperuser } from '@/lib/permissions';
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
  Mail,
  Ticket,
  Settings
} from 'lucide-react';

// `resource` is the per-user permission key that gates the item (null = always visible).
// `module` is the deployment-level toggle key (null = always-on, not a toggleable module) —
// a module hidden this way is also 404'd server-side regardless of permissions.
const navItems = [
  { id: 'overview', name: 'Overview', icon: BarChart3, href: '/', resource: null, module: null },
  { id: 'pipelines', name: 'Pipelines', icon: GitBranch, href: '/pipelines', resource: 'pipelines', module: 'pipelines' },
  { id: 'releases', name: 'Releases', icon: Rocket, href: '/releases', resource: 'releases', module: 'releases' },
  { id: 'transfer', name: 'Transfer', icon: Upload, href: '/transfer', resource: 'transfer', module: 'transfer' },
  { id: 'rollback', name: 'Rollback', icon: RotateCcw, href: '/rollback', resource: 'rollback', module: 'rollback' },
  { id: 'agents', name: 'Agents', icon: Server, href: '/agents', resource: 'agents', module: 'agents' },
  { id: 'monitoring', name: 'Monitoring', icon: Monitor, href: '/monitoring', resource: 'monitoring', module: 'monitoring' },
  { id: 'email-alerts', name: 'Email Alerts', icon: Mail, href: '/email-alerts', resource: 'email-alerts', module: 'email' },
  { id: 'tickets', name: 'Tickets', icon: Ticket, href: '/tickets', resource: 'tickets', module: 'tickets' },
  { id: 'customers', name: 'Customers', icon: Building2, href: '/customers', resource: 'customers', module: null },
  { id: 'users', name: 'Users', icon: Users, href: '/users', resource: 'users', module: null },
  { id: 'settings', name: 'Settings', icon: Settings, href: '/settings', resource: 'settings', module: null }
];

export const Navigation: React.FC = () => {
  const pathname = usePathname();
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const { isModuleEnabled } = useModules();
  const [currentPath, setCurrentPath] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const p = window.location.pathname.replace(/\/$/, '') || '/';
    setCurrentPath(p);
  }, [pathname]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Before mount (SSR/static) show all items to avoid a hydration flash;
  // after mount, filter by the logged-in user's permissions AND deployment-level module
  // toggles (a disabled module is hidden for every user, including superusers).
  const visibleItems = !mounted
    ? navItems
    : navItems.filter(item =>
        (item.module === null || isModuleEnabled(item.module)) &&
        (item.resource === null || isSuperuser() || canRead(item.resource))
      );

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
        {visibleItems.map(item => {
          const isActive = currentPath === item.href;
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={(e) => {
                setIsCollapsed(true);
                // When URL was changed via pushState (e.g. /tickets/70) but Next.js router
                // still thinks we're at /tickets, a Link click is a no-op. Force a real
                // navigation so the page reloads correctly.
                if (
                  window.location.pathname !== item.href &&
                  window.location.pathname.startsWith(item.href + '/')
                ) {
                  e.preventDefault();
                  window.location.href = item.href;
                }
              }}
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
