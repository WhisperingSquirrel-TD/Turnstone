import { describe, expect, it } from 'vitest';
import { loggerRedactionPaths } from '../artifacts/api-server/src/lib/log-redaction';

describe('request log redaction', () => {
  it('redacts PINs, join credentials, session cookies and CSRF tokens', () => {
    expect(loggerRedactionPaths).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        "req.headers['x-csrf-token']",
        'req.body.pin',
        'req.body.newPin',
        'req.body.shortCode',
        'req.body.inviteToken',
        'req.body.code',
        "res.headers['set-cookie']",
      ]),
    );
  });
});
