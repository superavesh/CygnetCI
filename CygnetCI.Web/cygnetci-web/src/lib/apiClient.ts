// src/lib/apiClient.ts
// Two ways to reach the CygnetCI API with auth handled:
//   1) apiFetch(...)            — self-authenticating; attaches the Bearer token itself
//                                 and handles 401. Use for EARLY calls (e.g. React context
//                                 providers) that can race the interceptor install.
//   2) installFetchInterceptor  — global window.fetch patch so existing bare
//                                 `fetch(CONFIG.api.baseUrl + ...)` calls stay authed.
// Both share the same token/401 logic and both call the native fetch captured at module
// load, so they never double-process a request.

import { getApiBaseUrl } from './runtimeConfig';

// Capture native fetch at module load, before any interceptor patches window.fetch.
const rawFetch: typeof fetch =
  typeof window !== 'undefined'
    ? window.fetch.bind(window)
    : ((...args: any[]) => (globalThis as any).fetch(...args)) as any;

function withAuth(init: RequestInit = {}): RequestInit {
  if (typeof window === 'undefined') return init;
  const token = localStorage.getItem('auth_token');
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return { ...init, headers };
}

function handle401(response: Response): Response {
  if (
    response.status === 401 &&
    typeof window !== 'undefined' &&
    !window.location.pathname.startsWith('/login')
  ) {
    try {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
    } catch {
      /* ignore */
    }
    window.location.href = '/login';
  }
  return response;
}

/**
 * Self-authenticating fetch. Attaches the Bearer token directly (no reliance on the
 * global interceptor being installed first) and clears+redirects on 401.
 */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const response = await rawFetch(input as any, withAuth(init));
  return handle401(response);
}

let installed = false;

export function installFetchInterceptor(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

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
      return rawFetch(input as any, init);
    }

    const response = await rawFetch(input as any, withAuth(init));
    return handle401(response);
  };
}
