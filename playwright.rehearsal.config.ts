import { defineConfig, devices } from '@playwright/test';

const webPort = Number(process.env.REHEARSAL_WEB_PORT ?? 3111);
const apiPort = Number(process.env.REHEARSAL_API_PORT ?? 4111);
const databaseUrl = process.env.DATABASE_URL;
const sessionSecret = process.env.SESSION_SECRET;
const rehearsalProfile = process.env.REHEARSAL_PROFILE ?? 'Pixel';
const virtualPlayerSeed = process.env.VIRTUAL_PLAYER_SEED;
const useDesktop = rehearsalProfile === 'Desktop';
const useIPhone = rehearsalProfile === 'iPhone';
const useIPad = rehearsalProfile === 'iPad';
const useWebKit = useIPhone || useIPad;
if (!['Desktop', 'Pixel', 'iPhone', 'iPad'].includes(rehearsalProfile))
  throw new Error(`Unsupported rehearsal profile: ${rehearsalProfile}`);
const rehearsalDevice = useDesktop
  ? devices['Desktop Chrome']
  : useIPhone
    ? devices['iPhone 13']
    : useIPad
      ? devices['iPad (gen 7)']
      : devices['Pixel 7'];
const serverTestFlags = [
  '--test-only-force-human-removal',
  '--test-only-force-first-vote-tie',
  '--test-only-force-human-faithful',
  '--test-only-short-timers',
];

if (!databaseUrl) throw new Error('Rehearsal e2e requires DATABASE_URL.');
if (!sessionSecret || sessionSecret.length < 32)
  throw new Error('Rehearsal e2e requires a 32-character SESSION_SECRET.');

export default defineConfig({
  testDir: './e2e',
  testMatch: [
    'a-virtual-player-h1.spec.ts',
    'rehearsal-live.spec.ts',
    'disconnected-player-live.spec.ts',
  ],
  outputDir: 'generated-artifacts/playwright-rehearsal',
  reporter: [['list'], ...(process.env.CI ? ([['github']] as const) : [])],
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 5_000 },
  use: {
    ...rehearsalDevice,
    browserName: useWebKit ? 'webkit' : 'chromium',
    ...(useWebKit && process.env.WEBKIT_TEST_EXECUTABLE
      ? {
          launchOptions: { executablePath: process.env.WEBKIT_TEST_EXECUTABLE },
        }
      : {}),
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: [
    {
      command: `pnpm --filter @workspace/api-server run build && cd artifacts/api-server && node --enable-source-maps ./dist/index.mjs ${serverTestFlags.join(' ')}`,
      url: `http://127.0.0.1:${apiPort}/healthz`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        PORT: String(apiPort),
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl,
        SESSION_SECRET: sessionSecret,
        APP_BASE_URL: `http://127.0.0.1:${webPort}`,
        ...(virtualPlayerSeed
          ? { VIRTUAL_PLAYER_ENGINE_SEED: `${virtualPlayerSeed}:engine` }
          : {}),
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
