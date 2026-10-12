import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../artifacts/api-server/src/config/env';

const valid = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  SESSION_SECRET: 'x'.repeat(32),
  PORT: '5000',
  NODE_ENV: 'test',
};

describe('environment validation', () => {
  it('accepts valid configuration', () => {
    expect(parseEnvironment(valid).PORT).toBe(5000);
  });
  for (const key of ['DATABASE_URL', 'SESSION_SECRET', 'PORT'] as const) {
    it(`fails clearly when ${key} is missing without exposing values`, () => {
      const input = { ...valid, [key]: undefined };
      expect(() => parseEnvironment(input)).toThrow(key);
      expect(() => parseEnvironment(input)).not.toThrow(valid.SESSION_SECRET);
    });
  }
  it('rejects short secrets, invalid database protocols and invalid ports', () => {
    expect(() =>
      parseEnvironment({ ...valid, SESSION_SECRET: 'short' }),
    ).toThrow();
    expect(() =>
      parseEnvironment({ ...valid, DATABASE_URL: 'https://example.com' }),
    ).toThrow();
    for (const PORT of ['0', '-1', '65536', '1.5', 'abc']) {
      expect(() => parseEnvironment({ ...valid, PORT })).toThrow('PORT');
    }
  });
});
