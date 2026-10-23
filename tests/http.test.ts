import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  createApp,
  createReadinessStatusReader,
} from '../artifacts/api-server/src/app';
import {
  PRE_LAUNCH_NOINDEX,
  type DeploymentMode,
} from '../lib/security/src/deployment';
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
  it('caches database readiness results for at least one minute', async () => {
    let now = 1_000_000;
    let probeSucceeds = false;
    const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const probe = vi.fn(async () => {
      if (!probeSucceeds) throw new Error('database unavailable');
    });
    try {
      const app = createApp(probe);
      expect((await request(app).get('/api/readyz')).status).toBe(503);
      expect(probe).toHaveBeenCalledTimes(1);
      expect((await request(app).get('/healthz')).body).toEqual({
        status: 'ok',
      });
      expect(probe).toHaveBeenCalledTimes(1);

      probeSucceeds = true;
      now += 59_999;
      expect((await request(app).get('/readyz')).status).toBe(503);
      expect(probe).toHaveBeenCalledTimes(1);

      now += 1;
      expect((await request(app).get('/api/readyz')).status).toBe(200);
      expect(probe).toHaveBeenCalledTimes(2);
    } finally {
      dateNow.mockRestore();
    }
  });
  it('shares one in-flight database probe across concurrent readiness requests', async () => {
    let releaseProbe: (() => void) | undefined;
    const probeGate = new Promise<void>((resolve) => {
      releaseProbe = resolve;
    });
    const probe = vi.fn(() => probeGate);
    const readStatus = createReadinessStatusReader(probe);
    const first = readStatus();
    const second = readStatus();
    expect(probe).toHaveBeenCalledTimes(1);
    releaseProbe?.();
    expect(await Promise.all([first, second])).toEqual(['ready', 'ready']);
    expect(probe).toHaveBeenCalledTimes(1);
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

  it('requires the game-scoped coordinator capability for the blind console view', async () => {
    for (const viewer of [
      { kind: 'visitor' },
      { kind: 'player', seatId: 'organiser-seat' },
      { kind: 'ghost', seatId: 'former-organiser' },
      { kind: 'presenter' },
      { kind: 'host', reveal: true },
    ] as const) {
      const app = createApp(async () => {}, {
        // Even a seat called organiser, or a separate player projection,
        // cannot substitute for a valid coordinator capability.
        resolveViewer: () => ({ kind: 'coordinator' }),
        resolveCoordinatorViewer: () => viewer,
      });
      const response = await request(app).get(
        '/api/games/not-authorised/coordinator/view',
      );
      expect(response.status, viewer.kind).toBe(401);
      expect(response.body).toEqual({ error: 'Authentication required' });
    }
  });

  it('fails closed on coordinator takeover routes without a seat or coordinator', async () => {
    const app = createApp(async () => {});
    await request(app)
      .get('/api/games/no-session/takeover')
      .expect(401, { error: 'Authentication required' });
    await request(app)
      .post('/api/games/no-session/takeover')
      .expect(401, { error: 'Authentication required' });
    await request(app)
      .post('/api/games/no-session/coordinator/presence')
      .expect(401, { error: 'Authentication required' });
    await request(app)
      .get('/api/games/no-session/coordinator/delegates')
      .expect(401, { error: 'Authentication required' });
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
      allowedOrigins: ['https://oathstone.stackstoneconsulting.co.uk'],
    });
    const allowed = await request(app)
      .get('/api/healthz')
      .set('Origin', 'https://oathstone.stackstoneconsulting.co.uk');
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://oathstone.stackstoneconsulting.co.uk',
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

  it('rate-limits rehearsal starts and rejects them before capacity is exceeded', async () => {
    const origin = 'https://oathstone.stackstoneconsulting.co.uk';
    const payload = {
      gameId: 'practice-game',
      idempotencyKey: 'practice-request',
      name: 'Morgan',
      playerCount: 6,
      speed: 'fast',
    };
    async function postWithCsrf(app: ReturnType<typeof createApp>) {
      const tokenResponse = await request(app).get('/api/csrf');
      const cookie = tokenResponse.headers['set-cookie']?.[0] ?? '';
      return request(app)
        .post('/api/rehearsals')
        .set('Origin', origin)
        .set('Cookie', cookie.split(';')[0]!)
        .set('X-CSRF-Token', tokenResponse.body.csrfToken)
        .send(payload);
    }

    const rateLimited = createApp(async () => {}, {
      allowedOrigins: [origin],
      rateLimitSecret: 'test-only-rehearsal-rate-limit',
      consumeRateLimit: async () => false,
    });
    const rateLimitedResponse = await postWithCsrf(rateLimited);
    expect(rateLimitedResponse.status).toBe(429);
    expect(rateLimitedResponse.body).toEqual({ error: 'Too many requests' });

    const atCapacity = createApp(async () => {}, {
      allowedOrigins: [origin],
      maxActiveGames: 10,
      countActiveGames: async () => 9,
    });
    const capacityResponse = await postWithCsrf(atCapacity);
    expect(capacityResponse.status).toBe(503);
    expect(capacityResponse.body).toEqual({
      error: 'Busy right now, try again in a few minutes',
    });
  });

  it('refuses real-game and rehearsal creation with a clear coming-soon message', async () => {
    const deploymentMode: DeploymentMode = {
      preLaunchNoindex: true,
      comingSoonMode: true,
    };
    const app = createApp(async () => {}, { deploymentMode });
    const closedMessage =
      'Game creation is closed while Oathstone is coming soon.';
    expect(
      (await request(app).get('/api/healthz')).headers['x-robots-tag'],
    ).toBe('noindex, nofollow');

    const game = await request(app)
      .post('/api/games')
      .send({
        type: 'CreateGame',
        id: 'coming-soon-game',
        idempotencyKey: 'coming-soon-game-request',
        config: gameConfigSchema.parse({}),
      });
    expect(game.status).toBe(503);
    expect(game.body).toEqual({ error: closedMessage });

    const rehearsal = await request(app).post('/api/rehearsals').send({
      gameId: 'coming-soon-practice',
      idempotencyKey: 'coming-soon-practice-request',
      name: 'Morgan',
      playerCount: 6,
      speed: 'fast',
    });
    expect(rehearsal.status).toBe(503);
    expect(rehearsal.body).toEqual({ error: closedMessage });
  });

  it('issues a host-only CSRF cookie and requires its token on browser mutations', async () => {
    const origin = 'https://oathstone.stackstoneconsulting.co.uk';
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
      .set('Cookie', `oathstone-csrf=${tokenResponse.body.csrfToken}`);
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
    await request(app)
      .post('/api/rehearsals')
      .set('Origin', origin)
      .set('Cookie', setCookie.split(';')[0]!)
      .set('X-CSRF-Token', tokenResponse.body.csrfToken)
      .send({})
      .expect(400, { error: 'Invalid request' });
  });

  it('requires a valid CSRF token on every game-scoped write route', async () => {
    const app = createApp(async () => {});
    const paths = [
      '/api/games/test-game/private-view',
      '/api/rehearsals',
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
        .set('Origin', 'https://oathstone.stackstoneconsulting.co.uk')
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
        .set('Origin', 'https://oathstone.stackstoneconsulting.co.uk')
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
    const origin = 'https://oathstone.stackstoneconsulting.co.uk';
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

  it('uses the approved per-command gameplay limit for private Traitor chat', async () => {
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
    expect(response.headers['retry-after']).toBe('60');
    expect(response.body).toEqual({ error: 'Too many requests' });
    expect(response.headers['x-test-rate-limit-diagnostic']).toBeUndefined();
    expect(limits).toEqual([60]);
  });

  it('exposes limiter diagnostics only when the test observer is enabled', async () => {
    const diagnostics: Array<Record<string, unknown>> = [];
    const app = createApp(async () => {}, {
      resolveViewer: () => ({ kind: 'player', seatId: 'seat-1' }),
      rateLimitSecret: 'unit-test-secret',
      testOnlyRateLimitDiagnostics: true,
      consumeRateLimit: async () => false,
      onRateLimitRejected: (diagnostic) => diagnostics.push(diagnostic),
    });
    const response = await request(app)
      .post('/api/games/game-id/commands')
      .send({
        type: 'PostTraitorMessage',
        expectedVersion: 1,
        idempotencyKey: 'chat-rate-limit-diagnostic',
        text: 'A private message',
      });

    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('60');
    expect(response.body).toEqual({ error: 'Too many requests' });
    expect(diagnostics).toHaveLength(1);
    const diagnostic = JSON.parse(
      response.headers['x-test-rate-limit-diagnostic'] as string,
    ) as Record<string, unknown>;
    expect(diagnostic).toEqual(diagnostics[0]);
    expect(diagnostic).toMatchObject({
      commandType: 'PostTraitorMessage',
      actorSeatId: 'seat-1',
      scope: 'command-PostTraitorMessage',
      bucketFingerprint: expect.stringMatching(/^[a-f0-9]{12}$/),
      subjectKind: 'actor',
      limit: 60,
    });
    expect(response.text).not.toContain('unit-test-secret');
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
