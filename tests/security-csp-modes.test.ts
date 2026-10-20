import { describe, expect, it } from 'vitest';
import { securityHeaders } from '../lib/security/src';

describe('content security policy modes', () => {
  it('allows Vite development scripts and styles only in development', () => {
    const development = securityHeaders('test-nonce', true)[
      'Content-Security-Policy'
    ];
    const production = securityHeaders('test-nonce')['Content-Security-Policy'];

    expect(development).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    );
    expect(development).toContain("style-src 'self' 'unsafe-inline'");
    expect(development).toContain('ws: wss:');
    expect(development).toContain("media-src 'self'");
    expect(production).not.toContain("'unsafe-inline'");
    expect(production).not.toContain("'unsafe-eval'");
    expect(production).toContain(
      "script-src 'nonce-test-nonce' 'strict-dynamic'",
    );
    expect(production).toContain("media-src 'self'");
  });
});
