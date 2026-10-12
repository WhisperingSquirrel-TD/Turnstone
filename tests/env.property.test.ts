import { expect, it } from 'vitest';
import fc from 'fast-check';
import { parseEnvironment } from '../artifacts/api-server/src/config/env';

it('accepts exactly integer TCP ports in range', () => {
  fc.assert(
    fc.property(fc.integer({ min: -100000, max: 100000 }), (port) => {
      const parse = () =>
        parseEnvironment({
          DATABASE_URL: 'postgresql://test:test@localhost/test',
          SESSION_SECRET: 'x'.repeat(32),
          NODE_ENV: 'test',
          PORT: String(port),
        });
      if (port >= 1 && port <= 65535) expect(parse().PORT).toBe(port);
      else expect(parse).toThrow('PORT');
    }),
    { numRuns: 500 },
  );
});
