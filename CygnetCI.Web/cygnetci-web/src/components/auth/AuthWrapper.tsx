'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Navigation } from '@/components/layout/Navigation';
import { CustomerProvider } from '@/lib/contexts/CustomerContext';
import { ModuleProvider } from '@/lib/contexts/ModuleContext';
import { SidebarProvider, useSidebar } from '@/lib/contexts/SidebarContext';
import { LoadingState } from '@/components/common/LoadingState';
import { AlertCircle } from 'lucide-react';
import { CONFIG } from '@/lib/config';
import { installFetchInterceptor } from '@/lib/apiClient';

// Content wrapper that uses sidebar context
function LayoutContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <Suspense fallback={null}>
        <Navigation />
      </Suspense>
      <main
        className={`mt-16 p-8 transition-all duration-300 ${
          isCollapsed ? 'ml-16' : 'ml-64'
        }`}
      >
        {children}
      </main>
    </div>
  );
}

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Start with mounted=false to render children initially (for static HTML)
  const [mounted, setMounted] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiChecked, setApiChecked] = useState(false);

  // Public pages that must render without auth (handle trailing slash too)
  const isLoginPage = [
    '/login', '/login/',
    '/forgot-password', '/forgot-password/',
    '/reset-password', '/reset-password/',
  ].includes(pathname);

  // Mark as mounted after hydration; install the API auth interceptor first
  useEffect(() => {
    installFetchInterceptor();
    setMounted(true);
  }, []);

  // Check authentication after mount
  useEffect(() => {
    if (!mounted || isLoginPage) {
      setAuthChecked(true);
      setApiChecked(true);
      return;
    }

    const checkAuth = () => {
      try {
        const token = localStorage.getItem('auth_token');
        const user = localStorage.getItem('user');

        if (token && user) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          router.push('/login');
        }
      } catch (e) {
        setIsAuthenticated(false);
        router.push('/login');
      }
      setAuthChecked(true);
    };

    checkAuth();
  }, [mounted, isLoginPage, router]);

  // Check API availability after auth check
  useEffect(() => {
    if (!mounted || isLoginPage || !authChecked || !isAuthenticated) {
      if (authChecked) setApiChecked(true);
      return;
    }

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
        setApiChecked(true);
      }
    };

    checkApi();
  }, [mounted, isLoginPage, authChecked, isAuthenticated]);

  // Login page - render directly without providers
  if (isLoginPage) {
    return <>{children}</>;
  }

  // For all other pages, always wrap with providers (needed for hooks in page components)
  // During SSR/static (!mounted), show the page content directly
  // After mount, do auth checks

  // Before mount: render page content wrapped in providers (for static HTML)
  if (!mounted) {
    return (
      <SidebarProvider>
        <CustomerProvider><ModuleProvider>
          <LayoutContent>{children}</LayoutContent>
        </ModuleProvider></CustomerProvider>
      </SidebarProvider>
    );
  }

  // After mount: Show loading while checking auth
  if (!authChecked) {
    return (
      <SidebarProvider>
        <CustomerProvider><ModuleProvider>
          <LoadingState />
        </ModuleProvider></CustomerProvider>
      </SidebarProvider>
    );
  }

  // Not authenticated - will redirect, show loading
  if (!isAuthenticated) {
    return (
      <SidebarProvider>
        <CustomerProvider><ModuleProvider>
          <LoadingState />
        </ModuleProvider></CustomerProvider>
      </SidebarProvider>
    );
  }

  // Show loading while checking API
  if (!apiChecked) {
    return (
      <SidebarProvider>
        <CustomerProvider><ModuleProvider>
          <LoadingState />
        </ModuleProvider></CustomerProvider>
      </SidebarProvider>
    );
  }

  // API error
  if (apiError) {
    return (
      <SidebarProvider>
        <CustomerProvider><ModuleProvider>
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
        </ModuleProvider></CustomerProvider>
      </SidebarProvider>
    );
  }

  // Authenticated - render with full layout
  return (
    <SidebarProvider>
      <CustomerProvider><ModuleProvider>
        <LayoutContent>{children}</LayoutContent>
      </ModuleProvider></CustomerProvider>
    </SidebarProvider>
  );
}
