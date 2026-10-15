import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../artifacts/api-server/src/app';
import { PRE_LAUNCH_NOINDEX } from '../lib/security/src/deployment';
import { entryFailureMessages, gameConfigSchema } from '../lib/shared/src';

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
    expect(
      (await request(app).get('/api/readyz')).headers['x-robots-tag'],
    ).toBe(PRE_LAUNCH_NOINDEX ? 'noindex, nofollow' : undefined);
  });
  it('fails closed without disclosing database errors', async () => {
    const app = createApp(async () => {
      throw new Error('private connection string');
    });
    const response = await request(app).get('/api/readyz');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'unavailable' });
    expect(response.text).not.toContain('private');
    expect(response.headers['x-robots-tag']).toBe(
      PRE_LAUNCH_NOINDEX ? 'noindex, nofollow' : undefined,
    );
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
    expect(first.headers['x-robots-tag']).toBe(
      PRE_LAUNCH_NOINDEX ? 'noindex, nofollow' : undefined,
    );
    expect(second.headers['x-robots-tag']).toBe(
      PRE_LAUNCH_NOINDEX ? 'noindex, nofollow' : undefined,
    );
    expect(
      (await request(app).get('/missing-route')).headers['x-robots-tag'],
    ).toBe(PRE_LAUNCH_NOINDEX ? 'noindex, nofollow' : undefined);
  });

  it('fails closed for game commands without an authenticated viewer', async () => {
    const app = createApp(async () => {});
    const commandResponse = await request(app)
      .post('/api/games/not-authorised/commands')
      .send({
        type: 'AdvancePhase',
        idempotencyKey: 'advance-key',
        expectedVersion: 0,
      });
    expect(commandResponse.status).toBe(401);
    expect(commandResponse.body).toEqual({
      error: 'Authentication required',
    });
  });

  it('hides authentication dependency errors behind a generic response', async () => {
    const app = createApp(async () => {}, {
      resolveViewer: async () => {
        throw new Error('private identity-provider response');
      },
    });
    const response = await request(app)
      .post('/api/games')
      .send({
        type: 'CreateGame',
        id: 'auth-error-game',
        idempotencyKey: 'auth-error-request',
        config: gameConfigSchema.parse({}),
      });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Service unavailable' });
    expect(response.text).not.toContain('private identity-provider response');
  });

  it('allows credentialed browser requests only from the configured app origin', async () => {
    const app = createApp(async () => {}, {
      allowedOrigins: ['https://turnstone.stackstoneconsulting.co.uk'],
    });
    const allowed = await request(app)
      .get('/api/healthz')
      .set('Origin', 'https://turnstone.stackstoneconsulting.co.uk');
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://turnstone.stackstoneconsulting.co.uk',
    );
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await request(app)
      .get('/api/healthz')
      .set('Origin', 'https://untrusted.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns a generic JSON error for malformed boundary payloads', async () => {
    const app = createApp(async () => {});
    const response = await request(app)
      .post('/api/games')
      .set('Content-Type', 'application/json')
      .send('{"secret":"never echo this"');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request' });
  });

  it('rejects new games above 80 percent of measured capacity', async () => {
    const app = createApp(async () => {}, {
      resolveViewer: () => ({ kind: 'coordinator' }),
      maxActiveGames: 10,
      countActiveGames: async () => 9,
    });
    const response = await request(app)
      .post('/api/games')
      .send({
        type: 'CreateGame',
        id: 'busy-game',
        idempotencyKey: 'create-while-busy',
        config: gameConfigSchema.parse({}),
      });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: 'Busy right now, try again in a few minutes',
    });
  });

  it('issues a host-only CSRF cookie and requires its token on browser mutations', async () => {
    const origin = 'https://turnstone.stackstoneconsulting.co.uk';
    const app = createApp(async () => {}, {
      allowedOrigins: [origin],
      secureCookies: true,
    });
    const tokenResponse = await request(app).get('/api/csrf');
    expect(tokenResponse.status).toBe(200);
    expect(tokenResponse.body.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const setCookie = tokenResponse.headers['set-cookie']?.[0] ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).not.toContain('Domain=');
    const reusedToken = await request(app)
      .get('/api/csrf')
      .set('Cookie', `turnstone-csrf=${tokenResponse.body.csrfToken}`);
    expect(reusedToken.body.csrfToken).toBe(tokenResponse.body.csrfToken);

    const denied = await request(app)
      .post('/api/games')
      .set('Origin', origin)
      .send({});
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({ error: 'Invalid request' });

    const allowed = await request(app)
      .post('/api/games/csrf-game/commands')
      .set('Origin', origin)
      .set('Cookie', setCookie.split(';')[0]!)
      .set('X-CSRF-Token', tokenResponse.body.csrfToken)
      .send({
        type: 'AdvancePhase',
        expectedVersion: 0,
        idempotencyKey: 'csrf-request',
      });
    expect(allowed.status).toBe(401);
    expect(allowed.body).toEqual({ error: 'Authentication required' });
  });

  it('requires a valid CSRF token on every game-scoped write route', async () => {
    const app = createApp(async () => {});
    const paths = [
      '/api/games/test-game/private-view',
      '/api/games/test-game/presenter-pairings',
      '/api/presenter/pair',
      '/api/recover',
      '/api/games/test-game/join',
      '/api/games/test-game/seats/test-seat/pin/reset',
      '/api/games/test-game/coordinator-handoffs',
      '/api/games/test-game/invites',
      '/api/games/test-game/join-requests/test-request/decision',
      '/api/coordinator-handoffs/claim',
      '/api/join',
    ];

    for (const path of paths) {
      const response = await request(app)
        .post(path)
        .set('Origin', 'https://turnstone.stackstoneconsulting.co.uk')
        .send({});
      expect(response.status, path).toBe(403);
      expect(response.body, path).toEqual({
        error: [
          '/api/recover',
          '/api/games/test-game/join',
          '/api/join',
        ].includes(path)
          ? entryFailureMessages.securityCheck
          : 'Invalid request',
      });
    }
  });

  it('rejects malformed recovery, join and presenter pairing payloads after CSRF', async () => {
    const app = createApp(async () => {}, {
      rateLimitSecret: 'unit-test-secret',
    });
    const csrfResponse = await request(app).get('/api/csrf');
    const token = csrfResponse.body.csrfToken as string;
    const cookie = csrfResponse.headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    for (const path of ['/api/recover', '/api/join', '/api/presenter/pair']) {
      const response = await request(app)
        .post(path)
        .set('Origin', 'https://turnstone.stackstoneconsulting.co.uk')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', token)
        .send({});
      expect(response.status, path).toBe(400);
      expect(response.body, path).toEqual({
        error:
          path === '/api/recover'
            ? entryFailureMessages.recoveryFailed
            : path === '/api/join'
              ? entryFailureMessages.joinDetailsInvalid
              : 'Invalid request',
      });
    }
  });

  it('does not allow CreateGame through a game-scoped command route', async () => {
    const origin = 'https://turnstone.stackstoneconsulting.co.uk';
    const app = createApp(async () => {}, {
      allowedOrigins: [origin],
    });
    const csrf = await request(app).get('/api/csrf');
    const token = csrf.body.csrfToken as string;
    const cookie = csrf.headers['set-cookie']?.[0]?.split(';')[0] ?? '';
    const response = await request(app)
      .post('/api/games/untrusted-game/commands')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', token)
      .send({
        type: 'CreateGame',
        id: 'not-allowed-here',
        idempotencyKey: 'create-game-on-command-route',
        config: gameConfigSchema.parse({}),
      });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request' });
  });

  it('returns the same not-found response for malformed join request IDs', async () => {
    const app = createApp(async () => {}, {
      rateLimitSecret: 'unit-test-secret',
      consumeRateLimit: async () => true,
    });
    const response = await request(app).get('/api/join-requests/not-a-token');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found' });

    const missingToken = await request(app).get(
      '/api/join-requests/0123456789abcdef0123456789abcdef',
    );
    expect(missingToken.status).toBe(404);
    expect(missingToken.body).toEqual({ error: 'Not found' });
  });

  it('rate-limits creation by a pseudonymous IP and coordinator bucket', async () => {
    const bucketHashes: string[] = [];
    const app = createApp(async () => {}, {
      resolveViewer: () => ({ kind: 'coordinator' }),
      rateLimitSecret: 'unit-test-secret',
      consumeRateLimit: async (bucketHash) => {
        bucketHashes.push(bucketHash);
        return false;
      },
    });
    const response = await request(app)
      .post('/api/games')
      .send({
        type: 'CreateGame',
        id: 'rate-limited-game',
        idempotencyKey: 'rate-limited-request',
        config: gameConfigSchema.parse({}),
      });
    expect(response.status).toBe(429);
    expect(response.body).toEqual({ error: 'Too many requests' });
    expect(bucketHashes).toHaveLength(1);
    expect(bucketHashes[0]).toMatch(/^[a-f0-9]{64}$/);
  });

  it('checks the pseudonymous IP bucket before applying admission control', async () => {
    const bucketHashes: string[] = [];
    const limits: number[] = [];
    const app = createApp(async () => {}, {
      resolveViewer: () => ({ kind: 'coordinator' }),
      rateLimitSecret: 'unit-test-secret',
      consumeRateLimit: async (bucketHash, limit) => {
        bucketHashes.push(bucketHash);
        limits.push(limit);
        return true;
      },
      maxActiveGames: 0,
      countActiveGames: async () => 1,
    });
    const response = await request(app)
      .post('/api/games')
      .send({
        type: 'CreateGame',
        id: 'admission-limited-game',
        idempotencyKey: 'admission-limited-request',
        config: gameConfigSchema.parse({}),
      });
    expect(response.status).toBe(503);
    expect(bucketHashes).toHaveLength(1);
    expect(bucketHashes[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(limits).toEqual([5]);
  });

  it('uses the tighter rate limit for private Traitor chat', async () => {
    const limits: number[] = [];
    const app = createApp(async () => {}, {
      resolveViewer: () => ({ kind: 'player', seatId: 'seat-1' }),
      rateLimitSecret: 'unit-test-secret',
      consumeRateLimit: async (_bucketHash, limit) => {
        limits.push(limit);
        return false;
      },
    });
    const response = await request(app)
      .post('/api/games/game-id/commands')
      .send({
        type: 'PostTraitorMessage',
        expectedVersion: 1,
        idempotencyKey: 'chat-rate-limit',
        text: 'A private message',
      });
    expect(response.status).toBe(429);
    expect(limits).toEqual([30]);
  });

  it.each(['visitor', 'ghost', 'presenter', 'admin'] as const)(
    'denies %s from mutating an existing game',
    async (kind) => {
      const app = createApp(async () => {}, {
        resolveViewer: () => ({ kind }),
      });
      const response = await request(app)
        .post('/api/games/game-id/commands')
        .send({
          type: 'AdvancePhase',
          expectedVersion: 1,
          idempotencyKey: `unauthorised-${kind}`,
        });
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Authentication required' });
    },
  );
});
