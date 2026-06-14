import { Page, BrowserContext } from '@playwright/test';
import * as path from 'path';

export const E2E_USERS = {
  employee: { email: 'int.employee@innova-test.com', password: 'Test@1234' },
  rh:       { email: 'int.rh@innova-test.com',       password: 'Test@1234' },
  admin:    { email: 'int.admin@innova-test.com',     password: 'Test@1234' },
};

export const AUTH_STATE = {
  employee: path.join(__dirname, '..', '.auth', 'employee.json'),
  rh:       path.join(__dirname, '..', '.auth', 'rh.json'),
};

// Use when a test needs to switch user role (different from the config default).
// Most tests use the default employee storageState from playwright.config.ts
// and do NOT need to call this — they start already logged in.
export async function loginAs(context: BrowserContext, role: keyof typeof AUTH_STATE) {
  await context.storageState().then(async () => {
    // Clear and reload with the target role's saved state
    await context.clearCookies();
    await context.addInitScript(`
      const state = ${JSON.stringify(require(AUTH_STATE[role]))};
      if (state.origins) {
        for (const origin of state.origins) {
          for (const item of (origin.localStorage || [])) {
            localStorage.setItem(item.name, item.value);
          }
        }
      }
    `);
  });
}

// Legacy login via UI — kept for reference but use storageState instead.
// Only call this if you need to test the actual login UI flow.
export async function loginViaUI(page: Page, user: keyof typeof E2E_USERS) {
  await page.goto('/login');
  await page.fill('input[type="email"]', E2E_USERS[user].email);
  await page.fill('input[type="password"]', E2E_USERS[user].password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 120000 });
  await page.evaluate(() => {
    const token = localStorage.getItem('token');
    if (token) {
      localStorage.setItem('access_token', token);
      localStorage.setItem('innova_token', token);
    }
  });
}

// Alias for backward compatibility
export const login = loginViaUI;
