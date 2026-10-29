import { defineConfig, devices } from '@playwright/test';

const webPort = Number(process.env.TEST_WEB_PORT ?? 3100);
const csrfTestPort = Number(process.env.TEST_CSRF_PORT ?? 8081);

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/a-virtual-player-h1.spec.ts'],
  outputDir: 'generated-artifacts/playwright',
  reporter: [
    ['list'],
    [
      'html',
      { outputFolder: 'generated-artifacts/playwright-report', open: 'never' },
    ],
    ...(process.env.CI ? ([['github']] as const) : []),
  ],
  use: {
    baseURL: process.env.TEST_BASE_URL ?? `http://127.0.0.1:${webPort}`,
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
  webServer: [
    {
      command: 'pnpm exec tsx e2e/support/csrf-test-server.ts',
      url: `http://127.0.0.1:${csrfTestPort}/healthz`,
      reuseExistingServer: false,
      env: { CSRF_TEST_PORT: String(csrfTestPort) },
    },
    {
      command: 'pnpm --filter @workspace/party-game run dev',
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: false,
      env: {
        PORT: String(webPort),
        BASE_PATH: '/',
        TEST_API_PROXY_TARGET: `http://127.0.0.1:${csrfTestPort}`,
      },
    },
  ],
});
