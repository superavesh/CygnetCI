import { test, expect } from '@playwright/test';
import { mockAuthenticatedBackend, mockLoginSuccess, mockLoginFailure } from './helpers';

test.describe('Login', () => {
  test('successful login stores the token and redirects to the dashboard', async ({ page }) => {
    await mockLoginSuccess(page);
    await mockAuthenticatedBackend(page);

    await page.goto('/login');
    await page.getByLabel('Username').fill('testuser');
    await page.getByLabel('Password').fill('correct-password');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL('http://127.0.0.1:3000/');

    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    const user = await page.evaluate(() => localStorage.getItem('user'));
    expect(token).toBe('fake-test-token');
    expect(JSON.parse(user!)).toMatchObject({ username: 'testuser' });
  });

  test('failed login shows an error and stays on the login page', async ({ page }) => {
    await mockLoginFailure(page, 'Invalid username or password');

    await page.goto('/login');
    await page.getByLabel('Username').fill('testuser');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText('Invalid username or password')).toBeVisible();
    await expect(page).toHaveURL(/\/login\/?$/);

    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeNull();
  });
});
