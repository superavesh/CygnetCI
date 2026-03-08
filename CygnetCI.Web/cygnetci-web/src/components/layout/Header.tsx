// src/components/layout/Header.tsx

'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { RefreshCw, User } from 'lucide-react';
import { CONFIG } from '@/lib/config';
import CustomerSelector from '@/components/CustomerSelector';

interface HeaderProps {
  onRefresh?: () => void;
}

interface CurrentUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_superuser: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onRefresh }) => {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        setCurrentUser(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load current user:', error);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  const getDisplayName = () => currentUser?.full_name || currentUser?.username || 'User';

  const getUserInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .filter(Boolean)
      .join('')
      .toUpperCase()
      .substring(0, 2) || '?';
  };

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout?')) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/login';
    }
  };

  return (
    <header className="bg-white shadow-md border-b border-gray-200 fixed top-0 left-0 right-0 z-50">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className="relative w-10 h-10">
                <Image
                  src="/cygnet-logo.svg"
                  alt="CygnetCI Logo"
                  width={40}
                  height={40}
                  priority
                />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">{CONFIG.app.name}</h1>
                <p className="text-xs text-gray-600">CI/CD Management Platform v{CONFIG.app.version}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <CustomerSelector />
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-2 bg-gradient-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 rounded-lg transition-all border border-blue-200 shadow-sm"
                title="Refresh Data"
              >
                <RefreshCw className="h-4 w-4 text-blue-600" />
              </button>
            )}

            {/* User Menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="p-1 bg-gradient-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 rounded-full border border-blue-200 shadow-md transition-all"
                title={getDisplayName()}
              >
                <div className="h-9 w-9 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
                  {currentUser ? (
                    <span className="text-sm font-bold text-white">
                      {getUserInitials(getDisplayName())}
                    </span>
                  ) : (
                    <User className="h-5 w-5 text-white" />
                  )}
                </div>
              </button>

              {/* Dropdown Menu */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
                  {/* User Info Section */}
                  <div className="px-4 py-4 bg-gradient-to-br from-blue-50 to-purple-50 border-b border-gray-100">
                    <div className="flex items-center space-x-3">
                      <div className="h-14 w-14 rounded-full flex items-center justify-center shadow-lg bg-gradient-to-br from-orange-500 to-pink-500">
                        {currentUser && (
                          <span className="text-xl font-bold text-white">
                            {getUserInitials(getDisplayName())}
                          </span>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-800">
                          {getDisplayName()}
                        </p>
                        <p className="text-xs text-gray-500">{currentUser?.email}</p>
                        {currentUser?.is_superuser && (
                          <p className="text-xs mt-1 font-medium px-2 py-0.5 rounded inline-block bg-gradient-to-r from-yellow-100 to-amber-100 text-amber-700">
                            👑 Administrator
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Menu Items */}
                  <div className="py-2">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 transition-colors flex items-center space-x-2"
                    >
                      <User className="h-4 w-4 text-blue-600" />
                      <span>View Profile</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        handleLogout();
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center space-x-2"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      <span>Logout</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
