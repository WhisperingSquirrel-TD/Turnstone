import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../artifacts/api-server/src/app';

describe('health and readiness', () => {
  it('health is independent of database availability', async () => {
    const app = createApp(async () => {
      throw new Error('private connection string');
    });
    expect((await request(app).get('/api/healthz')).body).toEqual({
      status: 'ok',
    });
  });
  it('returns ready only after its database probe succeeds', async () => {
    const app = createApp(async () => {});
    expect((await request(app).get('/api/readyz')).body).toEqual({
      status: 'ready',
    });
  });
  it('fails closed without disclosing database errors', async () => {
    const app = createApp(async () => {
      throw new Error('private connection string');
    });
    const response = await request(app).get('/api/readyz');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'unavailable' });
    expect(response.text).not.toContain('private');
  });
  it('sets baseline security headers including independent unpredictable nonces', async () => {
    const app = createApp(async () => {});
    const first = await request(app).get('/api/healthz');
    const second = await request(app).get('/api/healthz');
    const csp = first.headers['content-security-policy'] as string;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/script-src 'nonce-[A-Za-z0-9+/=]+'/);
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toEqual(second.headers['content-security-policy']);
    expect(first.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
    expect(first.headers['referrer-policy']).toBe('no-referrer');
    expect(first.headers['permissions-policy']).toContain('camera=()');
    expect(first.headers['x-content-type-options']).toBe('nosniff');
    expect(first.headers['x-frame-options']).toBe('DENY');
    expect(first.headers['x-powered-by']).toBeUndefined();
    expect(first.headers['cache-control']).toBe('no-store');
  });
});
