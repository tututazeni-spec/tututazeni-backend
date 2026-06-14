import { defineConfig } from '@playwright/test';
import * as path from 'path';

const AUTH_DIR = path.join(__dirname, 'test', 'e2e', '.auth');

export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.e2e.ts',
  globalSetup: './test/e2e/setup/auth.setup.ts',
  timeout: 300000,   // 5m per test — allows for Next.js compilation
  retries: 1,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    // Default auth state: employee (most tests run as employee)
    storageState: path.join(AUTH_DIR, 'employee.json'),
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    actionTimeout: 30000,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test/e2e/reports', open: 'never' }],
  ],
});
