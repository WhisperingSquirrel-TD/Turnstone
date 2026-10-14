import { describe, expect, it } from 'vitest';
import { devSecurityHeaders } from '../artifacts/party-game/vite.security';

describe('Vite development security headers', () => {
  it('allows only the explicitly configured sibling API origin in connect-src', () => {
    const headers = devSecurityHeaders('test-nonce', 'http://127.0.0.1:4111');

    expect(headers['Content-Security-Policy']).toContain(
      "connect-src 'self' http://127.0.0.1:4111 ws: wss:",
    );
  });

  it('keeps same-origin development connections when no API origin is configured', () => {
    const headers = devSecurityHeaders('test-nonce', undefined);

    expect(headers['Content-Security-Policy']).toContain(
      "connect-src 'self' ws: wss:",
    );
  });
});
