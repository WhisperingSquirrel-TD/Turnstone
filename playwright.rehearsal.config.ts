import { defineConfig, devices } from '@playwright/test';

const webPort = Number(process.env.REHEARSAL_WEB_PORT ?? 3111);
const apiPort = Number(process.env.REHEARSAL_API_PORT ?? 4111);
const databaseUrl = process.env.DATABASE_URL;
const sessionSecret = process.env.SESSION_SECRET;

if (!databaseUrl) throw new Error('Rehearsal e2e requires DATABASE_URL.');
if (!sessionSecret || sessionSecret.length < 32)
  throw new Error('Rehearsal e2e requires a 32-character SESSION_SECRET.');

export default defineConfig({
  testDir: './e2e',
  testMatch: 'rehearsal-live.spec.ts',
  outputDir: 'generated-artifacts/playwright-rehearsal',
  reporter: [['list']],
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 5_000 },
  use: {
    ...devices['Pixel 7'],
    browserName: 'chromium',
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: [
    {
      command: 'pnpm --filter @workspace/api-server run dev',
      url: `http://127.0.0.1:${apiPort}/healthz`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        PORT: String(apiPort),
        NODE_ENV: 'development',
        DATABASE_URL: databaseUrl,
        SESSION_SECRET: sessionSecret,
        APP_BASE_URL: `http://127.0.0.1:${webPort}`,
      },
    },
    {
      command: 'pnpm --filter @workspace/party-game run dev',
      url: `http://127.0.0.1:${webPort}`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        PORT: String(webPort),
        BASE_PATH: '/',
        TEST_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
      },
    },
  ],
});
