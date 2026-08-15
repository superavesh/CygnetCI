// src/lib/apiClient.ts
// Installs a global fetch interceptor that:
//   1) attaches the Bearer token to every request hitting the CygnetCI API, and
//   2) on a 401, clears the session and redirects to /login.
// This lets all existing `fetch(CONFIG.api.baseUrl + ...)` calls stay unchanged.

import { getApiBaseUrl } from './runtimeConfig';

let installed = false;

export function installFetchInterceptor(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : (input as Request).url;

    const base = getApiBaseUrl();
    const isApiCall = !!base && typeof url === 'string' && url.startsWith(base);

    if (!isApiCall) {
      return originalFetch(input as any, init);
    }

    const token = localStorage.getItem('auth_token');
    const headers = new Headers(init.headers || {});
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await originalFetch(input as any, { ...init, headers });

    if (response.status === 401 && !window.location.pathname.startsWith('/login')) {
      try {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
      } catch {
        /* ignore */
      }
      window.location.href = '/login';
    }

    return response;
  };
}
