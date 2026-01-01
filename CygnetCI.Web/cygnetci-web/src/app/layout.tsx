// src/app/layout.tsx

'use client';

import React, { useEffect, useState } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { Navigation } from '@/components/layout/Navigation';
import { useData } from '@/lib/hooks/useData';
import { CustomerProvider } from '@/lib/contexts/CustomerContext';
import { LoadingState } from '@/components/common/LoadingState';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { CONFIG } from '@/lib/config';
import { usePathname, useRouter } from 'next/navigation';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const { loading, error, refetch } = useData();

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = () => {
      const token = localStorage.getItem('auth_token');
      const user = localStorage.getItem('user');

      if (token && user) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        // Only redirect if not already on login page
        if (pathname !== '/login') {
          router.push('/login');
        }
      }
      setAuthChecking(false);
    };

    checkAuth();
  }, [pathname, router]);

  // Show loading while checking auth
  if (authChecking) {
    return (
      <html lang="en">
        <head>
          <link rel="icon" href="/favicon.ico" sizes="any" />
        </head>
        <body className={inter.className}>
          <LoadingState />
        </body>
      </html>
    );
  }

  // If not authenticated and not on login page, don't render (will redirect)
  if (!isAuthenticated && pathname !== '/login') {
    return (
      <html lang="en">
        <head>
          <link rel="icon" href="/favicon.ico" sizes="any" />
        </head>
        <body className={inter.className}>
          <LoadingState />
        </body>
      </html>
    );
  }

  if (loading) {
    return (
      <html lang="en">
        <head>
          <link rel="icon" href="/favicon.ico" sizes="any" />
        </head>
        <body className={inter.className}>
          <LoadingState />
        </body>
      </html>
    );
  }

  if (error) {
    return (
      <html lang="en">
        <head>
          <link rel="icon" href="/favicon.ico" sizes="any" />
        </head>
        <body className={inter.className}>
          <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-lg p-8 max-w-md">
              <div className="flex items-center space-x-3 mb-4">
                <AlertCircle className="h-8 w-8 text-red-500" />
                <span className="text-xl font-semibold text-gray-800">Connection Error</span>
              </div>
              <p className="text-gray-600 mb-4">{error}</p>
              <div className="flex space-x-3">
                <button 
                  onClick={refetch}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Retry</span>
                </button>
                <button 
                  onClick={() => {
                    CONFIG.app.useRealAPI = false;
                    refetch();
                  }}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Use Dummy Data
                </button>
              </div>
            </div>
          </div>
        </body>
      </html>
    );
  }

  // Check if we're on the login page
  const isLoginPage = pathname === '/login';

  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className={inter.className}>
        {isLoginPage ? (
          // Login page - no layout wrapper
          children
        ) : (
          // Regular pages - with header and navigation
          <CustomerProvider>
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
              <Header onRefresh={refetch} />
              <Navigation />
              <main className="ml-64 mt-16 p-8">
                {children}
              </main>
            </div>
          </CustomerProvider>
        )}
      </body>
    </html>
  );
}