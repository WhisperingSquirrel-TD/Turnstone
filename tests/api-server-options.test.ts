import { expect, it } from 'vitest';
import { createServerAppOptions } from '../artifacts/api-server/src/server-options';

it('wires the configured public origin into invite links and credentialed CORS', () => {
  const environment = {
    NODE_ENV: 'production' as const,
    APP_BASE_URL: 'https://turnstone.stackstoneconsulting.co.uk',
    SESSION_SECRET: 'a'.repeat(32),
    MAX_ACTIVE_GAMES: 1_000,
  };
  const options = createServerAppOptions({
    environment,
    resolveViewer: () => ({ kind: 'visitor' }),
    publishGame: async () => {},
    countActiveGames: async () => 0,
  });

  expect(options.publicBaseUrl).toBe(environment.APP_BASE_URL);
  expect(options.allowedOrigins).toEqual([environment.APP_BASE_URL]);
  expect(options.secureCookies).toBe(true);
  expect(options.rateLimitSecret).toBe(environment.SESSION_SECRET);
});
