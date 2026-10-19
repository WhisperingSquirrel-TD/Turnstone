import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  grep: /all public pages/,
  projects: [
    {
      name: 'public-firefox',
      testMatch: /public-pages\.spec\.ts/,
      use: {
        browserName: 'firefox',
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
});
