import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../artifacts/api-server/src/config/env';

const valid = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  SESSION_SECRET: 'x'.repeat(32),
  PIN_PEPPER: 'test-only-pin-pepper-secret-0123456789abcdef',
  PORT: '5000',
  NODE_ENV: 'test',
};

describe('environment validation', () => {
  it('accepts valid configuration', () => {
    expect(parseEnvironment(valid).PORT).toBe(5000);
  });
  it('requires the public app origin in production', () => {
    expect(() =>
      parseEnvironment({ ...valid, NODE_ENV: 'production' }),
    ).toThrow('APP_BASE_URL');
    expect(
      parseEnvironment({
        ...valid,
        NODE_ENV: 'production',
        APP_BASE_URL: 'https://oathstone.stackstoneconsulting.co.uk',
        MAX_ACTIVE_GAMES: '1000',
      }).APP_BASE_URL,
    ).toBe('https://oathstone.stackstoneconsulting.co.uk');
    expect(() =>
      parseEnvironment({
        ...valid,
        NODE_ENV: 'production',
        APP_BASE_URL: 'https://oathstone.stackstoneconsulting.co.uk',
      }),
    ).toThrow('MAX_ACTIVE_GAMES');
  });
  it('requires explicit coming-soon mode before allowing public crawling', () => {
    expect(() =>
      parseEnvironment({
        ...valid,
        PRE_LAUNCH_NOINDEX: 'false',
      }),
    ).toThrow('COMING_SOON_MODE');

    const comingSoon = parseEnvironment({
      ...valid,
      PRE_LAUNCH_NOINDEX: 'false',
      COMING_SOON_MODE: 'true',
    });
    expect(comingSoon.PRE_LAUNCH_NOINDEX).toBe(false);
    expect(comingSoon.COMING_SOON_MODE).toBe(true);
  });
  for (const key of [
    'DATABASE_URL',
    'SESSION_SECRET',
    'PIN_PEPPER',
    'PORT',
  ] as const) {
    it(`fails clearly when ${key} is missing without exposing values`, () => {
      const input = { ...valid, [key]: undefined };
      expect(() => parseEnvironment(input)).toThrow(key);
      expect(() => parseEnvironment(input)).not.toThrow(valid.SESSION_SECRET);
    });
  }
  it('supports a previous pepper only with its matching version and never echoes secrets', () => {
    const previousPepper = 'previous-test-pin-pepper-0123456789abcdef';
    const rotated = parseEnvironment({
      ...valid,
      PIN_PEPPER_VERSION: '2',
      PIN_PEPPER_PREVIOUS: previousPepper,
      PIN_PEPPER_PREVIOUS_VERSION: '1',
    });
    expect(rotated.PIN_PEPPER_VERSION).toBe(2);
    expect(rotated.PIN_PEPPER_PREVIOUS_VERSION).toBe(1);

    let errorMessage = '';
    try {
      parseEnvironment({
        ...valid,
        PIN_PEPPER_PREVIOUS: previousPepper,
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    expect(errorMessage).toContain('PIN_PEPPER_PREVIOUS_VERSION');
    expect(errorMessage).not.toContain(previousPepper);
  });
  it('rejects short secrets, invalid database protocols and invalid ports', () => {
    expect(() =>
      parseEnvironment({ ...valid, SESSION_SECRET: 'short' }),
    ).toThrow();
    expect(() => parseEnvironment({ ...valid, PIN_PEPPER: 'short' })).toThrow(
      'PIN_PEPPER',
    );
    expect(() =>
      parseEnvironment({ ...valid, DATABASE_URL: 'https://example.com' }),
    ).toThrow();
    for (const PORT of ['0', '-1', '65536', '1.5', 'abc']) {
      expect(() => parseEnvironment({ ...valid, PORT })).toThrow('PORT');
    }
  });
});
