import { test, expect } from '@playwright/test';
import { mockAuthenticatedBackend, mockLoginSuccess, FAKE_USER } from './helpers';

test('login → authenticated shell renders → logout clears session', async ({ page }) => {
  await mockLoginSuccess(page);
  await mockAuthenticatedBackend(page);

  // --- Login ---
  await page.goto('/login');
  await page.getByLabel('Username').fill('testuser');
  await page.getByLabel('Password').fill('correct-password');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3000/');

  // --- Authenticated shell renders (header with the logged-in user, nav) ---
  const userMenuButton = page.getByTitle(FAKE_USER.full_name);
  await expect(userMenuButton).toBeVisible();
  await expect(page.getByRole('link', { name: /pipelines/i }).first()).toBeVisible();

  // --- Logout ---
  page.once('dialog', (dialog) => dialog.accept());
  await userMenuButton.click();
  await page.getByText('Logout', { exact: true }).click();

  await expect(page).toHaveURL(/\/login\/?$/);
  const token = await page.evaluate(() => localStorage.getItem('auth_token'));
  expect(token).toBeNull();
});
