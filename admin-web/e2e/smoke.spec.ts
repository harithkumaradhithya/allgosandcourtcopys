import { expect, test } from '@playwright/test';

test.describe('app shell', () => {
  test('unauthenticated visitors land on the login form', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel('Mobile number')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|login/i })).toBeVisible();
  });
});
