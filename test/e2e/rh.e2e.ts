import { test, expect } from '@playwright/test';
import * as path from 'path';

const RH_AUTH = path.join(__dirname, '.auth', 'rh.json');

test.describe('Permissões RH E2E', () => {
  test('utilizador RH acede à página de utilizadores', async ({ browser }) => {
    // Use RH auth state for this test
    const context = await browser.newContext({ storageState: RH_AUTH });
    const page = await context.newPage();

    await page.goto('/users');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    // users page renders column header "Utilizador"
    // (frontend/app/(platform)/users/page.tsx:268)
    await expect(
      page.locator('text=Utilizador').first()
        .or(page.locator('div.text-sm.font-medium.text-gray-900').first())
    ).toBeVisible({ timeout: 60000 });

    await context.close();
  });

  test('página de utilizadores não mostra erro 500 para RH', async ({ browser }) => {
    const context = await browser.newContext({ storageState: RH_AUTH });
    const page = await context.newPage();

    await page.goto('/users');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await expect(page.locator('body')).not.toContainText(/500|erro interno|Internal Server Error/i);

    await context.close();
  });

  test('utilizador employee consegue aceder à sua área', async ({ page }) => {
    // Default storageState = employee
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await expect(page.locator('body')).not.toContainText(/500|erro interno|Internal Server Error/i);
  });
});
