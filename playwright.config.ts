import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: 'generated-artifacts/playwright',
  reporter: [
    ['list'],
    [
      'html',
      { outputFolder: 'generated-artifacts/playwright-report', open: 'never' },
    ],
  ],
  use: {
    baseURL:
      process.env.TEST_BASE_URL ??
      (process.env.CI === 'true'
        ? 'http://127.0.0.1:22814'
        : 'http://localhost:80'),
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'iPhone',
      use: {
        ...devices['iPhone 13'],
        browserName: 'webkit',
        launchOptions: { executablePath: process.env.WEBKIT_TEST_EXECUTABLE },
      },
    },
    { name: 'Pixel', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    {
      name: 'iPad',
      use: {
        ...devices['iPad (gen 7)'],
        browserName: 'webkit',
        launchOptions: { executablePath: process.env.WEBKIT_TEST_EXECUTABLE },
      },
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer:
    process.env.CI === 'true'
      ? {
          command: 'pnpm --filter @workspace/party-game run dev',
          url: 'http://127.0.0.1:22814',
          reuseExistingServer: false,
          env: { PORT: '22814', BASE_PATH: '/' },
        }
      : undefined,
});
