// src/components/layout/Navigation.tsx

'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, GitBranch, Server, Activity, Monitor } from 'lucide-react';

const navItems = [
  { id: 'overview', name: 'Overview', icon: BarChart3, href: '/' },
  { id: 'pipelines', name: 'Pipelines', icon: GitBranch, href: '/pipelines' },
  { id: 'agents', name: 'Agents', icon: Server, href: '/agents' },
  { id: 'tasks', name: 'Tasks', icon: Activity, href: '/tasks' },
  { id: 'monitoring', name: 'Service Monitoring', icon: Monitor, href: '/monitoring' }
];

export const Navigation: React.FC = () => {
  const pathname = usePathname();

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-8">
          {navItems.map(item => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  isActive
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
};