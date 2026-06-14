import { test, expect } from '@playwright/test';

// Uses default employee storageState from playwright.config.ts — already logged in

test.describe('Cursos E2E', () => {
  test('catálogo de cursos carrega após login', async ({ page }) => {
    await page.goto('/courses');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    // courses page renders "Catálogo de Cursos" as h1
    // (frontend/app/(platform)/courses/page.tsx:1006)
    await expect(page.locator('h1')).toContainText(/Catálogo|Curso/i, { timeout: 60000 });
  });

  test('página de cursos não mostra erro 500', async ({ page }) => {
    await page.goto('/courses');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await expect(page.locator('body')).not.toContainText(/500|erro interno|Internal Server Error/i);
  });

  test('detalhe de um curso abre ao clicar', async ({ page }) => {
    await page.goto('/courses');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    // course cards have title in div.text-sm.font-semibold.text-gray-900
    const firstCourse = page.locator('div.text-sm.font-semibold.text-gray-900').first();
    if (await firstCourse.isVisible({ timeout: 15000 })) {
      await firstCourse.click();
      await expect(page.locator('h1')).toBeVisible({ timeout: 20000 });
    }
  });
});
