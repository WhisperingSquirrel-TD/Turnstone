import { expect, it } from 'vitest';
import { createServerAppOptions } from '../artifacts/api-server/src/server-options';
import { parseEnvironment } from '../artifacts/api-server/src/config/env';

it('wires the configured public origin into invite links and credentialed CORS', () => {
  const environment = {
    NODE_ENV: 'production' as const,
    APP_BASE_URL: 'https://turnstone.stackstoneconsulting.co.uk',
    SESSION_SECRET: 'a'.repeat(32),
    PIN_PEPPER: 'test-only-pin-pepper-secret-0123456789abcdef',
    PIN_PEPPER_VERSION: 1,
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
  expect(options.pinPepperConfig).toEqual({
    current: {
      version: environment.PIN_PEPPER_VERSION,
      secret: environment.PIN_PEPPER,
    },
  });
});

it('uses the managed Replit dev domain as the development origin when no base URL is configured', () => {
  const environment = parseEnvironment({
    DATABASE_URL: 'postgresql://localhost/turnstone',
    SESSION_SECRET: 's'.repeat(32),
    PIN_PEPPER: 'test-only-pin-pepper-secret-0123456789abcdef',
    PORT: '8080',
    NODE_ENV: 'development',
    REPLIT_DEV_DOMAIN: 'turnstone.replit.dev',
  });
  const options = createServerAppOptions({
    environment,
    resolveViewer: () => ({ kind: 'visitor' }),
    publishGame: async () => {},
    countActiveGames: async () => 0,
  });

  expect(options.allowedOrigins).toEqual(['https://turnstone.replit.dev']);
  expect(options.publicBaseUrl).toBe('https://turnstone.replit.dev');
});
