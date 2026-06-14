import { test, expect } from '@playwright/test';
import { loginViaUI, E2E_USERS } from './helpers/login.helper';
import * as path from 'path';

const EMPLOYEE_AUTH = path.join(__dirname, '.auth', 'employee.json');

// Login/password tests start unauthenticated to test the actual login UI
test.describe('Autenticação E2E', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login com sucesso leva ao dashboard', async ({ page }) => {
    await loginViaUI(page, 'employee');
    await expect(page).toHaveURL(/dashboard/);
  });

  test('password errada mostra mensagem de erro', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', E2E_USERS.employee.email);
    await page.fill('input[type="password"]', 'password_errada');
    await page.click('button[type="submit"]');
    await expect(page.locator('.login-error')).toBeVisible({ timeout: 10000 });
  });

  test('página de login carrega sem erros', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});

// Logout test uses saved auth state so the Sidebar renders immediately
test.describe('Logout E2E', () => {
  test.use({ storageState: EMPLOYEE_AUTH });

  test('logout volta ao login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('load');
    // Sidebar (frontend/components/Sidebar.tsx:191) renders "Sair" button always
    const sairBtn = page.locator('button:has-text("Sair")').last();
    await sairBtn.waitFor({ state: 'visible', timeout: 60000 });
    await sairBtn.scrollIntoViewIfNeeded();
    await sairBtn.click();
    await expect(page).toHaveURL(/login/, { timeout: 15000 });
  });
});
