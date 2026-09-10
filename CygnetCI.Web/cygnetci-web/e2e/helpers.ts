import type { Page } from '@playwright/test';

// Base URL the frontend calls, per public/system.config.js (dev default).
export const API_BASE_URL = 'http://127.0.0.1:8000';

export const FAKE_USER = {
  id: 1,
  username: 'testuser',
  email: 'testuser@example.com',
  full_name: 'Test User',
  is_superuser: true,
};

/**
 * Mocks the small set of backend endpoints that AuthWrapper / CustomerContext /
 * ModuleContext call unconditionally on every authenticated page, before any
 * page-specific content renders. An empty customers list means CustomerContext
 * never selects a customer, which means the dashboard's own useData() fetch
 * never fires either — so this is enough to reach a fully rendered
 * authenticated shell (header + nav + sidebar) without needing to know about
 * every business page's own data-fetching.
 */
export async function mockAuthenticatedBackend(page: Page) {
  await page.route(`${API_BASE_URL}/data`, (route) =>
    route.fulfill({ json: {} })
  );
  await page.route(`${API_BASE_URL}/customers/**`, (route) =>
    route.fulfill({ json: [] })
  );
  await page.route(`${API_BASE_URL}/system/modules`, (route) =>
    route.fulfill({ json: [] })
  );
  await page.route(`${API_BASE_URL}/auth/logout`, (route) =>
    route.fulfill({ json: { success: true } })
  );
}

export async function mockLoginSuccess(page: Page) {
  await page.route(`${API_BASE_URL}/auth/login`, (route) =>
    route.fulfill({
      json: { access_token: 'fake-test-token', user: FAKE_USER },
    })
  );
}

export async function mockLoginFailure(page: Page, detail = 'Invalid username or password') {
  await page.route(`${API_BASE_URL}/auth/login`, (route) =>
    route.fulfill({ status: 401, json: { detail } })
  );
}
