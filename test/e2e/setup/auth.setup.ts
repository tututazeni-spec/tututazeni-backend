// test/e2e/setup/auth.setup.ts
// Global setup: login ONCE per user role and save localStorage state.
// All tests reuse the saved state — avoiding repeated login (and Next.js compilation).

import { chromium, FullConfig } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BASE_URL = 'http://localhost:3000';
const AUTH_DIR = path.join(__dirname, '..', '.auth');

const USERS = {
  employee: { email: 'int.employee@innova-test.com', password: 'Test@1234' },
  rh:       { email: 'int.rh@innova-test.com',       password: 'Test@1234' },
};

async function saveAuthState(email: string, password: string, filename: string) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`  → a autenticar ${email}...`);

  // Navigate to login page (Next.js compiles here, may take ~60-90s first time)
  // Use 'load' not 'networkidle' — Next.js HMR websocket prevents networkidle
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'load', timeout: 120000 });
  // Wait for the email input to be ready (page hydrated)
  await page.waitForSelector('input[type="email"]', { timeout: 120000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for dashboard navigation (compilation may take time)
  await page.waitForURL('**/dashboard', { timeout: 120000 });

  // Copy token to all localStorage keys used by different pages
  await page.evaluate(() => {
    const token = localStorage.getItem('token');
    if (token) {
      localStorage.setItem('access_token', token);
      localStorage.setItem('innova_token', token);
    }
  });

  // Save the storage state (localStorage + cookies)
  await context.storageState({ path: path.join(AUTH_DIR, filename) });
  await browser.close();
  console.log(`  ✅ ${filename} guardado`);
}

export default async function globalSetup(_config: FullConfig) {
  console.log('\n🔐 Auth setup — a preparar estados de autenticação...');

  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  for (const [role, creds] of Object.entries(USERS)) {
    await saveAuthState(creds.email, creds.password, `${role}.json`);
  }

  console.log('✅ Auth setup concluído\n');
}
