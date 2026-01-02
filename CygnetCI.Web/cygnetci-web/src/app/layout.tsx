// src/app/layout.tsx

'use client';

import React, { useEffect, useState } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import '../styles/color-fixes.css';
import { Header } from '@/components/layout/Header';
import { Navigation } from '@/components/layout/Navigation';
import { CustomerProvider } from '@/lib/contexts/CustomerContext';
import { LoadingState } from '@/components/common/LoadingState';
import { AlertCircle } from 'lucide-react';
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
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiChecking, setApiChecking] = useState(true);

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

  // Check API availability on mount
  useEffect(() => {
    const checkApi = async () => {
      try {
        const response = await fetch(`${CONFIG.api.baseUrl}/data`);
        if (!response.ok) {
          throw new Error(`API responded with status: ${response.status}`);
        }
        setApiError(null);
      } catch (err: any) {
        setApiError(`Failed to connect to API: ${err.message}`);
      } finally {
        setApiChecking(false);
      }
    };

    if (isAuthenticated && pathname !== '/login') {
      checkApi();
    } else {
      setApiChecking(false);
    }
  }, [isAuthenticated, pathname]);

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

  if (apiChecking) {
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

  if (apiError && pathname !== '/login') {
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
                <span className="text-xl font-semibold text-gray-800">API Connection Error</span>
              </div>
              <p className="text-gray-600 mb-4">{apiError}</p>
              <p className="text-sm text-gray-500">Please check that the API server is running and accessible.</p>
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
            <div className="min-h-screen bg-gray-50">
              <Header />
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