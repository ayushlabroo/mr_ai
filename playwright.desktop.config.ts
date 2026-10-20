import { defineConfig } from '@playwright/test';

// The built native app loads aster://app and does not need Vite or an HTTP listener.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/desktop.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: { trace: 'retain-on-failure' },
  projects: [{ name: 'desktop' }],
});
