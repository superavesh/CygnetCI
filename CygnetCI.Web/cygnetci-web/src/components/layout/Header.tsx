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
    const fetchCurrentUser = async () => {
      try {
        const response = await fetch(`${CONFIG.api.baseUrl}/users`);
        if (response.ok) {
          const users = await response.json();
          const user = users.find((u: CurrentUser) => u.is_superuser) || users[0];
          setCurrentUser(user);
        }
      } catch (error) {
        console.error('Failed to fetch current user:', error);
      }
    };

    fetchCurrentUser();
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

  const getUserInitials = (fullName: string) => {
    return fullName
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
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
              <div className="relative w-12 h-12">
                <Image
                  src="/cygnet-logo.svg"
                  alt="CygnetCI Logo"
                  width={48}
                  height={48}
                  priority
                />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">{CONFIG.app.name}</h1>
                <p className="text-sm text-gray-600">CI/CD Management Platform v{CONFIG.app.version}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <CustomerSelector />
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-2 bg-white hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 shadow-sm"
                title="Refresh Data"
              >
                <RefreshCw className="h-4 w-4 text-blue-500" />
              </button>
            )}

            {/* User Menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="p-1 bg-white rounded-full border border-gray-200 shadow-sm hover:border-blue-400 transition-colors"
                title={currentUser?.full_name || 'User Menu'}
              >
                <div className="h-9 w-9 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                  {currentUser ? (
                    <span className="text-sm font-bold text-white">
                      {getUserInitials(currentUser.full_name)}
                    </span>
                  ) : (
                    <User className="h-5 w-5 text-white" />
                  )}
                </div>
              </button>

              {/* Dropdown Menu */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
                  {/* User Info Section */}
                  <div className="px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center space-x-3">
                      <div className="h-12 w-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                        {currentUser && (
                          <span className="text-lg font-bold text-white">
                            {getUserInitials(currentUser.full_name)}
                          </span>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-800">
                          {currentUser?.full_name || 'Loading...'}
                        </p>
                        <p className="text-xs text-gray-600">{currentUser?.email}</p>
                        <p className="text-xs text-blue-600 mt-1 font-medium">
                          {currentUser?.is_superuser ? '👑 Administrator' : '👤 User'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Menu Items */}
                  <div className="py-2">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center space-x-2"
                    >
                      <User className="h-4 w-4 text-blue-500" />
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
