import { afterAll, expect, it, vi } from 'vitest';
import * as inviteStore from '../lib/db/src/seat-access-store';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { db, pool } from '@workspace/db';
import { io as socketIo, type Socket as ClientSocket } from 'socket.io-client';
import { gameConfigSchema, eventSchema } from '../lib/shared/src';
import { sql } from 'drizzle-orm';
import { createApp } from '../artifacts/api-server/src/app';
import { decide, evolve, replay, replayFrom } from '../lib/engine/src';
import { gameRandom } from '../lib/security/src/game-random';
import { attachRealtime } from '../artifacts/api-server/src/realtime';
import {
  cookieNameForGame,
  createCoordinatorViewerResolver,
  cookieNameForJoinRequest,
  createSeatViewerResolver,
} from '../artifacts/api-server/src/session-auth';
import { createDeadlineScheduler } from '../artifacts/api-server/src/deadline-scheduler';
import request from 'supertest';
import {
  appendGameEvents,
  createGameWithEvent,
  readGameEventsAfter,
  readGameCommandResult,
  readGameEvents,
  readLatestGameSnapshot,
  claimDueGameDeadlines,
  completeGameDeadline,
  releaseGameDeadline,
  countActiveGames,
} from '@workspace/db/game-store';
import {
  consumeRateLimit,
  pruneExpiredRateLimits,
} from '../lib/db/src/rate-limit';
import {
  createSeatAccess,
  createViewerSession,
  createGameInvite,
  createGameJoinRequest,
  findActiveGameInvite,
  findGameJoinRequestByToken,
  findViewerSession,
  listPendingGameJoinRequests,
  recordSeatPinFailure,
  resolveGameJoinRequest,
  revokeGameInvite,
  revokeSeatViewerSessions,
} from '../lib/db/src/seat-access-store';
import { findCoordinatorSession } from '../lib/db/src/coordinator-access-store';

type AppRequest = Parameters<
  NonNullable<NonNullable<Parameters<typeof createApp>[1]>['resolveViewer']>
>[0];

function requestGameId(request: AppRequest): string {
  const routeId = Array.isArray(request.params.id)
    ? request.params.id[0]
    : request.params.id;
  if (routeId) return routeId;
  return typeof request.body?.gameId === 'string' ? request.body.gameId : '';
}

function cookieValues(header: string | string[] | undefined): string[] {
  return Array.isArray(header) ? header : header ? [header] : [];
}

afterAll(async () => {
  await pool.end();
});

it('creates a game with a hashed, game-scoped coordinator capability cookie', async () => {
  const gameId = randomUUID();
  const resolveCoordinator = createCoordinatorViewerResolver({
    findSession: findCoordinatorSession,
  });
  const app = createApp(
    async () => {
      await db.execute(sql`select version from foundation_meta where id = 1`);
    },
    {
      secureCookies: true,
      resolveViewer: (request) =>
        resolveCoordinator({
          gameId: requestGameId(request),
          cookieHeader: request.headers.cookie,
        }),
      resolveCoordinatorViewer: (request) =>
        resolveCoordinator({
          gameId: requestGameId(request),
          cookieHeader: request.headers.cookie,
        }),
    },
  );
  try {
    const response = await request(app)
      .post('/api/games')
      .send({
        type: 'CreateGame',
        id: gameId,
        config: gameConfigSchema.parse({}),
        idempotencyKey: randomUUID(),
      });
    expect(response.status).toBe(201);
    expect(response.body.view.id).toBe(gameId);
    expect(response.body.view.private).toBeNull();
    expect(response.body.view.fairness).toBeNull();

    const coordinatorCookie = cookieValues(response.headers['set-cookie']).find(
      (cookie) => cookie.startsWith('turnstone-coordinator-'),
    );
    expect(coordinatorCookie).toBeDefined();
    expect(coordinatorCookie).toMatch(
      /^turnstone-coordinator-[a-f0-9]{24}=[A-Za-z0-9_-]{43}; /,
    );
    expect(coordinatorCookie).toContain('Path=/');
    expect(coordinatorCookie).toContain('Max-Age=');
    expect(coordinatorCookie).toContain('HttpOnly');
    expect(coordinatorCookie).toContain('Secure');
    expect(coordinatorCookie).toContain('SameSite=Lax');
    expect(coordinatorCookie).not.toContain('Domain=');
    const token = coordinatorCookie?.match(/=([A-Za-z0-9_-]{43});/)?.[1];
    expect(token).toBeDefined();
    expect(JSON.stringify(response.body)).not.toContain(token);

    const stored = await db.execute(sql`
      select token_hash from game_coordinator_capabilities
      where game_id = ${gameId}
    `);
    expect(stored.rows).toEqual([
      {
        token_hash: createHash('sha256').update(token!).digest('hex'),
      },
    ]);
    const view = await request(app)
      .get(`/api/games/${gameId}/view`)
      .set('Cookie', coordinatorCookie!.split(';')[0]!);
    expect(view.status).toBe(200);
    expect(view.body.view.id).toBe(gameId);
    expect(view.body.view.private).toBeNull();
    expect(view.body.view.fairness).toBeNull();
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('transfers coordinator capability once to an authenticated target seat', async () => {
  const gameId = randomUUID();
  const targetSeatId = randomUUID();
  const coordinatorResolver = createCoordinatorViewerResolver({
    findSession: findCoordinatorSession,
  });
  const seatResolver = createSeatViewerResolver({
    findSession: findViewerSession,
    findCoordinatorSession,
  });
  const resolveForRequest = (request: AppRequest) => {
    const gameId = requestGameId(request);
    return seatResolver({
      gameId,
      cookieHeader: request.headers.cookie,
    });
  };
  const app = createApp(
    async () => {
      await db.execute(sql`select version from foundation_meta where id = 1`);
    },
    {
      secureCookies: true,
      resolveViewer: resolveForRequest,
      resolveCoordinatorViewer: (request) =>
        coordinatorResolver({
          gameId: requestGameId(request),
          cookieHeader: request.headers.cookie,
        }),
    },
  );
  try {
    const created = await request(app)
      .post('/api/games')
      .send({
        type: 'CreateGame',
        id: gameId,
        config: gameConfigSchema.parse({}),
        idempotencyKey: randomUUID(),
      });
    const coordinatorCookie = cookieValues(created.headers['set-cookie']).find(
      (cookie) => cookie.startsWith('turnstone-coordinator-'),
    );
    expect(created.status).toBe(201);
    expect(coordinatorCookie).toBeDefined();

    const state = replay(await readGameEvents(gameId));
    const now = Date.now();
    const joinEvent = eventSchema.parse({
      seq: state.version + 1,
      at: now,
      schemaVersion: 1,
      type: 'SeatJoined',
      seatId: targetSeatId,
      name: 'Co-coordinator',
    });
    const nextState = evolve(state, joinEvent);
    const append = await appendGameEvents({
      gameId,
      actorId: 'test-coordinator-handoff',
      idempotencyKey: randomUUID(),
      requestHash: randomUUID(),
      expectedVersion: state.version,
      events: [joinEvent],
      snapshot: { seq: nextState.version, state: nextState },
      deadline: { kind: nextState.phase, dueAt: nextState.deadline },
    });
    expect(append.ok).toBe(true);
    const noAccessSeatId = randomUUID();
    const noAccessEvent = eventSchema.parse({
      seq: nextState.version + 1,
      at: now,
      schemaVersion: 1,
      type: 'SeatJoined',
      seatId: noAccessSeatId,
      name: 'Unpaired co-coordinator',
    });
    const afterNoAccessSeat = evolve(nextState, noAccessEvent);
    const appendNoAccessSeat = await appendGameEvents({
      gameId,
      actorId: 'test-coordinator-handoff',
      idempotencyKey: randomUUID(),
      requestHash: randomUUID(),
      expectedVersion: nextState.version,
      events: [noAccessEvent],
      snapshot: {
        seq: afterNoAccessSeat.version,
        state: afterNoAccessSeat,
      },
      deadline: {
        kind: afterNoAccessSeat.phase,
        dueAt: afterNoAccessSeat.deadline,
      },
    });
    expect(appendNoAccessSeat.ok).toBe(true);
    await createSeatAccess({
      gameId,
      seatId: targetSeatId,
      pinSalt: 'a'.repeat(32),
      pinHash: 'b'.repeat(64),
    });
    const seatToken = randomBytes(32).toString('base64url');
    await createViewerSession({
      tokenHash: createHash('sha256').update(seatToken).digest('hex'),
      gameId,
      seatId: targetSeatId,
      expiresAt: now + 60 * 60_000,
    });
    const seatCookieName = cookieNameForGame(gameId);
    const seatCookie = `${seatCookieName}=${seatToken}`;

    const coordinatorCsrf = await request(app).get('/api/csrf');
    const coordinatorCsrfCookie = cookieValues(
      coordinatorCsrf.headers['set-cookie'],
    ).find((cookie) => cookie.startsWith('turnstone-csrf='));
    const coordinatorCookiePair = coordinatorCookie!.split(';')[0]!;
    const coordinatorRequestCookie = `${coordinatorCookiePair}; ${coordinatorCsrfCookie!.split(';')[0]}`;
    await request(app)
      .post(`/api/games/${gameId}/seats/${noAccessSeatId}/pin/reset`)
      .set('Cookie', coordinatorRequestCookie)
      .set('X-CSRF-Token', coordinatorCsrf.body.csrfToken)
      .send({
        expectedVersion: afterNoAccessSeat.version,
        newPin: '8642',
      })
      .expect(503, { error: 'Service unavailable' });
    const missingSeatHandoff = await request(app)
      .post(`/api/games/${gameId}/coordinator-handoffs`)
      .set('Cookie', coordinatorRequestCookie)
      .set('X-CSRF-Token', coordinatorCsrf.body.csrfToken)
      .send({ targetSeatId: randomUUID() });
    expect(missingSeatHandoff.status).toBe(409);
    const unpairedSeatHandoff = await request(app)
      .post(`/api/games/${gameId}/coordinator-handoffs`)
      .set('Cookie', coordinatorRequestCookie)
      .set('X-CSRF-Token', coordinatorCsrf.body.csrfToken)
      .send({ targetSeatId: noAccessSeatId });
    expect(unpairedSeatHandoff.status).toBe(409);
    const handoff = await request(app)
      .post(`/api/games/${gameId}/coordinator-handoffs`)
      .set('Cookie', coordinatorRequestCookie)
      .set('X-CSRF-Token', coordinatorCsrf.body.csrfToken)
      .send({ targetSeatId });
    expect(handoff.status).toBe(201);
    const handoffCode = handoff.body.code as string;
    expect(handoffCode).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const recipientCsrf = await request(app)
      .get('/api/csrf')
      .set('Cookie', seatCookie);
    const recipientCsrfCookie = cookieValues(
      recipientCsrf.headers['set-cookie'],
    ).find((cookie) => cookie.startsWith('turnstone-csrf='));
    const recipientCookie = `${seatCookie}; ${recipientCsrfCookie!.split(';')[0]}`;
    const claim = await request(app)
      .post('/api/coordinator-handoffs/claim')
      .set('Cookie', recipientCookie)
      .set('X-CSRF-Token', recipientCsrf.body.csrfToken)
      .send({ gameId, code: handoffCode });
    expect(claim.status).toBe(200);
    const newCoordinatorCookie = cookieValues(claim.headers['set-cookie']).find(
      (cookie) => cookie.startsWith('turnstone-coordinator-'),
    );
    expect(newCoordinatorCookie).toBeDefined();
    expect(claim.body.code).toBeUndefined();

    const formerCoordinator = await request(app)
      .get(`/api/games/${gameId}/join-requests`)
      .set('Cookie', coordinatorCookiePair);
    const newCoordinator = await request(app)
      .get(`/api/games/${gameId}/join-requests`)
      .set('Cookie', newCoordinatorCookie!.split(';')[0]!);
    expect(formerCoordinator.status).toBe(401);
    expect(newCoordinator.status).toBe(200);

    const httpServer = createServer(app);
    const realtime = await attachRealtime(httpServer, {
      allowedOrigins: ['http://127.0.0.1'],
      resolveViewer: (headers, requestedGameId) =>
        requestedGameId
          ? seatResolver({
              gameId: requestedGameId,
              cookieHeader: headers.cookie,
            })
          : { kind: 'visitor' },
    });
    let socket: ClientSocket | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(0, '127.0.0.1', resolve);
      });
      const address = httpServer.address();
      if (!address || typeof address === 'string')
        throw new Error('Coordinator socket test did not bind a port');
      socket = socketIo(`http://127.0.0.1:${address.port}`, {
        transports: ['websocket'],
        extraHeaders: {
          origin: 'http://127.0.0.1',
          cookie: newCoordinatorCookie!.split(';')[0]!,
        },
        auth: { gameId },
        reconnection: false,
      });
      await new Promise<void>((resolve, reject) => {
        socket!.once('connect', resolve);
        socket!.once('connect_error', reject);
      });
      const firstView = new Promise<{
        version: number;
        view: { id: string; private: unknown; fairness: unknown };
      }>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Coordinator socket watch timed out')),
          2_000,
        );
        socket!.once('game:view', (view) => {
          clearTimeout(timeout);
          resolve(view);
        });
        socket!.emit(
          'game:watch',
          { gameId },
          (acknowledgement: { ok?: boolean; error?: string }) => {
            if (!acknowledgement.ok) {
              clearTimeout(timeout);
              reject(
                new Error(
                  acknowledgement.error ?? 'Coordinator watch was rejected',
                ),
              );
            }
          },
        );
      });
      await expect(firstView).resolves.toMatchObject({
        view: { id: gameId, private: null, fairness: null },
      });
      const invalidWatch = await new Promise<unknown>((resolve) => {
        socket!.emit('game:watch', { gameId: [] }, resolve);
      });
      expect(invalidWatch).toEqual({ error: 'Invalid request' });
      const wrongGameWatch = await new Promise<unknown>((resolve) => {
        socket!.emit('game:watch', { gameId: 'another-game' }, resolve);
      });
      expect(wrongGameWatch).toEqual({ error: 'Not found' });
      await realtime.publishGame(gameId);
      expect(socket.connected).toBe(true);

      const unauthenticatedSocket = socketIo(
        `http://127.0.0.1:${address.port}`,
        {
          transports: ['websocket'],
          extraHeaders: { origin: 'http://127.0.0.1' },
          auth: { gameId },
          reconnection: false,
        },
      );
      try {
        await new Promise<void>((resolve, reject) => {
          unauthenticatedSocket.once('connect_error', () => resolve());
          unauthenticatedSocket.once('connect', () =>
            reject(new Error('Visitor socket unexpectedly authenticated')),
          );
        });
        expect(unauthenticatedSocket.connected).toBe(false);
      } finally {
        unauthenticatedSocket.disconnect();
      }
    } finally {
      socket?.disconnect();
      await realtime.close();
      if (httpServer.listening) {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      }
    }

    const replayedClaim = await request(app)
      .post('/api/coordinator-handoffs/claim')
      .set('Cookie', recipientCookie)
      .set('X-CSRF-Token', recipientCsrf.body.csrfToken)
      .send({ gameId, code: handoffCode });
    expect(replayedClaim.status).toBe(401);
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('rejects malformed, unauthorised, rate-limited and failing coordinator handoffs', async () => {
  const visitor = createApp(async () => {});
  const createUrl = '/api/games/test-game/coordinator-handoffs';
  await request(visitor)
    .post(createUrl)
    .set('Origin', 'https://turnstone.example')
    .send({ targetSeatId: randomUUID() })
    .expect(403, { error: 'Invalid request' });
  await request(visitor)
    .post(createUrl)
    .send({})
    .expect(400, { error: 'Invalid request' });
  await request(visitor)
    .post(createUrl)
    .send({ targetSeatId: randomUUID() })
    .expect(401, { error: 'Authentication required' });

  const resetUrl = `/api/games/test-game/seats/${randomUUID()}/pin/reset`;
  await request(visitor)
    .post(resetUrl)
    .set('Origin', 'https://turnstone.example')
    .send({ expectedVersion: 0, newPin: '8642' })
    .expect(403, { error: 'Invalid request' });
  await request(visitor)
    .post(resetUrl)
    .send({})
    .expect(400, { error: 'Invalid request' });
  await request(visitor)
    .post(resetUrl)
    .send({ expectedVersion: 0, newPin: '8642' })
    .expect(401, { error: 'Authentication required' });

  const rateLimited = createApp(async () => {}, {
    resolveCoordinatorViewer: () => ({ kind: 'coordinator' }),
    rateLimitSecret: 'integration-test-rate-limit-secret',
    consumeRateLimit: async () => false,
  });
  await request(rateLimited)
    .post(createUrl)
    .send({ targetSeatId: randomUUID() })
    .expect(429, { error: 'Too many requests' });
  await request(rateLimited)
    .post(resetUrl)
    .send({ expectedVersion: 0, newPin: '8642' })
    .expect(429, { error: 'Too many requests' });

  const failingResolver = createApp(async () => {}, {
    resolveCoordinatorViewer: async () => {
      throw new Error('private resolver detail');
    },
    resolveViewer: async () => {
      throw new Error('private resolver detail');
    },
  });
  await request(failingResolver)
    .post(createUrl)
    .send({ targetSeatId: randomUUID() })
    .expect(503, { error: 'Service unavailable' });
  await request(visitor)
    .post('/api/coordinator-handoffs/claim')
    .set('Origin', 'https://turnstone.example')
    .send({
      gameId: randomUUID(),
      code: randomBytes(32).toString('base64url'),
    })
    .expect(403, { error: 'Invalid request' });
  await request(visitor)
    .post('/api/coordinator-handoffs/claim')
    .send({})
    .expect(400, { error: 'Invalid request' });
  await request(visitor)
    .post('/api/coordinator-handoffs/claim')
    .send({ gameId: randomUUID(), code: randomBytes(32).toString('base64url') })
    .expect(401, { error: 'Transfer could not be completed' });
  await request(failingResolver)
    .post('/api/coordinator-handoffs/claim')
    .send({ gameId: randomUUID(), code: randomBytes(32).toString('base64url') })
    .expect(503, { error: 'Service unavailable' });

  const rateLimitedClaim = createApp(async () => {}, {
    resolveViewer: () => ({ kind: 'player', seatId: 'seat-1' }),
    rateLimitSecret: 'integration-test-rate-limit-secret',
    consumeRateLimit: async () => false,
  });
  await request(rateLimitedClaim)
    .post('/api/coordinator-handoffs/claim')
    .send({ gameId: randomUUID(), code: randomBytes(32).toString('base64url') })
    .expect(429, { error: 'Too many requests' });
  const unownedGameClaim = createApp(async () => {}, {
    resolveViewer: () => ({ kind: 'player', seatId: 'seat-1' }),
  });
  await request(unownedGameClaim)
    .post('/api/coordinator-handoffs/claim')
    .send({ gameId: randomUUID(), code: randomBytes(32).toString('base64url') })
    .expect(401, { error: 'Transfer could not be completed' });
  const coordinatorWithoutRateLimit = createApp(async () => {}, {
    resolveCoordinatorViewer: () => ({ kind: 'coordinator' }),
  });
  await request(coordinatorWithoutRateLimit)
    .post(resetUrl)
    .send({ expectedVersion: 0, newPin: '8642' })
    .expect(404, { error: 'Not found' });
});

it('uses real PostgreSQL with the committed foundation migration', async () => {
  const result = await db.execute(
    sql`select version from foundation_meta where id = 1`,
  );
  expect(result.rows).toEqual([{ version: 1 }]);
  const app = createApp(async () => {
    await db.execute(sql`select version from foundation_meta where id = 1`);
  });
  expect((await request(app).get('/api/readyz')).status).toBe(200);
});

it('enforces rate limits atomically across concurrent database clients', async () => {
  const key = createHash('sha256').update(randomUUID()).digest('hex');
  const results = await Promise.all(
    Array.from({ length: 8 }, () => consumeRateLimit(key, 3, 60_000, 100_000)),
  );
  expect(results.filter(Boolean)).toHaveLength(3);
  expect(results.filter((allowed) => !allowed)).toHaveLength(5);
  expect(await consumeRateLimit(key, 3, 60_000, 160_001)).toBe(true);
  await pruneExpiredRateLimits(160_002);
  expect(await consumeRateLimit(key, 3, 60_000, 160_003)).toBe(true);
});

it('stops counting a game for admission after its finish event commits', async () => {
  const gameId = randomUUID();
  const before = await countActiveGames();
  const created = eventSchema.parse({
    seq: 1,
    at: 1_800_000_000_000,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });
  try {
    await createGameWithEvent({
      event: created,
      actorId: 'coordinator:test',
      idempotencyKey: 'capacity-create',
      requestHash: 'capacity-create',
    });
    expect(await countActiveGames()).toBe(before + 1);
    const finished = eventSchema.parse({
      seq: 2,
      at: 1_800_000_000_001,
      schemaVersion: 1,
      type: 'GameFinished',
      winner: 'faithful',
      reason: 'test completed',
    });
    await appendGameEvents({
      gameId,
      expectedVersion: 1,
      actorId: 'coordinator:test',
      idempotencyKey: 'capacity-finish',
      requestHash: 'capacity-finish',
      events: [finished],
    });
    expect(await countActiveGames()).toBe(before);
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('has the committed durable game, event, snapshot, idempotency, deadline and rate-limit tables', async () => {
  const result = await db.execute(sql`
    select
      to_regclass('public.games')::text as games,
      to_regclass('public.game_events')::text as game_events,
      to_regclass('public.game_snapshots')::text as game_snapshots,
      to_regclass('public.game_idempotency')::text as game_idempotency,
      to_regclass('public.game_deadlines')::text as game_deadlines,
      to_regclass('public.api_rate_limits')::text as api_rate_limits,
      to_regclass('public.game_seat_access')::text as game_seat_access,
      to_regclass('public.game_viewer_sessions')::text as game_viewer_sessions,
      to_regclass('public.game_invites')::text as game_invites,
      to_regclass('public.game_join_requests')::text as game_join_requests
  `);

  expect(result.rows[0]).toEqual({
    games: 'games',
    game_events: 'game_events',
    game_snapshots: 'game_snapshots',
    game_idempotency: 'game_idempotency',
    game_deadlines: 'game_deadlines',
    api_rate_limits: 'api_rate_limits',
    game_seat_access: 'game_seat_access',
    game_viewer_sessions: 'game_viewer_sessions',
    game_invites: 'game_invites',
    game_join_requests: 'game_join_requests',
  });
});

it('persists only hashed seat credentials and locks PIN attempts atomically', async () => {
  const gameId = randomUUID();
  const seatId = randomUUID();
  const tokenHash = createHash('sha256')
    .update('test-only-opaque-session')
    .digest('hex');
  const now = 100_000;
  const createdEvent = eventSchema.parse({
    seq: 1,
    at: now,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });

  try {
    await createGameWithEvent({
      event: createdEvent,
      actorId: 'coordinator:test',
      idempotencyKey: 'seat-access-create',
      requestHash: 'seat-access-create',
    });
    await createSeatAccess({
      gameId,
      seatId,
      pinSalt: 'a'.repeat(32),
      pinHash: 'b'.repeat(64),
    });
    await createViewerSession({
      tokenHash,
      gameId,
      seatId,
      expiresAt: now + 60_000,
    });

    expect(await findViewerSession(tokenHash, gameId)).toEqual({
      gameId,
      seatId,
      expiresAt: now + 60_000,
      revokedAt: null,
    });

    for (let attempt = 1; attempt <= 4; attempt++) {
      expect(await recordSeatPinFailure(gameId, seatId, now)).toEqual({
        failedPinAttempts: attempt,
        lockedUntil: null,
      });
    }
    expect(await recordSeatPinFailure(gameId, seatId, now)).toEqual({
      failedPinAttempts: 5,
      lockedUntil: now + 15 * 60_000,
    });
    expect(await recordSeatPinFailure(gameId, seatId, now)).toEqual({
      failedPinAttempts: 5,
      lockedUntil: now + 15 * 60_000,
    });

    await revokeSeatViewerSessions(gameId, seatId, now + 1);
    expect(await findViewerSession(tokenHash, gameId)).toEqual({
      gameId,
      seatId,
      expiresAt: now + 60_000,
      revokedAt: now + 1,
    });
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('stores hashed invite lookup credentials, clears the readable code on revoke, and exposes pending join requests', async () => {
  const gameId = randomUUID();
  const seatId = randomUUID();
  const requestId = randomUUID();
  const linkTokenHash = '1'.repeat(64);
  const shortCodeHash = '2'.repeat(64);
  const requestTokenHash = '3'.repeat(64);
  const now = 100_000;
  const createdEvent = eventSchema.parse({
    seq: 1,
    at: now,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });

  try {
    await createGameWithEvent({
      event: createdEvent,
      actorId: 'coordinator:test',
      idempotencyKey: 'invite-store-create',
      requestHash: 'invite-store-create',
    });
    const inviteInput = {
      gameId,
      linkTokenHash,
      shortCodeHash,
      displayCode: 'ABC234',
      expiresAt: now + 60_000,
    };
    await createGameInvite(inviteInput);
    const storedCode = await pool.query<{ display_code: string | null }>(
      'select display_code from game_invites where game_id = $1',
      [gameId],
    );
    expect(storedCode.rows[0]?.display_code).toBe('ABC234');
    expect(await findActiveGameInvite({ gameId, linkTokenHash }, now)).toEqual({
      gameId,
    });
    expect(
      await findActiveGameInvite(
        { gameId, linkTokenHash: '4'.repeat(64) },
        now,
      ),
    ).toBeNull();
    expect(await findActiveGameInvite({ shortCodeHash }, now)).toEqual({
      gameId,
    });

    await createSeatAccess({
      gameId,
      seatId,
      pinSalt: 'a'.repeat(32),
      pinHash: 'b'.repeat(64),
    });
    await createGameJoinRequest({
      id: requestId,
      gameId,
      seatId,
      requestTokenHash,
      name: 'Guest player',
      expiresAt: now + 60_000,
    });
    expect(await findGameJoinRequestByToken(requestTokenHash, now)).toEqual({
      id: requestId,
      gameId,
      seatId,
      name: 'Guest player',
      status: 'pending',
    });
    expect(await listPendingGameJoinRequests(gameId, now)).toEqual([
      {
        id: requestId,
        seatId,
        name: 'Guest player',
        createdAt: expect.any(Number),
      },
    ]);
    expect(
      await resolveGameJoinRequest(gameId, requestId, 'approved', now + 1),
    ).toBe(true);
    expect(
      await findGameJoinRequestByToken(requestTokenHash, now + 2),
    ).toMatchObject({
      status: 'approved',
    });
    expect(
      await resolveGameJoinRequest(gameId, requestId, 'rejected', now + 3),
    ).toBe(false);
    await revokeGameInvite(gameId, now + 4);
    const revokedCode = await pool.query<{ display_code: string | null }>(
      'select display_code from game_invites where game_id = $1',
      [gameId],
    );
    expect(revokedCode.rows[0]?.display_code).toBeNull();
    expect(
      await findActiveGameInvite({ gameId, linkTokenHash }, now + 5),
    ).toBeNull();
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('clears readable invite codes when the lobby closes or a game ends', async () => {
  const scenarios = [
    { command: 'StartGame' as const, code: 'ABC234' },
    { command: 'EndGameEarly' as const, code: 'DEF567' },
  ];

  for (const [scenarioIndex, scenario] of scenarios.entries()) {
    const gameId = randomUUID();
    const now = Date.now();
    const createdEvent = eventSchema.parse({
      seq: 1,
      at: now,
      schemaVersion: 1,
      type: 'GameCreated',
      id: gameId,
      config: gameConfigSchema.parse({}),
    });

    try {
      await createGameWithEvent({
        event: createdEvent,
        actorId: 'coordinator:test',
        idempotencyKey: `invite-close-create-${scenarioIndex}`,
        requestHash: `invite-close-create-${scenarioIndex}`,
      });
      const lobbyEvents = [
        eventSchema.parse({
          seq: 2,
          at: now + 1,
          schemaVersion: 1,
          type: 'PhaseChanged',
          phase: 'LOBBY',
          deadline: null,
          shadowEndAt: null,
          cycle: 0,
        }),
        ...Array.from({ length: 5 }, (_, index) =>
          eventSchema.parse({
            seq: index + 3,
            at: now + index + 2,
            schemaVersion: 1,
            type: 'SeatJoined',
            seatId: `invite-close-seat-${scenarioIndex}-${index}`,
            name: `Player ${index + 1}`,
          }),
        ),
      ];
      await appendGameEvents({
        gameId,
        expectedVersion: 1,
        actorId: 'coordinator:test',
        idempotencyKey: `invite-close-lobby-${scenarioIndex}`,
        requestHash: `invite-close-lobby-${scenarioIndex}`,
        events: lobbyEvents,
      });
      await createGameInvite({
        gameId,
        linkTokenHash: String(scenarioIndex + 1).repeat(64),
        shortCodeHash: String(scenarioIndex + 3).repeat(64),
        displayCode: scenario.code,
        expiresAt: now + 60_000,
      });

      const publishedCodes: (string | null)[] = [];
      const app = createApp(async () => {}, {
        publishGame: async (publishedGameId) => {
          const stored = await pool.query<{ display_code: string | null }>(
            'select display_code from game_invites where game_id = $1',
            [publishedGameId],
          );
          publishedCodes.push(stored.rows[0]?.display_code ?? null);
        },
        resolveViewer: () => ({ kind: 'coordinator' }),
        resolveCoordinatorViewer: () => ({ kind: 'coordinator' }),
        rateLimitSecret: 'integration-test-rate-limit-secret',
        publicBaseUrl: 'https://turnstone.test',
        secureCookies: false,
      });
      const response = await request(app)
        .post(`/api/games/${gameId}/commands`)
        .send({
          type: scenario.command,
          expectedVersion: 7,
          idempotencyKey: `invite-close-action-${scenarioIndex}`,
        })
        .expect(200);
      expect(response.body.view.phase).toBe(
        scenario.command === 'StartGame' ? 'DEAL' : 'FINISHED',
      );

      const storedCode = await pool.query<{ display_code: string | null }>(
        'select display_code from game_invites where game_id = $1',
        [gameId],
      );
      expect(storedCode.rows[0]?.display_code).toBeNull();
      expect(publishedCodes).toEqual([null]);
      const revokeSpy = vi.spyOn(inviteStore, 'revokeGameInvite');
      try {
        for (let read = 0; read < 3; read += 1) {
          await request(app).get(`/api/games/${gameId}/view`).expect(200);
        }
        expect(revokeSpy).not.toHaveBeenCalled();
      } finally {
        revokeSpy.mockRestore();
      }
    } finally {
      await db.execute(sql`delete from games where id = ${gameId}`);
    }
  }
});

it('appends versioned events transactionally and deduplicates idempotent retries', async () => {
  const gameId = randomUUID();
  const config = gameConfigSchema.parse({});
  const createdEvent = eventSchema.parse({
    seq: 1,
    at: 1_800_000_000_000,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config,
  });

  try {
    const created = await createGameWithEvent({
      event: createdEvent,
      actorId: 'coordinator:test',
      idempotencyKey: 'create-once',
      requestHash: 'create-request',
    });
    expect(created).toEqual({ ok: true, version: 1, duplicate: false });

    const retriedCreate = await createGameWithEvent({
      event: createdEvent,
      actorId: 'coordinator:test',
      idempotencyKey: 'create-once',
      requestHash: 'create-request',
    });
    expect(retriedCreate).toEqual({ ok: true, version: 1, duplicate: true });

    const joinedEvent = eventSchema.parse({
      seq: 2,
      at: 1_800_000_000_001,
      schemaVersion: 1,
      type: 'SeatJoined',
      seatId: 'seat-1',
      name: 'A player',
    });
    const appended = await appendGameEvents({
      gameId,
      expectedVersion: 1,
      actorId: 'coordinator:test',
      idempotencyKey: 'join-once',
      requestHash: 'join-request',
      events: [joinedEvent],
    });
    expect(appended).toEqual({ ok: true, version: 2, duplicate: false });

    const retriedAppend = await appendGameEvents({
      gameId,
      expectedVersion: 1,
      actorId: 'coordinator:test',
      idempotencyKey: 'join-once',
      requestHash: 'join-request',
      events: [joinedEvent],
    });
    expect(retriedAppend).toEqual({ ok: true, version: 2, duplicate: true });
    expect(
      await readGameCommandResult({
        gameId,
        actorId: 'coordinator:test',
        idempotencyKey: 'join-once',
        requestHash: 'join-request',
      }),
    ).toEqual({ ok: true, version: 2, duplicate: true });

    const reusedKey = await appendGameEvents({
      gameId,
      expectedVersion: 2,
      actorId: 'coordinator:test',
      idempotencyKey: 'join-once',
      requestHash: 'different-request',
      events: [joinedEvent],
    });
    expect(reusedKey).toEqual({ ok: false, code: 'IDEMPOTENCY_CONFLICT' });

    const stale = await appendGameEvents({
      gameId,
      expectedVersion: 1,
      actorId: 'coordinator:test',
      idempotencyKey: 'stale-command',
      requestHash: 'stale-request',
      events: [joinedEvent],
    });
    expect(stale).toEqual({
      ok: false,
      code: 'VERSION_CONFLICT',
      currentVersion: 2,
    });

    const count = await db.execute(
      sql`select count(*)::int as count from game_events where game_id = ${gameId}`,
    );
    expect(count.rows[0]?.count).toBe(2);
    expect(await readGameEvents(gameId)).toEqual([createdEvent, joinedEvent]);
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('persists snapshots atomically and replays only the event tail after a snapshot', async () => {
  const gameId = randomUUID();
  const createdEvent = eventSchema.parse({
    seq: 1,
    at: 1_800_000_000_000,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });
  const initialState = replay([createdEvent]);
  const phaseEvent = eventSchema.parse({
    seq: 2,
    at: 1_800_000_000_001,
    schemaVersion: 1,
    type: 'PhaseChanged',
    phase: 'LOBBY',
    deadline: null,
    shadowEndAt: null,
    cycle: 0,
  });
  const lobbyState = evolve(initialState, phaseEvent);

  try {
    await createGameWithEvent({
      event: createdEvent,
      actorId: 'coordinator:test',
      idempotencyKey: 'create-with-snapshot',
      requestHash: 'snapshot-create',
      snapshot: { seq: 1, state: initialState },
    });
    await appendGameEvents({
      gameId,
      expectedVersion: 1,
      actorId: 'coordinator:test',
      idempotencyKey: 'advance-with-snapshot',
      requestHash: 'snapshot-advance',
      events: [phaseEvent],
      snapshot: { seq: 2, state: lobbyState },
    });

    expect(await readLatestGameSnapshot(gameId)).toEqual({
      seq: 2,
      state: lobbyState,
    });
    expect(await readGameEventsAfter(gameId, 1)).toEqual([phaseEvent]);
    expect(replayFrom(initialState, [phaseEvent])).toEqual(lobbyState);
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('claims due database deadlines once, reclaims expired work, and completes it durably', async () => {
  const gameId = randomUUID();
  // Keep test deadlines ahead of the live managed scheduler's wall clock.
  const now = Date.now() + 24 * 60 * 60 * 1_000;
  const createdEvent = eventSchema.parse({
    seq: 1,
    at: now - 2_000,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });
  const phaseEvent = eventSchema.parse({
    seq: 2,
    at: now - 1_000,
    schemaVersion: 1,
    type: 'PhaseChanged',
    phase: 'LOBBY',
    deadline: now - 500,
    shadowEndAt: null,
    cycle: 0,
  });

  try {
    await createGameWithEvent({
      event: createdEvent,
      actorId: 'coordinator:test',
      idempotencyKey: 'deadline-create',
      requestHash: 'deadline-create',
    });
    await appendGameEvents({
      gameId,
      expectedVersion: 1,
      actorId: 'coordinator:test',
      idempotencyKey: 'deadline-phase',
      requestHash: 'deadline-phase',
      events: [phaseEvent],
      deadline: { kind: 'LOBBY', dueAt: now - 500 },
    });

    const [firstBatch, concurrentBatch] = await Promise.all([
      claimDueGameDeadlines({ now, limit: 10, leaseMs: 30_000 }),
      claimDueGameDeadlines({ now, limit: 10, leaseMs: 30_000 }),
    ]);
    const claims = [...firstBatch, ...concurrentBatch];
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({
      gameId,
      kind: 'LOBBY',
      version: 2,
      attempts: 1,
    });
    expect(
      await claimDueGameDeadlines({ now, limit: 10, leaseMs: 30_000 }),
    ).toHaveLength(0);

    await releaseGameDeadline(claims[0]!.id, claims[0]!.claimToken);
    const reclaimed = await claimDueGameDeadlines({
      now,
      limit: 10,
      leaseMs: 30_000,
    });
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]?.attempts).toBe(2);
    await completeGameDeadline(reclaimed[0]!.id, reclaimed[0]!.claimToken);
    expect(
      await claimDueGameDeadlines({ now, limit: 10, leaseMs: 30_000 }),
    ).toHaveLength(0);
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('advances an overdue phase from PostgreSQL and remains correct across repeated polls', async () => {
  const gameId = randomUUID();
  const now = Date.now() + 60 * 24 * 60 * 60_000;
  const createdEvent = eventSchema.parse({
    seq: 1,
    at: now - 2_000,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });
  const dueEvent = eventSchema.parse({
    seq: 2,
    at: now - 1_000,
    schemaVersion: 1,
    type: 'PhaseChanged',
    phase: 'DRAFT',
    deadline: now - 1,
    shadowEndAt: null,
    cycle: 0,
  });

  try {
    await createGameWithEvent({
      event: createdEvent,
      actorId: 'coordinator:test',
      idempotencyKey: 'scheduler-create',
      requestHash: 'scheduler-create',
    });
    await appendGameEvents({
      gameId,
      expectedVersion: 1,
      actorId: 'coordinator:test',
      idempotencyKey: 'scheduler-set-draft-deadline',
      requestHash: 'scheduler-set-draft-deadline',
      events: [dueEvent],
      deadline: { kind: 'DRAFT', dueAt: now - 1 },
    });
    const scheduler = createDeadlineScheduler({ now: () => now });

    await scheduler.runOnce();
    expect((await readGameEvents(gameId)).map((event) => event.type)).toEqual([
      'GameCreated',
      'PhaseChanged',
      'PhaseChanged',
    ]);
    expect(replay(await readGameEvents(gameId)).phase).toBe('LOBBY');
    await scheduler.runOnce();
    expect(await readGameEvents(gameId)).toHaveLength(3);
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('starts and stops the durable deadline poller idempotently', async () => {
  const errors: string[] = [];
  const scheduler = createDeadlineScheduler({
    intervalMs: 5,
    onError: () => errors.push('poll failed'),
  });
  scheduler.start();
  scheduler.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await scheduler.stop();
  await scheduler.stop();
  expect(errors).toEqual([]);
});

it('keeps paused deadlines dormant and resumes them correctly after a worker restart', async () => {
  const gameId = randomUUID();
  const initialTime = Date.UTC(2030, 0, 1);
  const createdEvent = eventSchema.parse({
    seq: 1,
    at: initialTime,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });
  const phaseEvent = eventSchema.parse({
    seq: 2,
    at: initialTime + 250,
    schemaVersion: 1,
    type: 'PhaseChanged',
    phase: 'DRAFT',
    deadline: initialTime + 1_500,
    shadowEndAt: null,
    cycle: 0,
  });
  try {
    await createGameWithEvent({
      event: createdEvent,
      actorId: 'coordinator:test',
      idempotencyKey: 'paused-scheduler-create',
      requestHash: 'paused-scheduler-create',
    });
    await appendGameEvents({
      gameId,
      expectedVersion: 1,
      actorId: 'coordinator:test',
      idempotencyKey: 'paused-scheduler-deadline',
      requestHash: 'paused-scheduler-deadline',
      events: [phaseEvent],
      deadline: { kind: 'DRAFT', dueAt: initialTime + 1_500 },
    });

    const beforePause = replay(await readGameEvents(gameId));
    const paused = decide(
      beforePause,
      {
        type: 'Pause',
        expectedVersion: beforePause.version,
        idempotencyKey: 'paused-scheduler-pause',
      },
      {
        now: initialTime + 1_000,
        actor: { kind: 'coordinator' },
        random: gameRandom,
      },
    );
    expect(paused.ok).toBe(true);
    if (!paused.ok) throw new Error('Expected pause to succeed');
    await appendGameEvents({
      gameId,
      expectedVersion: beforePause.version,
      actorId: 'coordinator:test',
      idempotencyKey: 'paused-scheduler-pause',
      requestHash: 'paused-scheduler-pause',
      events: paused.events,
      deadline: { kind: 'DRAFT', dueAt: null },
    });

    await createDeadlineScheduler({
      now: () => initialTime + 2_000,
    }).runOnce();
    expect(replay(await readGameEvents(gameId)).paused).toBe(true);

    const pausedState = replay(await readGameEvents(gameId));
    const resumed = decide(
      pausedState,
      {
        type: 'Resume',
        expectedVersion: pausedState.version,
        idempotencyKey: 'paused-scheduler-resume',
      },
      {
        now: initialTime + 2_000,
        actor: { kind: 'coordinator' },
        random: gameRandom,
      },
    );
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) throw new Error('Expected resume to succeed');
    const resumedState = replayFrom(pausedState, resumed.events);
    await appendGameEvents({
      gameId,
      expectedVersion: pausedState.version,
      actorId: 'coordinator:test',
      idempotencyKey: 'paused-scheduler-resume',
      requestHash: 'paused-scheduler-resume',
      events: resumed.events,
      deadline: { kind: resumedState.phase, dueAt: resumedState.deadline },
    });

    await createDeadlineScheduler({
      now: () => initialTime + 2_499,
    }).runOnce();
    expect(replay(await readGameEvents(gameId)).phase).toBe('DRAFT');
    await createDeadlineScheduler({
      now: () => initialTime + 2_500,
    }).runOnce();
    expect(replay(await readGameEvents(gameId)).phase).toBe('LOBBY');
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('returns only the allow-listed visitor projection from the HTTP game endpoint', async () => {
  const gameId = randomUUID();
  const event = eventSchema.parse({
    seq: 1,
    at: 1_800_000_000_000,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });
  await createGameWithEvent({
    event,
    actorId: 'coordinator:test',
    idempotencyKey: 'create-visitor-view',
    requestHash: 'visitor-view-request',
  });

  try {
    const response = await request(createApp(async () => {})).get(
      `/api/games/${gameId}/view`,
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      version: 1,
      view: {
        exists: true,
        phase: 'DRAFT',
        lobbyOpen: false,
        seatCount: 0,
      },
    });
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('runs a server-backed rehearsal to completion with held reveals and zero presenter connections', async () => {
  const gameId = randomUUID();
  // Keep test deadlines ahead of the live managed scheduler's wall clock.
  let now = Date.now() + 24 * 60 * 60 * 1_000;
  const { createRehearsalBotRunner } =
    await import('../artifacts/api-server/src/rehearsal-bots');
  const botRunner = createRehearsalBotRunner();
  const seatResolver = createSeatViewerResolver({
    findSession: findViewerSession,
  });
  const app = createApp(async () => {}, {
    secureCookies: true,
    testOnlyNow: () => now,
    processRehearsalGame: (id) => botRunner.processGame(id),
    resolveViewer: (request) =>
      seatResolver({
        gameId: requestGameId(request),
        cookieHeader: request.headers.cookie,
      }),
  });

  try {
    const created = await request(app).post('/api/rehearsals').send({
      gameId,
      idempotencyKey: randomUUID(),
      name: 'Morgan',
      playerCount: 6,
      speed: 'fast',
    });
    expect(created.status).toBe(201);
    expect(created.body.view.id).toBe(gameId);
    expect(created.body.view.phase).toBe('DEAL');
    expect(created.body.view.seats).toHaveLength(6);
    expect(created.body.view.private).toBeNull();
    expect(created.body.view.canAdvancePhase).toBe(true);
    expect(created.body.view.progress.done).toBe(5);
    const { listActiveRehearsalGameIds } =
      await import('@workspace/db/game-store');
    expect(await listActiveRehearsalGameIds()).toContain(gameId);
    const recoveredGames: string[] = [];
    const { createDeadlineScheduler } =
      await import('../artifacts/api-server/src/deadline-scheduler');
    const scheduler = createDeadlineScheduler({
      now: () => now,
      processRehearsalGame: async (id) => {
        recoveredGames.push(id);
        await botRunner.processGame(id);
      },
    });
    const rehearsalErrors: string[] = [];
    await createDeadlineScheduler({
      now: () => now,
      processRehearsalGame: async () => {
        throw new Error('test-only rehearsal processor failure');
      },
      onError: () => rehearsalErrors.push('reported'),
    }).runOnce();
    expect(rehearsalErrors.length).toBeGreaterThan(0);
    await scheduler.runOnce();
    expect(recoveredGames).toContain(gameId);

    const seatCookie = cookieValues(created.headers['set-cookie']).find(
      (cookie) => cookie.startsWith('turnstone-seat-'),
    );
    expect(seatCookie).toContain('HttpOnly');
    expect(seatCookie).toContain('Secure');
    expect(seatCookie).toContain('SameSite=Lax');
    expect(seatCookie).not.toContain('Domain=');

    const cookie = seatCookie!.split(';')[0]!;
    const ordinaryView = await request(app)
      .get(`/api/games/${gameId}/view`)
      .set('Cookie', cookie);
    expect(ordinaryView.status).toBe(200);
    expect(ordinaryView.body.view.private).toBeNull();

    const csrf = await request(app).get('/api/csrf');
    const csrfToken = csrf.body.csrfToken as string;
    const shieldedCookie = `${cookie}; turnstone-csrf=${csrfToken}`;
    const prematureReveal = await request(app)
      .post(`/api/games/${gameId}/private-view`)
      .set('Cookie', shieldedCookie)
      .set('X-CSRF-Token', csrfToken);
    expect(prematureReveal.status).toBe(409);
    expect(prematureReveal.body).toEqual({
      error: 'Private view unavailable',
    });

    const acknowledgement = await request(app)
      .post(`/api/games/${gameId}/commands`)
      .set('Cookie', shieldedCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        type: 'AcknowledgePrivate',
        idempotencyKey: randomUUID(),
      });
    expect(acknowledgement.status).toBe(200);
    const revealed = await request(app)
      .post(`/api/games/${gameId}/private-view`)
      .set('Cookie', shieldedCookie)
      .set('X-CSRF-Token', csrfToken);
    expect(revealed.status).toBe(200);
    expect(['traitor', 'faithful']).toContain(revealed.body.view.private.role);
    expect(JSON.stringify(ordinaryView.body)).not.toContain(
      revealed.body.view.private.role,
    );

    now += 6_000;
    const movedOn = await request(app)
      .post(`/api/games/${gameId}/commands`)
      .set('Cookie', shieldedCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        type: 'AdvancePhase',
        expectedVersion: acknowledgement.body.version,
        idempotencyKey: randomUUID(),
      });
    expect(movedOn.status).toBe(200);
    expect(movedOn.body.view.phase).toBe('DEBATE');
    expect(movedOn.body.view.canAdvancePhase).toBe(true);
    const rehearsalCannotPause = await request(app)
      .post(`/api/games/${gameId}/commands`)
      .set('Cookie', shieldedCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        type: 'Pause',
        expectedVersion: movedOn.body.version,
        idempotencyKey: randomUUID(),
      });
    expect(rehearsalCannotPause.status).toBe(409);
    const afterRejectedPause = await request(app)
      .get(`/api/games/${gameId}/view`)
      .set('Cookie', cookie);
    expect(afterRejectedPause.body.view.paused).toBe(false);

    const visitor = await request(app).post(
      `/api/games/${gameId}/private-view`,
    );
    expect(visitor.status).toBe(401);
    expect(visitor.body).toEqual({ error: 'Authentication required' });

    const { readGameEvents } = await import('@workspace/db/game-store');
    const { replay } = await import('../lib/engine/src/index');
    const currentGame = async () => replay(await readGameEvents(gameId));
    const progress: {
      phase: string;
      cycle: number;
      steps: number;
      shadowRound: number;
      alive: number;
      acknowledgements: number;
      shadowChoices: number;
      votes: number;
    }[] = [];
    let notesProjectionVerified = false;
    for (let step = 0; step < 50; step += 1) {
      const state = await currentGame();
      if (state.phase === 'FINISHED') break;
      const livingMorgan = state.seats.find(
        (seat) => seat.name === 'Morgan' && seat.status === 'alive',
      );
      if (
        ['MISSION', 'DEBATE', 'VERDICT', 'DAWN', 'ENDGAME'].includes(
          state.phase,
        ) &&
        livingMorgan &&
        !notesProjectionVerified
      ) {
        const notesView = await request(app)
          .post(`/api/games/${gameId}/private-view`)
          .set('Cookie', shieldedCookie)
          .set('X-CSRF-Token', csrfToken)
          .send({ purpose: 'notes' });
        expect(notesView.status).toBe(200);
        expect(notesView.body.view.private.role).toBe(livingMorgan.role);
        expect(notesView.body.view.private).not.toHaveProperty('otherRoles');
        notesProjectionVerified = true;
      }
      if (state.phase === 'SHADOW' && state.shadowRound === 1) {
        const activeDeadline = await db.execute(sql`
          select due_at
          from game_deadlines
          where game_id = ${gameId} and completed_at is null
          order by id desc
          limit 1
        `);
        const dueAt = activeDeadline.rows[0]?.due_at;
        expect(new Date(String(dueAt)).getTime()).toBe(state.deadline);
      }
      progress.push({
        phase: state.phase,
        cycle: state.cycle,
        steps: state.steps,
        shadowRound: state.shadowRound,
        alive: state.seats.filter((seat) => seat.status === 'alive').length,
        acknowledgements: state.acks.length,
        shadowChoices: Object.keys(state.shadow).length,
        votes: Object.keys(state.votes).length,
      });
      const player = state.seats.find((seat) => seat.name === 'Morgan');
      expect(player).toBeDefined();
      let playerCommand: Record<string, unknown> | null = null;
      const privatePhases = [
        'DEAL',
        'SHADOW',
        'VOTE',
        'FINAL_VOTE',
        'FINAL_BANISH',
      ];
      if (player!.status !== 'alive') {
        playerCommand = null;
      } else if (
        privatePhases.includes(state.phase) &&
        !state.acks.includes(player!.id)
      )
        playerCommand = { type: 'AcknowledgePrivate' };
      else if (state.phase === 'SHADOW' && !state.shadow[player!.id]) {
        const candidates = state.seats.filter(
          (seat) =>
            seat.status === 'alive' &&
            seat.id !== player!.id &&
            (player!.role !== 'traitor' ||
              (seat.role !== 'traitor' && !state.protected.includes(seat.id))),
        );
        const target = candidates[0];
        if (target)
          playerCommand = {
            type: 'SubmitShadowChoice',
            choice: target.id,
          };
      } else if (
        (state.phase === 'VOTE' || state.phase === 'FINAL_BANISH') &&
        !state.votes[player!.id]
      ) {
        const target = state.seats.find(
          (seat) => seat.status === 'alive' && seat.id !== player!.id,
        );
        if (target) playerCommand = { type: 'SubmitVote', target: target.id };
      } else if (state.phase === 'FINAL_VOTE' && !state.endVotes[player!.id]) {
        playerCommand = {
          type: 'SubmitEndgameVote',
          choice: 'continue',
        };
      }
      if (playerCommand) {
        const submitted = await request(app)
          .post(`/api/games/${gameId}/commands`)
          .set('Cookie', shieldedCookie)
          .set('X-CSRF-Token', csrfToken)
          .send({
            ...playerCommand,
            idempotencyKey: randomUUID(),
          });
        expect(
          submitted.status,
          JSON.stringify({
            phase: state.phase,
            cycle: state.cycle,
            steps: state.steps,
            shadowRound: state.shadowRound,
            playerStatus: player!.status,
            commandType: playerCommand.type,
            responseError: submitted.body.error,
          }),
        ).toBe(200);
      }
      const current = await currentGame();
      if (current.phase === 'FINISHED') break;
      expect(current.deadline).not.toBeNull();
      now = Math.max(now, current.deadline ?? now);
      await scheduler.runOnce();
    }
    const finished = await currentGame();
    expect(finished.phase, JSON.stringify(progress.slice(-10))).toBe(
      'FINISHED',
    );
    expect(notesProjectionVerified).toBe(true);
    const pairings = await db.execute(
      sql`select count(*) as count from game_presenter_pairings where game_id = ${gameId}`,
    );
    const presenterSessions = await db.execute(
      sql`select count(*) as count from game_presenter_sessions where game_id = ${gameId}`,
    );
    expect(Number(pairings.rows[0]?.count)).toBe(0);
    expect(Number(presenterSessions.rows[0]?.count)).toBe(0);
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('creates and advances a game through authenticated HTTP with idempotent replay', async () => {
  const gameId = randomUUID();
  const published: string[] = [];
  const app = createApp(async () => {}, {
    resolveViewer: () => ({ kind: 'coordinator' }),
    publishGame: async (id) => {
      published.push(id);
    },
  });
  const playerApp = createApp(async () => {}, {
    resolveViewer: () => ({ kind: 'player', seatId: 'seat-not-in-game' }),
  });
  try {
    const created = await request(app)
      .post('/api/games')
      .send({
        type: 'CreateGame',
        id: gameId,
        idempotencyKey: 'http-create',
        config: gameConfigSchema.parse({}),
      });
    expect(created.status).toBe(201);
    expect(created.body.version).toBe(1);
    const playerAdvance = await request(playerApp)
      .post(`/api/games/${gameId}/commands`)
      .send({
        type: 'AdvancePhase',
        expectedVersion: 1,
        idempotencyKey: 'unauthorised-player-advance',
      });
    expect(playerAdvance.status).toBe(401);
    expect(playerAdvance.body).toEqual({ error: 'Authentication required' });
    const createRetry = await request(app)
      .post('/api/games')
      .send({
        type: 'CreateGame',
        id: gameId,
        idempotencyKey: 'http-create',
        config: gameConfigSchema.parse({}),
      });
    expect(createRetry.status).toBe(200);
    expect(createRetry.body.version).toBe(1);

    const advance = {
      type: 'AdvancePhase',
      expectedVersion: 1,
      idempotencyKey: 'http-advance',
    };
    const firstAdvance = await request(app)
      .post(`/api/games/${gameId}/commands`)
      .send(advance);
    expect(firstAdvance.status).toBe(200);
    expect(firstAdvance.body.version).toBe(2);

    const retry = await request(app)
      .post(`/api/games/${gameId}/commands`)
      .send(advance);
    expect(retry.status).toBe(200);
    expect(retry.body.version).toBe(2);
    expect(published).toEqual([gameId, gameId, gameId]);

    const reusedIdempotencyKey = await request(app)
      .post(`/api/games/${gameId}/commands`)
      .send({ ...advance, expectedVersion: 2 });
    expect(reusedIdempotencyKey.status).toBe(409);
    expect(reusedIdempotencyKey.body).toEqual({
      error: 'Command rejected',
    });

    const current = await request(app).get(`/api/games/${gameId}/view`);
    expect(current.status).toBe(200);
    expect(current.body.version).toBe(2);

    const invalidTransition = await request(app)
      .post(`/api/games/${gameId}/commands`)
      .send({
        type: 'AdvancePhase',
        expectedVersion: 2,
        idempotencyKey: 'http-invalid-transition',
      });
    expect(invalidTransition.status).toBe(409);
    expect(invalidTransition.body).toEqual({ error: 'Command rejected' });

    expect(
      (await request(app).get(`/api/games/${randomUUID()}/view`)).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/games/${randomUUID()}/commands`)
          .send(advance)
      ).status,
    ).toBe(404);
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('does not reveal unknown join-request status with a valid-looking token', async () => {
  const requestId = '0123456789abcdef0123456789abcdef';
  const app = createApp(async () => {}, {
    rateLimitSecret: 'unit-test-secret',
  });
  const response = await request(app)
    .get(`/api/join-requests/${requestId}`)
    .set(
      'Cookie',
      `${cookieNameForJoinRequest(requestId)}=${Buffer.alloc(32, 1).toString('base64url')}`,
    );
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ error: 'Not found' });
});

it('returns a generic service error if realtime publishing fails after a command commit', async () => {
  const gameId = randomUUID();
  const created = eventSchema.parse({
    seq: 1,
    at: 1_800_000_000_000,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });
  await createGameWithEvent({
    event: created,
    actorId: 'coordinator:test',
    idempotencyKey: 'publish-error-create',
    requestHash: 'publish-error-create',
  });
  const app = createApp(async () => {}, {
    resolveViewer: () => ({ kind: 'coordinator' }),
    publishGame: async () => {
      throw new Error('private transport error');
    },
  });
  try {
    const response = await request(app)
      .post(`/api/games/${gameId}/commands`)
      .send({
        type: 'AdvancePhase',
        expectedVersion: 1,
        idempotencyKey: 'publish-error-command',
      });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Service unavailable' });
    expect(response.text).not.toContain('private transport error');
    expect(replay(await readGameEvents(gameId)).version).toBe(2);
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('returns not found if a game is removed before the post-command view is loaded', async () => {
  const gameId = randomUUID();
  const created = eventSchema.parse({
    seq: 1,
    at: 1_800_000_000_000,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });
  await createGameWithEvent({
    event: created,
    actorId: 'coordinator:test',
    idempotencyKey: 'removed-game-create',
    requestHash: 'removed-game-create',
  });
  const app = createApp(async () => {}, {
    resolveViewer: () => ({ kind: 'coordinator' }),
    publishGame: async () => {
      await db.execute(sql`delete from games where id = ${gameId}`);
    },
  });
  const response = await request(app)
    .post(`/api/games/${gameId}/commands`)
    .send({
      type: 'AdvancePhase',
      expectedVersion: 1,
      idempotencyKey: 'removed-game-advance',
    });
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ error: 'Not found' });
});

it('runs a coordinator command through the engine and persists its whole projected view', async () => {
  const gameId = randomUUID();
  const event = eventSchema.parse({
    seq: 1,
    at: 1_800_000_000_000,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });
  await createGameWithEvent({
    event,
    actorId: 'coordinator:test',
    idempotencyKey: 'create-command-view',
    requestHash: 'command-view-request',
  });
  let capacityChecks = 0;
  const app = createApp(async () => {}, {
    resolveViewer: () => ({ kind: 'coordinator' }),
    maxActiveGames: 1,
    countActiveGames: async () => {
      capacityChecks += 1;
      return 2;
    },
  });

  try {
    const response = await request(app)
      .post(`/api/games/${gameId}/commands`)
      .send({
        type: 'AdvancePhase',
        idempotencyKey: 'advance-once',
        expectedVersion: 1,
      });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      version: 2,
      view: { id: gameId, phase: 'LOBBY' },
    });
    expect(await readGameEvents(gameId)).toHaveLength(2);

    const retry = await request(app)
      .post(`/api/games/${gameId}/commands`)
      .send({
        type: 'AdvancePhase',
        idempotencyKey: 'advance-once',
        expectedVersion: 1,
      });
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({
      version: 2,
      view: { id: gameId, phase: 'LOBBY' },
    });
    expect(await readGameEvents(gameId)).toHaveLength(2);
    expect(capacityChecks).toBe(0);
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('pushes whole projected views only after an authenticated socket joins a server-selected room', async () => {
  const gameId = randomUUID();
  const createdEvent = eventSchema.parse({
    seq: 1,
    at: 1_800_000_000_000,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });
  await createGameWithEvent({
    event: createdEvent,
    actorId: 'coordinator:test',
    idempotencyKey: 'socket-create',
    requestHash: 'socket-create',
  });
  const firstSeat = eventSchema.parse({
    seq: 2,
    at: 1_800_000_000_001,
    schemaVersion: 1,
    type: 'SeatJoined',
    seatId: 'seat-1',
    name: 'Player one',
  });
  await appendGameEvents({
    gameId,
    expectedVersion: 1,
    actorId: 'coordinator:test',
    idempotencyKey: 'socket-seat-one',
    requestHash: 'socket-seat-one',
    events: [firstSeat],
  });

  const httpServer = createServer(createApp(async () => {}));
  const realtime = await attachRealtime(httpServer, {
    allowedOrigins: ['http://127.0.0.1'],
    resolveViewer: () => ({ kind: 'player', seatId: 'seat-1' }),
  });
  const publisherServer = createServer(createApp(async () => {}));
  const publisherRealtime = await attachRealtime(publisherServer, {
    allowedOrigins: ['http://127.0.0.1'],
    resolveViewer: () => ({ kind: 'visitor' }),
  });
  let client: ClientSocket | undefined;

  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const address = httpServer.address();
    if (!address || typeof address === 'string')
      throw new Error('Test server did not bind a TCP port');
    client = socketIo(`http://127.0.0.1:${address.port}`, {
      transports: ['websocket'],
      extraHeaders: { origin: 'http://127.0.0.1' },
      auth: { gameId },
      reconnection: false,
    });
    await new Promise<void>((resolve, reject) => {
      client!.once('connect', resolve);
      client!.once('connect_error', reject);
    });

    const firstViewPromise = new Promise<{
      version: number;
      view: { seats: unknown[]; private: unknown };
    }>((resolve) => client!.once('game:view', resolve));
    client.emit('game:watch', { gameId });
    const firstView = await firstViewPromise;
    expect(firstView.version).toBe(2);
    expect(firstView.view.seats).toHaveLength(1);
    expect(firstView.view.private).toBeNull();

    const secondSeat = eventSchema.parse({
      seq: 3,
      at: 1_800_000_000_002,
      schemaVersion: 1,
      type: 'SeatJoined',
      seatId: 'seat-2',
      name: 'Player two',
    });
    await appendGameEvents({
      gameId,
      expectedVersion: 2,
      actorId: 'coordinator:test',
      idempotencyKey: 'socket-seat-two',
      requestHash: 'socket-seat-two',
      events: [secondSeat],
    });
    const updatedViewPromise = new Promise<{
      version: number;
      view: { seats: unknown[] };
    }>((resolve) => client!.once('game:view', resolve));
    const publishStartedAt = performance.now();
    await publisherRealtime.publishGame(gameId);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error('Cross-instance push timed out')),
        2_000,
      );
    });
    const updatedView = await Promise.race([
      updatedViewPromise,
      timeoutPromise,
    ]);
    if (timeout) clearTimeout(timeout);
    const pushLatencyMs = performance.now() - publishStartedAt;
    expect(pushLatencyMs).toBeLessThan(1_000);
    if (process.env.CAPACITY_REPORT === '1')
      console.info(
        `[capacity] two-instance test push latency ${pushLatencyMs.toFixed(1)} ms`,
      );
    expect(updatedView.version).toBe(3);
    expect(updatedView.view.seats).toHaveLength(2);
  } finally {
    client?.disconnect();
    await realtime.close();
    await publisherRealtime.close();
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

async function fanOutPlayerViews(seatCount: number): Promise<void> {
  const gameId = randomUUID();
  const created = eventSchema.parse({
    seq: 1,
    at: 1_800_000_000_000,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });
  const joinedSeats = Array.from({ length: seatCount }, (_, index) =>
    eventSchema.parse({
      seq: index + 2,
      at: 1_800_000_000_001 + index,
      schemaVersion: 1,
      type: 'SeatJoined',
      seatId: `seat-${index + 1}`,
      name: `Player ${index + 1}`,
    }),
  );
  await createGameWithEvent({
    event: created,
    actorId: 'coordinator:test',
    idempotencyKey: 'five-socket-create',
    requestHash: 'five-socket-create',
  });
  await appendGameEvents({
    gameId,
    expectedVersion: 1,
    actorId: 'coordinator:test',
    idempotencyKey: 'five-socket-seats',
    requestHash: 'five-socket-seats',
    events: joinedSeats,
  });

  const httpServer = createServer(createApp(async () => {}));
  const realtime = await attachRealtime(httpServer, {
    allowedOrigins: ['http://127.0.0.1'],
    resolveViewer: (headers) => ({
      kind: 'player',
      seatId:
        typeof headers['x-seat'] === 'string' ? headers['x-seat'] : 'invalid',
    }),
  });
  const publisherRealtime = await attachRealtime(
    createServer(createApp(async () => {})),
    {
      allowedOrigins: ['http://127.0.0.1'],
      resolveViewer: () => ({ kind: 'visitor' }),
    },
  );
  const clients: ClientSocket[] = [];
  const codeLookupSpy = vi.spyOn(inviteStore, 'getOpenGameInviteCode');
  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const address = httpServer.address();
    if (!address || typeof address === 'string')
      throw new Error('Test server did not bind a TCP port');
    for (let index = 0; index < seatCount; index++) {
      const client = socketIo(`http://127.0.0.1:${address.port}`, {
        transports: ['websocket'],
        extraHeaders: {
          origin: 'http://127.0.0.1',
          'x-seat': `seat-${index + 1}`,
        },
        auth: { gameId },
        reconnection: false,
      });
      clients.push(client);
      await new Promise<void>((resolve, reject) => {
        client.once('connect', resolve);
        client.once('connect_error', reject);
      });
    }

    await Promise.all(
      clients.map(
        (client) =>
          new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error('Socket watch acknowledgement timed out')),
              2_000,
            );
            client.emit(
              'game:watch',
              { gameId },
              (acknowledgement: { ok?: boolean; error?: string }) => {
                clearTimeout(timeout);
                if (acknowledgement.ok) resolve();
                else
                  reject(
                    new Error(
                      acknowledgement.error ?? 'Socket watch was rejected',
                    ),
                  );
              },
            );
          }),
      ),
    );
    const changed = eventSchema.parse({
      seq: seatCount + 2,
      at: 1_800_000_000_001 + seatCount,
      schemaVersion: 1,
      type: 'PhaseChanged',
      phase: 'LOBBY',
      deadline: null,
      shadowEndAt: null,
      cycle: 0,
    });
    await appendGameEvents({
      gameId,
      expectedVersion: seatCount + 1,
      actorId: 'coordinator:test',
      idempotencyKey: 'five-socket-change',
      requestHash: 'five-socket-change',
      events: [changed],
    });
    await createGameInvite({
      gameId,
      linkTokenHash: randomBytes(32).toString('hex'),
      shortCodeHash: createHash('sha256').update('ABC234').digest('hex'),
      displayCode: 'ABC234',
    });
    codeLookupSpy.mockClear();
    const updatePromises = clients.map(
      (client) =>
        new Promise<{
          version: number;
          view: { seats: unknown[]; lobbyCode?: string };
        }>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('Socket fan-out timed out')),
            2_000,
          );
          client.once('game:view', (view) => {
            clearTimeout(timeout);
            resolve(view);
          });
        }),
    );
    await publisherRealtime.publishGame(gameId);
    const updatedViews = await Promise.all(updatePromises);
    expect(updatedViews.map((view) => view.version)).toEqual(
      Array(seatCount).fill(seatCount + 2),
    );
    expect(updatedViews.map((view) => view.view.seats.length)).toEqual(
      Array(seatCount).fill(seatCount),
    );
    expect(updatedViews.map((view) => view.view.lobbyCode)).toEqual(
      Array(seatCount).fill('ABC234'),
    );
    expect(codeLookupSpy).toHaveBeenCalledTimes(1);
  } finally {
    codeLookupSpy.mockRestore();
    for (const client of clients) client.disconnect();
    await realtime.close();
    await publisherRealtime.close();
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
}

it.each([5, 40])(
  'fans out fresh allow-listed views to %i authenticated player sockets',
  fanOutPlayerViews,
);

it('rejects websocket handshakes from an untrusted origin and from visitors', async () => {
  const httpServer = createServer(createApp(async () => {}));
  const realtime = await attachRealtime(httpServer, {
    allowedOrigins: ['https://turnstone.stackstoneconsulting.co.uk'],
    resolveViewer: () => ({ kind: 'visitor' }),
  });
  let client: ClientSocket | undefined;

  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const address = httpServer.address();
    if (!address || typeof address === 'string')
      throw new Error('Test server did not bind a TCP port');
    client = socketIo(`http://127.0.0.1:${address.port}`, {
      transports: ['websocket'],
      extraHeaders: { origin: 'https://untrusted.example' },
      reconnection: false,
    });
    const error = await new Promise<Error>((resolve, reject) => {
      client!.once('connect', () => reject(new Error('unexpected connection')));
      client!.once('connect_error', resolve);
    });
    expect(error.message).toBe('Unauthorized');
  } finally {
    client?.disconnect();
    await realtime.close();
  }
});

it('requires explicit pairing for non-seat socket viewers and rejects malformed watches', async () => {
  const gameId = randomUUID();
  const event = eventSchema.parse({
    seq: 1,
    at: 1_800_000_000_000,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });
  await createGameWithEvent({
    event,
    actorId: 'coordinator:test',
    idempotencyKey: 'presenter-pairing-create',
    requestHash: 'presenter-pairing-create',
    snapshot: { seq: 1, state: replay([event]) },
  });
  const httpServer = createServer(createApp(async () => {}));
  const realtime = await attachRealtime(httpServer, {
    allowedOrigins: ['http://127.0.0.1'],
    resolveViewer: () => ({ kind: 'presenter' }),
    authoriseGame: (_viewer, requestedGameId) => requestedGameId === gameId,
  });
  let client: ClientSocket | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const address = httpServer.address();
    if (!address || typeof address === 'string')
      throw new Error('Test server did not bind a TCP port');
    client = socketIo(`http://127.0.0.1:${address.port}`, {
      transports: ['websocket'],
      extraHeaders: { origin: 'http://127.0.0.1' },
      reconnection: false,
    });
    await new Promise<void>((resolve, reject) => {
      client!.once('connect', resolve);
      client!.once('connect_error', reject);
    });

    const watch = (input: unknown) =>
      new Promise<{ ok?: boolean; error?: string }>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Socket watch acknowledgement timed out')),
          2_000,
        );
        client!.emit(
          'game:watch',
          input,
          (acknowledgement: { ok?: boolean; error?: string }) => {
            clearTimeout(timeout);
            resolve(acknowledgement);
          },
        );
      });
    expect(await watch({})).toEqual({ error: 'Invalid request' });
    const firstView = new Promise<{ version: number }>((resolve) =>
      client!.once('game:view', resolve),
    );
    expect(await watch({ gameId })).toEqual({ ok: true });
    expect(await firstView).toMatchObject({ version: 1 });
    expect(await watch({ gameId: randomUUID() })).toEqual({
      error: 'Not found',
    });
  } finally {
    client?.disconnect();
    await realtime.close();
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('authenticates Socket.IO with a game-scoped seat session and rejects cross-game watches', async () => {
  const gameId = randomUUID();
  const seatId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const now = Date.now();
  const created = eventSchema.parse({
    seq: 1,
    at: now,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });
  const joined = eventSchema.parse({
    seq: 2,
    at: now + 1,
    schemaVersion: 1,
    type: 'SeatJoined',
    seatId,
    name: 'A player',
  });
  const allowedOrigins = ['http://127.0.0.1'];
  const server = createServer(createApp(async () => {}));
  const resolveSeatViewer = createSeatViewerResolver({
    findSession: findViewerSession,
    now: () => now,
  });
  const realtime = await attachRealtime(server, {
    allowedOrigins,
    resolveViewer: (headers, requestedGameId) =>
      requestedGameId
        ? resolveSeatViewer({
            gameId: requestedGameId,
            cookieHeader: headers.cookie,
          })
        : { kind: 'visitor' },
  });
  let client: ClientSocket | undefined;
  let invalidClient: ClientSocket | undefined;

  try {
    await createGameWithEvent({
      event: created,
      actorId: 'coordinator:test',
      idempotencyKey: 'scoped-session-create',
      requestHash: 'scoped-session-create',
    });
    await appendGameEvents({
      gameId,
      expectedVersion: 1,
      actorId: 'coordinator:test',
      idempotencyKey: 'scoped-session-join',
      requestHash: 'scoped-session-join',
      events: [joined],
    });
    await createSeatAccess({
      gameId,
      seatId,
      pinSalt: 'c'.repeat(32),
      pinHash: 'd'.repeat(64),
    });
    await createViewerSession({
      tokenHash,
      gameId,
      seatId,
      expiresAt: now + 60_000,
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Test server did not bind a TCP port');
    allowedOrigins[0] = `http://127.0.0.1:${address.port}`;
    client = socketIo(`http://127.0.0.1:${address.port}`, {
      transports: ['polling'],
      extraHeaders: {
        cookie: `${cookieNameForGame(gameId)}=${token}`,
      },
      auth: { gameId },
      reconnection: false,
    });
    await new Promise<void>((resolve, reject) => {
      client!.once('connect', resolve);
      client!.once('connect_error', reject);
    });
    const acknowledgement = await new Promise<{ ok?: boolean; error?: string }>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Socket watch acknowledgement timed out')),
          2_000,
        );
        client!.emit(
          'game:watch',
          { gameId },
          (result: { ok?: boolean; error?: string }) => {
            clearTimeout(timeout);
            resolve(result);
          },
        );
      },
    );
    expect(acknowledgement).toEqual({ ok: true });
    invalidClient = socketIo(`http://127.0.0.1:${address.port}`, {
      transports: ['polling'],
      extraHeaders: {
        cookie: `${cookieNameForGame(gameId)}=${token}`,
      },
      auth: { gameId: 'x'.repeat(129) },
      reconnection: false,
    });
    const invalidGameError = await new Promise<Error>((resolve, reject) => {
      invalidClient!.once('connect_error', resolve);
      invalidClient!.once('connect', () =>
        reject(new Error('Malformed game id was accepted')),
      );
    });
    expect(invalidGameError.message).toBe('Unauthorized');
    const otherGame = await new Promise<{ ok?: boolean; error?: string }>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Socket watch acknowledgement timed out')),
          2_000,
        );
        client!.emit(
          'game:watch',
          { gameId: randomUUID() },
          (result: { ok?: boolean; error?: string }) => {
            clearTimeout(timeout);
            resolve(result);
          },
        );
      },
    );
    expect(otherGame).toEqual({ error: 'Not found' });
    const disconnected = new Promise<string>((resolve) => {
      client!.once('disconnect', resolve);
    });
    await revokeSeatViewerSessions(gameId, seatId, Date.now());
    await realtime.publishGame(gameId);
    const disconnectResult = await Promise.race([
      disconnected,
      new Promise<string>((resolve) =>
        setTimeout(() => resolve('still-connected'), 1_000),
      ),
    ]);
    expect(disconnectResult).not.toBe('still-connected');
  } finally {
    client?.disconnect();
    invalidClient?.disconnect();
    await realtime.close();
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('projects the authenticated seat view over HTTP without treating the cookie as a visitor', async () => {
  const gameId = randomUUID();
  const seatId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const created = eventSchema.parse({
    seq: 1,
    at: now,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });

  try {
    await createGameWithEvent({
      event: created,
      actorId: 'coordinator:test',
      idempotencyKey: 'http-seat-session-create',
      requestHash: 'http-seat-session-create',
    });
    await appendGameEvents({
      gameId,
      expectedVersion: 1,
      actorId: 'coordinator:test',
      idempotencyKey: 'http-seat-session-join',
      requestHash: 'http-seat-session-join',
      events: [
        eventSchema.parse({
          seq: 2,
          at: now + 1,
          schemaVersion: 1,
          type: 'SeatJoined',
          seatId,
          name: 'A player',
        }),
      ],
    });
    await createSeatAccess({
      gameId,
      seatId,
      pinSalt: 'e'.repeat(32),
      pinHash: 'f'.repeat(64),
    });
    await createViewerSession({
      tokenHash: createHash('sha256').update(token).digest('hex'),
      gameId,
      seatId,
      expiresAt: now + 60_000,
    });

    const resolveSeatViewer = createSeatViewerResolver({
      findSession: findViewerSession,
      now: () => now,
    });
    const app = createApp(async () => {}, {
      resolveViewer: (requestContext) => {
        const requestedGameId = requestContext.params.id;
        return typeof requestedGameId === 'string'
          ? resolveSeatViewer({
              gameId: requestedGameId,
              cookieHeader: requestContext.headers.cookie,
            })
          : { kind: 'visitor' };
      },
    });
    const response = await request(app)
      .get(`/api/games/${gameId}/view`)
      .set('Cookie', `${cookieNameForGame(gameId)}=${token}`)
      .expect(200);

    expect(response.body.view).toMatchObject({
      id: gameId,
      seats: [{ id: seatId, name: 'A player', status: 'alive' }],
    });
    expect(response.body.view).not.toHaveProperty('exists');
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('creates a private invite and gives a joining guest a seat session', async () => {
  const gameId = randomUUID();
  const now = Date.now();
  const created = eventSchema.parse({
    seq: 1,
    at: now,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });

  try {
    await createGameWithEvent({
      event: created,
      actorId: 'coordinator:test',
      idempotencyKey: 'guest-invite-create',
      requestHash: 'guest-invite-create',
    });
    await appendGameEvents({
      gameId,
      expectedVersion: 1,
      actorId: 'coordinator:test',
      idempotencyKey: 'guest-invite-lobby',
      requestHash: 'guest-invite-lobby',
      events: [
        eventSchema.parse({
          seq: 2,
          at: now + 1,
          schemaVersion: 1,
          type: 'PhaseChanged',
          phase: 'LOBBY',
          deadline: null,
          shadowEndAt: null,
          cycle: 0,
        }),
      ],
    });

    const app = createApp(async () => {}, {
      resolveViewer: () => ({ kind: 'coordinator' }),
      rateLimitSecret: 'integration-test-rate-limit-secret',
      publicBaseUrl: 'https://turnstone.test',
      secureCookies: true,
      consumeRateLimit: async () => true,
    });
    const inviteResponse = await request(app)
      .post(`/api/games/${gameId}/invites`)
      .expect(201);
    const missingBaseApp = createApp(async () => {}, {
      resolveViewer: () => ({ kind: 'coordinator' }),
      rateLimitSecret: 'integration-test-rate-limit-secret',
      consumeRateLimit: async () => true,
    });
    await request(missingBaseApp)
      .post(`/api/games/${gameId}/invites`)
      .expect(503, { error: 'Service unavailable' });
    expect(inviteResponse.body.gameId).toBe(gameId);
    expect(/^[A-HJ-NP-Z2-9]{6}$/.test(inviteResponse.body.shortCode)).toBe(
      true,
    );
    const joinUrl = new URL(
      inviteResponse.body.joinUrl,
      'https://turnstone.test',
    );
    expect(joinUrl.pathname).toBe(`/join/${gameId}`);
    const inviteToken = joinUrl.hash.slice(1);
    expect(/^[A-Za-z0-9_-]{43}$/.test(inviteToken)).toBe(true);

    const joined = await request(app)
      .post(`/api/games/${gameId}/join`)
      .send({
        inviteToken,
        name: 'Guest One',
        pin: '1234',
        idempotencyKey: 'guest-one-join',
      })
      .expect(201);
    await request(app)
      .post(`/api/games/${gameId}/join`)
      .send({
        inviteToken,
        name: 'Guest One',
        pin: '9999',
        idempotencyKey: 'guest-one-join',
      })
      .expect(401, { error: 'Join could not be completed' });
    await request(app)
      .post(`/api/games/${gameId}/join`)
      .send({
        inviteToken,
        name: 'Guest One',
        pin: '4321',
        idempotencyKey: 'guest-one-duplicate-name',
      })
      .expect(409, { error: 'Command rejected' });
    const setCookieHeader = joined.headers['set-cookie'];
    const setCookie = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : [setCookieHeader ?? ''];
    expect(setCookie.some((cookie) => cookie.includes('HttpOnly'))).toBe(true);
    expect(setCookie.some((cookie) => cookie.includes('Secure'))).toBe(true);
    expect(setCookie.some((cookie) => cookie.includes('SameSite=Lax'))).toBe(
      true,
    );
    expect(setCookie.every((cookie) => !cookie.includes('1234'))).toBe(true);
    expect(joined.body.view).toMatchObject({
      id: gameId,
      seats: [{ name: 'Guest One', status: 'alive' }],
    });
    const oldSeatCookie =
      setCookie
        .find((cookie) => cookie.startsWith('turnstone-seat-'))
        ?.split(';')[0] ?? '';
    const oldSessionToken = oldSeatCookie.split('=').slice(1).join('=');
    const wrongNameRecovery = await request(app).post('/api/recover').send({
      shortCode: inviteResponse.body.shortCode,
      name: 'Unknown Guest',
      pin: '1234',
    });
    expect(wrongNameRecovery.status).toBe(401);
    expect(wrongNameRecovery.body).toEqual({
      error: 'Recovery could not be completed',
    });
    await appendGameEvents({
      gameId,
      expectedVersion: 3,
      actorId: 'coordinator:test',
      idempotencyKey: 'orphan-seat-add',
      requestHash: 'orphan-seat-add',
      events: [
        eventSchema.parse({
          seq: 4,
          at: now + 2,
          schemaVersion: 1,
          type: 'SeatJoined',
          seatId: 'orphan-seat',
          name: 'Orphan Guest',
        }),
      ],
    });
    await request(app)
      .post('/api/recover')
      .send({
        shortCode: inviteResponse.body.shortCode,
        name: 'Orphan Guest',
        pin: '1234',
      })
      .expect(401, { error: 'Recovery could not be completed' });
    const recovery = await request(app)
      .post('/api/recover')
      .send({
        shortCode: inviteResponse.body.shortCode,
        name: 'Guest One',
        pin: '1234',
      })
      .expect(200);
    const recoveryCookieHeader = recovery.headers['set-cookie'];
    const recoveryCookies = Array.isArray(recoveryCookieHeader)
      ? recoveryCookieHeader
      : [recoveryCookieHeader ?? ''];
    const newSeatCookie =
      recoveryCookies
        .find((cookie) => cookie.startsWith('turnstone-seat-'))
        ?.split(';')[0] ?? '';
    const newSessionToken = newSeatCookie.split('=').slice(1).join('=');
    expect(oldSessionToken.length > 0).toBe(true);
    expect(newSessionToken.length > 0).toBe(true);
    expect(newSessionToken !== oldSessionToken).toBe(true);
    const oldSession = await findViewerSession(
      createHash('sha256').update(oldSessionToken).digest('hex'),
      gameId,
    );
    const newSession = await findViewerSession(
      createHash('sha256').update(newSessionToken).digest('hex'),
      gameId,
    );
    expect(oldSession?.revokedAt).not.toBeNull();
    expect(newSession?.revokedAt).toBeNull();
    expect(recovery.body.view.id).toBe(gameId);
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('holds short-code joins for coordinator approval and returns a seat cookie after approval', async () => {
  const gameId = randomUUID();
  const now = Date.now();
  const publishedGames: string[] = [];
  const created = eventSchema.parse({
    seq: 1,
    at: now,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });

  try {
    await createGameWithEvent({
      event: created,
      actorId: 'coordinator:test',
      idempotencyKey: 'code-approval-create',
      requestHash: 'code-approval-create',
    });
    await appendGameEvents({
      gameId,
      expectedVersion: 1,
      actorId: 'coordinator:test',
      idempotencyKey: 'code-approval-lobby',
      requestHash: 'code-approval-lobby',
      events: [
        eventSchema.parse({
          seq: 2,
          at: now + 1,
          schemaVersion: 1,
          type: 'PhaseChanged',
          phase: 'LOBBY',
          deadline: null,
          shadowEndAt: null,
          cycle: 0,
        }),
      ],
    });
    const app = createApp(async () => {}, {
      publishGame: async (publishedGameId) => {
        publishedGames.push(publishedGameId);
      },
      resolveViewer: () => ({ kind: 'coordinator' }),
      rateLimitSecret: 'integration-test-rate-limit-secret',
      publicBaseUrl: 'https://turnstone.test',
      secureCookies: true,
    });
    const invite = await request(app)
      .post(`/api/games/${gameId}/invites`)
      .expect(201);
    const shortCode = invite.body.shortCode as string;
    expect(/^[A-HJ-NP-Z2-9]{6}$/.test(shortCode)).toBe(true);

    const joinRequest = await request(app)
      .post('/api/join')
      .send({
        shortCode,
        name: 'Short Guest',
        pin: '5678',
        idempotencyKey: 'short-guest-join',
      })
      .expect(202);
    expect(joinRequest.body.status).toBe('pending');
    expect(publishedGames).toContain(gameId);
    const requestId = joinRequest.body.requestId as string;
    const cookieHeader = joinRequest.headers['set-cookie'];
    const cookieLines = Array.isArray(cookieHeader)
      ? cookieHeader
      : [cookieHeader ?? ''];
    const joinCookie = cookieLines.find((cookie) =>
      cookie.startsWith('turnstone-join-'),
    );
    expect(typeof joinCookie).toBe('string');
    expect(Boolean(joinCookie?.includes('HttpOnly'))).toBe(true);
    expect(Boolean(joinCookie?.includes('Secure'))).toBe(true);

    const pending = await request(app)
      .get(`/api/games/${gameId}/join-requests`)
      .expect(200);
    expect(pending.body.requests).toHaveLength(1);
    expect(pending.body.requests[0]).toMatchObject({
      id: requestId,
      name: 'Short Guest',
    });
    const seatId = pending.body.requests[0].seatId as string;
    const approval = await request(app)
      .post(`/api/games/${gameId}/join-requests/${requestId}/decision`)
      .send({ decision: 'approve', expectedVersion: 2 })
      .expect(200);
    expect(approval.body.status).toBe('approved');
    expect(
      publishedGames.filter((publishedId) => publishedId === gameId),
    ).toHaveLength(2);
    expect(approval.body.seatId).toBe(seatId);

    const status = await request(app)
      .get(`/api/join-requests/${requestId}`)
      .set('Cookie', joinCookie?.split(';')[0] ?? '')
      .expect(200);
    expect(status.body.status).toBe('approved');
    expect(status.body.game.view).toMatchObject({
      id: gameId,
      seats: [{ id: seatId, name: 'Short Guest', status: 'alive' }],
    });
    const sessionCookieHeader = status.headers['set-cookie'];
    const sessionCookies = Array.isArray(sessionCookieHeader)
      ? sessionCookieHeader
      : [sessionCookieHeader ?? ''];
    expect(
      sessionCookies.some((cookie) => cookie.startsWith('turnstone-seat-')),
    ).toBe(true);
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('locks PIN recovery after five failed attempts without exposing whether the name exists', async () => {
  const gameId = randomUUID();
  const now = Date.now();
  const created = eventSchema.parse({
    seq: 1,
    at: now,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });

  try {
    await createGameWithEvent({
      event: created,
      actorId: 'coordinator:test',
      idempotencyKey: 'pin-lockout-create',
      requestHash: 'pin-lockout-create',
    });
    await appendGameEvents({
      gameId,
      expectedVersion: 1,
      actorId: 'coordinator:test',
      idempotencyKey: 'pin-lockout-lobby',
      requestHash: 'pin-lockout-lobby',
      events: [
        eventSchema.parse({
          seq: 2,
          at: now + 1,
          schemaVersion: 1,
          type: 'PhaseChanged',
          phase: 'LOBBY',
          deadline: null,
          shadowEndAt: null,
          cycle: 0,
        }),
      ],
    });
    const app = createApp(async () => {}, {
      resolveViewer: () => ({ kind: 'coordinator' }),
      rateLimitSecret: 'integration-test-rate-limit-secret',
      publicBaseUrl: 'https://turnstone.test',
      secureCookies: true,
      consumeRateLimit: async () => true,
    });
    const invite = await request(app).post(`/api/games/${gameId}/invites`);
    expect(invite.status).toBe(201);
    const joinUrl = new URL(invite.body.joinUrl);
    const join = await request(app)
      .post(`/api/games/${gameId}/join`)
      .send({
        inviteToken: joinUrl.hash.slice(1),
        name: 'Locked Seat',
        pin: '2468',
        idempotencyKey: 'pin-lockout-seat',
      });
    expect(join.status).toBe(201);

    const failures: number[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      const failed = await request(app).post('/api/recover').send({
        shortCode: invite.body.shortCode,
        name: 'Locked Seat',
        pin: '1357',
      });
      failures.push(failed.status);
      expect(failed.body.error).toBe('Recovery could not be completed');
    }
    expect(failures).toEqual([401, 401, 401, 401, 429]);

    const correctPinWhileLocked = await request(app).post('/api/recover').send({
      shortCode: invite.body.shortCode,
      name: 'Locked Seat',
      pin: '2468',
    });
    expect(correctPinWhileLocked.status).toBe(429);
    expect(correctPinWhileLocked.body.error).toBe(
      'Recovery could not be completed',
    );

    const coordinatorView = await request(app)
      .get(`/api/games/${gameId}/view`)
      .expect(200);
    const seatId = join.body.view.seats.find(
      (seat: { name: string }) => seat.name === 'Locked Seat',
    )?.id;
    expect(seatId).toBeTruthy();
    expect(coordinatorView.body.view.coordinatorAlerts).toContainEqual(
      expect.objectContaining({ code: 'seat_pin_locked', seatId }),
    );
    const playerView = await request(
      createApp(async () => {}, {
        resolveViewer: () => ({ kind: 'player', seatId }),
      }),
    )
      .get(`/api/games/${gameId}/view`)
      .expect(200);
    expect(playerView.body.view.coordinatorAlerts).toEqual([]);

    const replacementPin = '8642';
    const pinReset = await request(app)
      .post(`/api/games/${gameId}/seats/${seatId}/pin/reset`)
      .send({
        expectedVersion: coordinatorView.body.version,
        newPin: replacementPin,
      });
    expect(pinReset.status).toBe(200);
    const afterReset = await request(app)
      .get(`/api/games/${gameId}/view`)
      .expect(200);
    expect(afterReset.body.view.publicLog).toContainEqual(
      expect.objectContaining({ action: 'seat_pin_reset', seatId }),
    );
    expect(JSON.stringify(afterReset.body.view.publicLog)).not.toContain(
      replacementPin,
    );
    await request(app)
      .post(`/api/games/${gameId}/seats/${seatId}/pin/reset`)
      .send({
        expectedVersion: coordinatorView.body.version,
        newPin: '1357',
      })
      .expect(409, { error: 'Command rejected' });
    const recoveredWithResetPin = await request(app).post('/api/recover').send({
      shortCode: invite.body.shortCode,
      name: 'Locked Seat',
      pin: replacementPin,
    });
    expect(recoveredWithResetPin.status).toBe(200);
    expect(recoveredWithResetPin.body.view.publicLog).toContainEqual(
      expect.objectContaining({ action: 'device_recovered', seatId }),
    );
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('resyncs whole projected views after a dropped socket and server restart', async () => {
  const gameId = randomUUID();
  const seatId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const now = Date.now();
  const created = eventSchema.parse({
    seq: 1,
    at: now,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });
  const joined = eventSchema.parse({
    seq: 2,
    at: now + 1,
    schemaVersion: 1,
    type: 'SeatJoined',
    seatId,
    name: 'Reconnect player',
  });
  const resolveSeatViewer = createSeatViewerResolver({
    findSession: findViewerSession,
    now: () => now,
  });
  let activeRealtime: Awaited<ReturnType<typeof attachRealtime>> | undefined;
  const app = createApp(async () => {}, {
    resolveViewer: () => ({ kind: 'coordinator' }),
    publishGame: async (id) => {
      await activeRealtime?.publishGame(id);
    },
  });
  const servers: Array<{
    server: ReturnType<typeof createServer>;
    realtime: Awaited<ReturnType<typeof attachRealtime>>;
  }> = [];
  const clients: ClientSocket[] = [];

  async function startServer() {
    const server = createServer(app);
    const realtime = await attachRealtime(server, {
      allowedOrigins: ['http://127.0.0.1'],
      resolveViewer: (headers, requestedGameId) =>
        requestedGameId
          ? resolveSeatViewer({
              gameId: requestedGameId,
              cookieHeader: headers.cookie,
            })
          : { kind: 'visitor' },
    });
    activeRealtime = realtime;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    servers.push({ server, realtime });
    return server;
  }

  async function connect(server: ReturnType<typeof createServer>) {
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Test server did not bind a TCP port');
    const client = socketIo(`http://127.0.0.1:${address.port}`, {
      transports: ['websocket'],
      extraHeaders: {
        origin: 'http://127.0.0.1',
        cookie: `${cookieNameForGame(gameId)}=${token}`,
      },
      auth: { gameId },
      reconnection: false,
    });
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });
    return client;
  }

  async function watch(client: ClientSocket) {
    return new Promise<{ version: number; view: { phase: string } }>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Socket resync timed out')),
          2_000,
        );
        client.once('game:view', (view) => {
          clearTimeout(timeout);
          resolve(view);
        });
        client.emit(
          'game:watch',
          { gameId },
          (acknowledgement: { ok?: boolean; error?: string }) => {
            if (!acknowledgement.ok) {
              clearTimeout(timeout);
              reject(new Error(acknowledgement.error ?? 'Watch rejected'));
            }
          },
        );
      },
    );
  }

  try {
    await createGameWithEvent({
      event: created,
      actorId: 'coordinator:test',
      idempotencyKey: 'resync-create',
      requestHash: 'resync-create',
    });
    await appendGameEvents({
      gameId,
      expectedVersion: 1,
      actorId: 'coordinator:test',
      idempotencyKey: 'resync-seat',
      requestHash: 'resync-seat',
      events: [joined],
    });
    await createSeatAccess({
      gameId,
      seatId,
      pinSalt: 'a'.repeat(32),
      pinHash: 'b'.repeat(64),
    });
    await createViewerSession({
      tokenHash,
      gameId,
      seatId,
      expiresAt: now + 60_000,
    });

    const firstServer = await startServer();
    const firstClient = await connect(firstServer);
    expect(await watch(firstClient)).toMatchObject({
      version: 2,
      view: { phase: 'DRAFT' },
    });
    firstClient.disconnect();

    const command = {
      type: 'AdvancePhase',
      expectedVersion: 2,
      idempotencyKey: 'resync-advance',
    };
    const advance = await request(app)
      .post(`/api/games/${gameId}/commands`)
      .send(command);
    expect(advance.status).toBe(200);
    expect(advance.body.version).toBe(3);

    await servers[0]?.realtime.close();
    await new Promise<void>((resolve) => {
      if (!firstServer.listening) {
        resolve();
        return;
      }
      firstServer.close(() => resolve());
    });

    const secondServer = await startServer();
    const secondClient = await connect(secondServer);
    expect(await watch(secondClient)).toMatchObject({
      version: 3,
      view: { phase: 'LOBBY' },
    });

    const retry = await request(app)
      .post(`/api/games/${gameId}/commands`)
      .send(command);
    expect(retry.status).toBe(200);
    expect(retry.body.version).toBe(3);
    expect(await readGameEvents(gameId)).toHaveLength(3);
  } finally {
    for (const client of clients) client.disconnect();
    for (const { realtime, server } of servers) {
      await realtime.close();
      if (server.listening) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('rejects a short-code join without exposing more than its decision status', async () => {
  const gameId = randomUUID();
  const now = Date.now();
  const created = eventSchema.parse({
    seq: 1,
    at: now,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });

  try {
    await createGameWithEvent({
      event: created,
      actorId: 'coordinator:test',
      idempotencyKey: 'reject-join-create',
      requestHash: 'reject-join-create',
    });
    await appendGameEvents({
      gameId,
      expectedVersion: 1,
      actorId: 'coordinator:test',
      idempotencyKey: 'reject-join-lobby',
      requestHash: 'reject-join-lobby',
      events: [
        eventSchema.parse({
          seq: 2,
          at: now + 1,
          schemaVersion: 1,
          type: 'PhaseChanged',
          phase: 'LOBBY',
          deadline: null,
          shadowEndAt: null,
          cycle: 0,
        }),
      ],
    });
    const app = createApp(async () => {}, {
      resolveViewer: () => ({ kind: 'coordinator' }),
      rateLimitSecret: 'integration-test-rate-limit-secret',
      publicBaseUrl: 'https://turnstone.test',
      secureCookies: true,
      consumeRateLimit: async () => true,
    });
    const invite = await request(app)
      .post(`/api/games/${gameId}/invites`)
      .expect(201);
    const join = await request(app)
      .post('/api/join')
      .send({
        shortCode: invite.body.shortCode,
        name: 'Declined Guest',
        pin: '5678',
        idempotencyKey: 'declined-guest-join',
      })
      .expect(202);
    const requestId = join.body.requestId as string;
    const cookieHeader = join.headers['set-cookie'];
    const cookies = Array.isArray(cookieHeader)
      ? cookieHeader
      : [cookieHeader ?? ''];
    const joinCookie = cookies.find((cookie) =>
      cookie.startsWith('turnstone-join-'),
    );
    expect(joinCookie).toBeTruthy();

    const pending = await request(app)
      .get(`/api/join-requests/${requestId}`)
      .set('Cookie', joinCookie?.split(';')[0] ?? '')
      .expect(200);
    expect(pending.body).toEqual({ status: 'pending' });
    await request(app)
      .post(`/api/games/${gameId}/join-requests/${requestId}/decision`)
      .send({ decision: 'reject', expectedVersion: 1 })
      .expect(409, { error: 'Command rejected' });
    await request(app)
      .post(`/api/games/${gameId}/join-requests/${'b'.repeat(32)}/decision`)
      .send({ decision: 'reject', expectedVersion: 2 })
      .expect(404, { error: 'Not found' });

    const rejected = await request(app)
      .post(`/api/games/${gameId}/join-requests/${requestId}/decision`)
      .send({ decision: 'reject', expectedVersion: 2 })
      .expect(200);
    expect(rejected.body.status).toBe('rejected');

    const finalStatus = await request(app)
      .get(`/api/join-requests/${requestId}`)
      .set('Cookie', joinCookie?.split(';')[0] ?? '')
      .expect(200);
    expect(finalStatus.body).toEqual({ status: 'rejected' });
    const finalCookies = finalStatus.headers['set-cookie'];
    const clearedCookies = Array.isArray(finalCookies)
      ? finalCookies
      : [finalCookies ?? ''];
    expect(
      clearedCookies.some((cookie) => cookie.startsWith('turnstone-join-')),
    ).toBe(true);
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('enforces the 80 per cent game-admission threshold without blocking existing games', async () => {
  const acceptedGameId = randomUUID();
  const busyGameId = randomUUID();
  const visitorGameId = randomUUID();
  const options = (activeGames: number) => ({
    resolveViewer: () => ({ kind: 'coordinator' as const }),
    maxActiveGames: 10,
    countActiveGames: async () => activeGames,
    rateLimitSecret: 'integration-test-rate-limit-secret',
    consumeRateLimit: async () => true,
  });
  const acceptedApp = createApp(async () => {}, options(8));
  const busyApp = createApp(async () => {}, options(9));
  const visitorApp = createApp(async () => {}, {
    resolveViewer: () => ({ kind: 'visitor' }),
    rateLimitSecret: 'integration-test-rate-limit-secret',
    consumeRateLimit: async () => true,
  });
  const createPayload = (id: string, idempotencyKey: string) => ({
    type: 'CreateGame',
    id,
    idempotencyKey,
    config: gameConfigSchema.parse({}),
  });

  try {
    await request(acceptedApp)
      .post('/api/games')
      .send({ type: 'unknown' })
      .expect(400);
    await request(visitorApp)
      .post('/api/games')
      .send(createPayload(visitorGameId, 'visitor-create'))
      .expect(201)
      .expect(({ body }) => {
        expect(body.view.id).toBe(visitorGameId);
        expect(body.view.private).toBeNull();
      });

    const accepted = await request(acceptedApp)
      .post('/api/games')
      .send(createPayload(acceptedGameId, 'capacity-boundary-create'))
      .expect(201);
    expect(accepted.body.version).toBe(1);

    const busy = await request(busyApp)
      .post('/api/games')
      .send(createPayload(busyGameId, 'capacity-full-create'))
      .expect(503);
    expect(busy.body).toEqual({
      error: 'Busy right now, try again in a few minutes',
    });
  } finally {
    await db.execute(
      sql`delete from games where id in (${acceptedGameId}, ${busyGameId}, ${visitorGameId})`,
    );
  }
});

it('enforces viewer authorization and handles malformed or unconfigured guest requests', async () => {
  const gameId = randomUUID();
  const missingGameId = randomUUID();
  const requestId = 'a'.repeat(32);
  const visitorApp = createApp(async () => {}, {
    resolveViewer: () => ({ kind: 'visitor' }),
    rateLimitSecret: 'integration-test-rate-limit-secret',
    publicBaseUrl: 'https://turnstone.test',
    consumeRateLimit: async () => true,
  });
  const coordinatorWithoutSecret = createApp(async () => {}, {
    resolveViewer: () => ({ kind: 'coordinator' }),
  });
  const coordinatorApp = createApp(async () => {}, {
    resolveViewer: () => ({ kind: 'coordinator' }),
    rateLimitSecret: 'integration-test-rate-limit-secret',
    consumeRateLimit: async () => true,
  });
  const createCommand = {
    type: 'CreateGame',
    id: gameId,
    idempotencyKey: 'unauthorised-create',
    config: gameConfigSchema.parse({}),
  };
  const joinBody = {
    shortCode: 'ABC234',
    name: 'Guest player',
    pin: '2468',
    idempotencyKey: 'unconfigured-short-join',
  };
  const directJoinBody = {
    inviteToken: 'A'.repeat(43),
    name: 'Guest player',
    pin: '2468',
    idempotencyKey: 'unconfigured-direct-join',
  };
  const decisionBody = { decision: 'reject', expectedVersion: 1 };

  const createdByVisitor = await request(visitorApp)
    .post('/api/games')
    .send(createCommand)
    .expect(201);
  expect(createdByVisitor.body.view.id).toBe(gameId);
  expect(createdByVisitor.body.view.private).toBeNull();
  await request(visitorApp)
    .post(`/api/games/${gameId}/invites`)
    .expect(401, { error: 'Authentication required' });
  await request(visitorApp)
    .get(`/api/games/${gameId}/join-requests`)
    .expect(401, { error: 'Authentication required' });
  await request(visitorApp)
    .post(`/api/games/${gameId}/join-requests/${requestId}/decision`)
    .send(decisionBody)
    .expect(401, { error: 'Authentication required' });
  await request(visitorApp)
    .post(`/api/games/${gameId}/commands`)
    .send({
      type: 'AdvancePhase',
      expectedVersion: 1,
      idempotencyKey: 'unauthorised-command',
    })
    .expect(401, { error: 'Authentication required' });
  await request(coordinatorApp)
    .post(`/api/games/${missingGameId}/commands`)
    .send({
      type: 'AdvancePhase',
      expectedVersion: 1,
      idempotencyKey: 'missing-game-command',
    })
    .expect(404, { error: 'Not found' });
  await request(visitorApp)
    .post('/api/join')
    .send({ shortCode: 'bad' })
    .expect(400, { error: 'Invalid request' });
  await request(visitorApp)
    .post('/api/join')
    .send(joinBody)
    .expect(404, { error: 'Not found' });
  await request(visitorApp)
    .post('/api/recover')
    .send({ shortCode: 'ZZZZZZ', name: 'Unknown Guest', pin: '2468' })
    .expect(401, { error: 'Recovery could not be completed' });
  await request(visitorApp)
    .post('/api/games/not-a-game/join')
    .send(directJoinBody)
    .expect(404, { error: 'Not found' });
  const visitorView = await request(visitorApp)
    .get(`/api/games/${gameId}/view`)
    .expect(200);
  expect(visitorView.body.view).toEqual({
    exists: true,
    phase: 'DRAFT',
    lobbyOpen: false,
    seatCount: 0,
  });
  await request(visitorApp)
    .get(`/api/join-requests/${requestId}`)
    .expect(404, { error: 'Not found' });
  await request(visitorApp).get('/not-a-route').expect(404, {
    error: 'Not found',
  });

  await request(coordinatorWithoutSecret)
    .post('/api/join')
    .send(joinBody)
    .expect(503, { error: 'Service unavailable' });
  await db.execute(sql`delete from games where id = ${gameId}`);
  await request(coordinatorWithoutSecret)
    .post(`/api/games/${gameId}/join`)
    .send(directJoinBody)
    .expect(503, { error: 'Service unavailable' });
  await request(coordinatorWithoutSecret)
    .post('/api/recover')
    .send({ shortCode: 'ABC234', name: 'Guest player', pin: '2468' })
    .expect(400, { error: 'Invalid request' });
  await request(coordinatorWithoutSecret)
    .get(`/api/join-requests/${requestId}`)
    .expect(503, { error: 'Service unavailable' });
  await request(coordinatorWithoutSecret)
    .post(`/api/games/${gameId}/join-requests/${requestId}/decision`)
    .send(decisionBody)
    .expect(503, { error: 'Service unavailable' });
});

it('applies rate limits before reading or mutating game data on every write route', async () => {
  const gameId = randomUUID();
  const requestId = 'c'.repeat(32);
  const app = createApp(async () => {}, {
    resolveViewer: () => ({ kind: 'coordinator' }),
    rateLimitSecret: 'integration-test-rate-limit-secret',
    publicBaseUrl: 'https://turnstone.test',
    consumeRateLimit: async () => false,
  });
  const createCommand = {
    type: 'CreateGame',
    id: gameId,
    idempotencyKey: 'rate-limited-create',
    config: gameConfigSchema.parse({}),
  };
  const directJoin = {
    inviteToken: 'A'.repeat(43),
    name: 'Rate limited',
    pin: '2468',
    idempotencyKey: 'rate-limited-direct-join',
  };
  const shortCodeJoin = {
    shortCode: 'ABC234',
    name: 'Rate limited',
    pin: '2468',
    idempotencyKey: 'rate-limited-short-join',
  };
  const decision = { decision: 'reject', expectedVersion: 1 };

  await request(app)
    .post('/api/games')
    .send(createCommand)
    .expect(429, { error: 'Too many requests' });
  await request(app)
    .post(`/api/games/${gameId}/invites`)
    .expect(429, { error: 'Too many requests' });
  await request(app)
    .post('/api/join')
    .send(shortCodeJoin)
    .expect(429, { error: 'Too many requests' });
  await request(app)
    .get(`/api/games/${gameId}/join-requests`)
    .expect(429, { error: 'Too many requests' });
  await request(app)
    .post(`/api/games/${gameId}/join-requests/${requestId}/decision`)
    .send(decision)
    .expect(429, { error: 'Too many requests' });
  await request(app)
    .post('/api/recover')
    .send({ shortCode: 'ABC234', name: 'Rate limited', pin: '2468' })
    .expect(429, { error: 'Recovery could not be completed' });
  await request(app)
    .post(`/api/games/${gameId}/join`)
    .send(directJoin)
    .expect(429, { error: 'Too many requests' });
  await request(app)
    .post(`/api/games/${gameId}/commands`)
    .send({
      type: 'AdvancePhase',
      expectedVersion: 1,
      idempotencyKey: 'rate-limited-command',
    })
    .expect(429, { error: 'Too many requests' });
});

it('rejects cookie-authenticated writes without a matching CSRF token', async () => {
  const app = createApp(async () => {}, {
    resolveViewer: () => ({ kind: 'coordinator' }),
    rateLimitSecret: 'integration-test-rate-limit-secret',
    publicBaseUrl: 'https://turnstone.test',
    consumeRateLimit: async () => true,
  });
  const csrfHeaders = { Origin: 'https://attacker.invalid' };

  await request(app)
    .post('/api/games')
    .set(csrfHeaders)
    .send({})
    .expect(403, { error: 'Invalid request' });
  await request(app)
    .post('/api/games/test-game/invites')
    .set(csrfHeaders)
    .expect(403, { error: 'Invalid request' });
  await request(app)
    .post('/api/join')
    .set(csrfHeaders)
    .send({})
    .expect(403, { error: 'Invalid request' });
  await request(app)
    .post('/api/games/test-game/join-requests/test-request/decision')
    .set(csrfHeaders)
    .send({})
    .expect(403, { error: 'Invalid request' });
  await request(app)
    .post('/api/recover')
    .set(csrfHeaders)
    .send({})
    .expect(403, { error: 'Invalid request' });
  await request(app)
    .post('/api/games/test-game/join')
    .set(csrfHeaders)
    .send({})
    .expect(403, { error: 'Invalid request' });
  await request(app)
    .post('/api/games/test-game/commands')
    .set(csrfHeaders)
    .send({})
    .expect(403, { error: 'Invalid request' });
});

it('issues a fresh CSRF token for malformed cookies and validates matching tokens', async () => {
  const app = createApp(async () => {}, {
    resolveViewer: () => ({ kind: 'visitor' }),
  });
  const csrf = await request(app)
    .get('/api/csrf')
    .set('Cookie', 'unrelated=value; malformed')
    .expect(200);
  const cookieHeader = csrf.headers['set-cookie'];
  const cookies = Array.isArray(cookieHeader)
    ? cookieHeader
    : [cookieHeader ?? ''];
  const csrfCookie = cookies.find((cookie) =>
    cookie.startsWith('turnstone-csrf='),
  );
  const token = csrf.body.csrfToken as string;
  expect(token).toHaveLength(43);
  expect(csrfCookie).toBeTruthy();

  await request(app)
    .post('/api/games')
    .set('Cookie', csrfCookie?.split(';')[0] ?? '')
    .set('X-CSRF-Token', 'x'.repeat(token.length))
    .send({})
    .expect(403, { error: 'Invalid request' });
  await request(app)
    .post('/api/games')
    .set('Cookie', csrfCookie?.split(';')[0] ?? '')
    .set('X-CSRF-Token', token)
    .send({})
    .expect(400, { error: 'Invalid request' });
});

it('pairs a presenter using a single-use game-scoped code stored only as a hash', async () => {
  const gameId = randomUUID();
  const created = eventSchema.parse({
    seq: 1,
    at: Date.now(),
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({ presenter: { enabled: true } }),
  });
  await createGameWithEvent({
    event: created,
    actorId: 'coordinator:test',
    idempotencyKey: 'presenter-pair-create',
    requestHash: 'presenter-pair-create',
  });

  try {
    const app = createApp(async () => {}, {
      resolveViewer: () => ({ kind: 'coordinator' }),
      rateLimitSecret: 'integration-test-rate-limit-secret',
      consumeRateLimit: async () => true,
      secureCookies: true,
    });
    const pairing = await request(app)
      .post(`/api/games/${gameId}/presenter-pairings`)
      .expect(201);
    const code = pairing.body.code as string;
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(pairing.body)).not.toContain(gameId);
    const storedPairing = await db.execute(
      sql`select code_hash from game_presenter_pairings where game_id = ${gameId}`,
    );
    expect(storedPairing.rows[0]?.code_hash).not.toBe(code);

    const paired = await request(app)
      .post('/api/presenter/pair')
      .send({ gameId, code })
      .expect(200);
    expect(paired.body.game.view).toMatchObject({
      phase: 'DRAFT',
      private: null,
      fairness: null,
    });
    const cookieHeader = paired.headers['set-cookie'];
    const cookies = Array.isArray(cookieHeader)
      ? cookieHeader
      : [cookieHeader ?? ''];
    const presenterCookie = cookies.find((cookie) =>
      cookie.startsWith('turnstone-presenter-'),
    );
    expect(presenterCookie).toContain('HttpOnly');
    expect(presenterCookie).toContain('Secure');

    const [{ findPresenterSession }, { findViewerSession }] = await Promise.all(
      [
        import('@workspace/db/presenter-access-store'),
        import('@workspace/db/seat-access-store'),
      ],
    );
    const { createSeatViewerResolver } =
      await import('../artifacts/api-server/src/session-auth');
    const resolveSeatOrPresenter = createSeatViewerResolver({
      findSession: findViewerSession,
      findPresenterSession,
    });
    const cookie = presenterCookie!.split(';', 1)[0]!;
    await expect(
      resolveSeatOrPresenter({
        gameId: 'a-different-game',
        cookieHeader: cookie,
      }),
    ).resolves.toEqual({ kind: 'visitor' });
    const presenterApp = createApp(async () => {}, {
      resolveViewer: (request) =>
        resolveSeatOrPresenter({
          gameId: Array.isArray(request.params.id)
            ? (request.params.id[0] ?? '')
            : (request.params.id ?? ''),
          cookieHeader: request.headers.cookie,
        }),
    });
    const presenterView = await request(presenterApp)
      .get(`/api/games/${gameId}/view`)
      .set('Cookie', cookie)
      .expect(200);
    expect(presenterView.body.view).toMatchObject({
      id: gameId,
      private: null,
      fairness: null,
    });

    const httpServer = createServer(presenterApp);
    const realtime = await attachRealtime(httpServer, {
      allowedOrigins: ['http://127.0.0.1'],
      resolveViewer: (headers, requestedGameId) =>
        requestedGameId
          ? resolveSeatOrPresenter({
              gameId: requestedGameId,
              cookieHeader: headers.cookie,
            })
          : { kind: 'visitor' },
    });
    let client: ClientSocket | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(0, '127.0.0.1', resolve);
      });
      const address = httpServer.address();
      if (!address || typeof address === 'string')
        throw new Error('Presenter test server did not bind a TCP port');
      client = socketIo(`http://127.0.0.1:${address.port}`, {
        transports: ['websocket'],
        extraHeaders: { origin: 'http://127.0.0.1', cookie },
        auth: { gameId },
        reconnection: false,
      });
      await new Promise<void>((resolve, reject) => {
        client!.once('connect', resolve);
        client!.once('connect_error', reject);
      });
      const viewPromise = new Promise<{
        version: number;
        view: { id: string; private: unknown };
      }>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Presenter watch timed out')),
          2_000,
        );
        client!.once('game:view', (view) => {
          clearTimeout(timeout);
          resolve(view);
        });
        client!.emit(
          'game:watch',
          { gameId },
          (acknowledgement: { ok?: boolean; error?: string }) => {
            if (!acknowledgement.ok) {
              clearTimeout(timeout);
              reject(
                new Error(
                  acknowledgement.error ?? 'Presenter watch was rejected',
                ),
              );
            }
          },
        );
      });
      await expect(viewPromise).resolves.toMatchObject({
        view: { id: gameId, private: null },
      });
    } finally {
      client?.disconnect();
      await realtime.close();
      if (httpServer.listening) {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      }
    }

    await request(app)
      .post('/api/presenter/pair')
      .send({ gameId, code })
      .expect(401, { error: 'Pairing could not be completed' });
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('does not create a presenter pairing unless the game enabled the presenter', async () => {
  const gameId = randomUUID();
  const created = eventSchema.parse({
    seq: 1,
    at: Date.now(),
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });
  await createGameWithEvent({
    event: created,
    actorId: 'coordinator:test',
    idempotencyKey: 'presenter-off-create',
    requestHash: 'presenter-off-create',
  });
  try {
    const app = createApp(async () => {}, {
      resolveViewer: () => ({ kind: 'coordinator' }),
      rateLimitSecret: 'integration-test-rate-limit-secret',
      secureCookies: true,
    });
    await request(app)
      .post(`/api/games/${gameId}/presenter-pairings`)
      .expect(404);
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('captures deterministic commands for replay through the real server', async () => {
  const [{ runCompleteGame }, { coreConfig }] = await Promise.all([
    import('../scripts/src/scenarios/simulate'),
    import('../scripts/src/scenarios/runner'),
  ]);
  const scenario = runCompleteGame({
    seed: 1901,
    strategy: 'random',
    config: coreConfig(5, 1, 'quick'),
    captureCommands: true,
  });
  expect(scenario.commands).toBeDefined();
  expect(scenario.commands?.[0]).toMatchObject({
    command: { type: 'CreateGame' },
    actor: { kind: 'coordinator' },
  });
});

it.each([5, 40])(
  'plays a complete %i-seat game through HTTP and private sockets across a server restart',
  async (playerCount) => {
    const [{ runCompleteGame, scenarioRandom }, { coreConfig }, engine] =
      await Promise.all([
        import('../scripts/src/scenarios/simulate'),
        import('../scripts/src/scenarios/runner'),
        import('../lib/engine/src/index'),
      ]);
    const seed = 20261014 + playerCount;
    const simulation = runCompleteGame({
      seed,
      strategy: 'random',
      config: coreConfig(playerCount, playerCount === 5 ? 1 : 6, 'quick'),
      captureCommands: true,
    });
    const commands = simulation.commands;
    if (!commands) throw new Error('Scenario command trace was not captured');
    const gameId = `scenario-${seed}`;
    const publicOrigin = 'https://turnstone.stackstoneconsulting.co.uk';
    await db.execute(sql`delete from games where id = ${gameId}`);
    const statesByVersion = new Map<
      number,
      NonNullable<ReturnType<typeof engine.evolve>>
    >();
    let expectedState: ReturnType<typeof engine.evolve> | null = null;
    for (const event of simulation.events) {
      expectedState = engine.evolve(expectedState, event);
      if (expectedState)
        statesByVersion.set(expectedState.version, expectedState);
    }
    const canonicalJson = (value: unknown): string => {
      if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(',')}]`;
      if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>).sort(
          ([left], [right]) => left.localeCompare(right),
        );
        return `{${entries
          .map(
            ([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`,
          )
          .join(',')}}`;
      }
      return JSON.stringify(value) ?? 'undefined';
    };

    let now = commands[0]!.now;
    const serverRandom = scenarioRandom(seed);
    let activeRealtime: Awaited<ReturnType<typeof attachRealtime>> | undefined;
    const socketClients: ClientSocket[] = [];
    const projectionErrors: string[] = [];
    const createRuntime = async () => {
      const app = createApp(async () => {}, {
        resolveViewer: (request) => {
          const seatId = request.header('x-test-seat');
          return seatId
            ? { kind: 'player' as const, seatId }
            : { kind: 'coordinator' as const };
        },
        publishGame: (publishedGameId) =>
          activeRealtime?.publishGame(publishedGameId) ?? Promise.resolve(),
        allowedOrigins: [publicOrigin],
        rateLimitSecret: 'full-stack-test-rate-limit-secret',
        consumeRateLimit: async () => true,
        testOnlyNow: () => now,
        testOnlyRandom: serverRandom,
      });
      const server = createServer(app);
      const realtime = await attachRealtime(server, {
        allowedOrigins: [publicOrigin],
        resolveViewer: (headers) => {
          const seatId = headers['x-test-seat'];
          return typeof seatId === 'string'
            ? { kind: 'player' as const, seatId }
            : { kind: 'visitor' as const };
        },
      });
      activeRealtime = realtime;
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Full-game test server did not bind a TCP port');
      return { server, realtime, url: `http://127.0.0.1:${address.port}` };
    };
    const closeRuntime = async (
      runtime: Awaited<ReturnType<typeof createRuntime>>,
    ) => {
      for (const client of socketClients.splice(0)) client.disconnect();
      await runtime.realtime.close();
      if (runtime.server.listening) {
        await new Promise<void>((resolve) =>
          runtime.server.close(() => resolve()),
        );
      }
    };
    const connectPlayers = async (
      runtime: Awaited<ReturnType<typeof createRuntime>>,
    ) => {
      const seatIds = Array.from(
        { length: Math.min(playerCount, 5) },
        (_, index) => `seat-${index + 1}`,
      );
      await Promise.all(
        seatIds.map(async (seatId) => {
          const client = socketIo(runtime.url, {
            transports: ['websocket'],
            extraHeaders: {
              origin: publicOrigin,
              'x-test-seat': seatId,
            },
            auth: { gameId },
            reconnection: false,
          });
          socketClients.push(client);
          client.on(
            'game:view',
            (payload: { version: number; view: unknown }) => {
              const state = statesByVersion.get(payload.version);
              if (!state) {
                projectionErrors.push(
                  `Unknown view version ${payload.version}`,
                );
                return;
              }
              const expected = engine.viewFor(
                { kind: 'player', seatId },
                state,
              );
              if (canonicalJson(payload.view) !== canonicalJson(expected)) {
                const actual = payload.view as Record<string, unknown>;
                const expectedRecord = expected as Record<string, unknown>;
                const fields = [
                  ...new Set([
                    ...Object.keys(actual),
                    ...Object.keys(expectedRecord),
                  ]),
                ].filter(
                  (key) =>
                    JSON.stringify(actual[key]) !==
                    JSON.stringify(expectedRecord[key]),
                );
                projectionErrors.push(
                  `Projection mismatch for ${seatId} at ${payload.version}: ${fields.join(',')}`,
                );
              }
            },
          );
          await new Promise<void>((resolve, reject) => {
            client.once('connect', resolve);
            client.once('connect_error', reject);
          });
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error(`Socket view timed out for ${seatId}`)),
              3_000,
            );
            client.once('game:view', () => {
              clearTimeout(timeout);
              resolve();
            });
            client.emit(
              'game:watch',
              { gameId },
              (acknowledgement: { ok?: boolean; error?: string }) => {
                if (!acknowledgement.ok) {
                  clearTimeout(timeout);
                  reject(
                    new Error(
                      acknowledgement.error ?? `Watch rejected for ${seatId}`,
                    ),
                  );
                }
              },
            );
          });
        }),
      );
    };

    let runtime = await createRuntime();
    let restarted = false;
    let latencyInjected = false;
    let lastResponse:
      { version: number; view: Record<string, unknown> } | undefined;
    try {
      const csrfResponse = await request(runtime.url)
        .get('/api/csrf')
        .set('Origin', publicOrigin);
      expect(csrfResponse.status).toBe(200);
      const csrfToken = csrfResponse.body.csrfToken as string;
      const browserHeaders = {
        Origin: publicOrigin,
        Cookie: `turnstone-csrf=${csrfToken}`,
        'X-CSRF-Token': csrfToken,
      };
      for (let index = 0; index < commands.length; index++) {
        const entry = commands[index]!;
        const commandType = entry.command.type;
        if (commandType === 'StartGame' && socketClients.length === 0)
          await connectPlayers(runtime);
        if (commandType === 'SubmitVote' && !restarted) {
          await closeRuntime(runtime);
          runtime = await createRuntime();
          await connectPlayers(runtime);
          restarted = true;
        }
        if (commandType === 'SubmitVote' && !latencyInjected) {
          // Simulate a 2-second one-way connection stall before the request arrives.
          await new Promise((resolve) => setTimeout(resolve, 2_000));
          latencyInjected = true;
        }
        now = entry.now;
        const actorHeader =
          entry.actor.kind === 'player'
            ? { 'x-test-seat': entry.actor.seatId }
            : { 'x-test-coordinator': 'true' };
        const path =
          commandType === 'CreateGame'
            ? '/api/games'
            : `/api/games/${gameId}/commands`;
        const response = await request(runtime.url)
          .post(path)
          .set({ ...browserHeaders, ...actorHeader })
          .send(entry.command);
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
        expect(response.headers['access-control-allow-origin']).toBe(
          publicOrigin,
        );
        expect(response.headers['access-control-allow-credentials']).toBe(
          'true',
        );
        lastResponse = response.body as typeof lastResponse;
        const expected = statesByVersion.get(response.body.version as number);
        expect(expected).toBeDefined();
        const viewer =
          entry.actor.kind === 'player'
            ? { kind: 'player' as const, seatId: entry.actor.seatId }
            : { kind: 'coordinator' as const };
        const expectedView = engine.viewFor(viewer, expected!);
        if (canonicalJson(response.body.view) !== canonicalJson(expectedView)) {
          const persisted = await readGameEvents(gameId);
          const difference = persisted.findIndex(
            (event, eventIndex) =>
              canonicalJson(event) !==
              canonicalJson(simulation.events[eventIndex]),
          );
          throw new Error(
            `View mismatch at command ${index} (${String(commandType)}), version ${String(response.body.version)}; first event divergence ${difference}: ${JSON.stringify(persisted[difference] ?? null)} vs ${JSON.stringify(simulation.events[difference] ?? null)}`,
          );
        }

        if (commandType === 'CreateGame') {
          const duplicate = await request(runtime.url)
            .post('/api/games')
            .set({ ...browserHeaders, 'x-test-coordinator': 'true' })
            .send(entry.command);
          expect(duplicate.status).toBeGreaterThanOrEqual(200);
          expect(duplicate.status).toBeLessThan(300);
          expect(duplicate.body.version).toBe(response.body.version);
        }
        if (index === 0 && commands.length > 1) {
          const nextCommand = commands[1]!.command;
          const staleCommand = {
            ...nextCommand,
            idempotencyKey: 'reordered-stale-command',
            expectedVersion: 0,
          };
          const stale = await request(runtime.url)
            .post(`/api/games/${gameId}/commands`)
            .set({ ...browserHeaders, 'x-test-coordinator': 'true' })
            .send(staleCommand);
          expect(stale.status).toBe(409);
        }
      }
      expect(restarted).toBe(true);
      expect(latencyInjected).toBe(true);
      expect(lastResponse?.view.phase).toBe('FINISHED');
      const persistedEvents = await readGameEvents(gameId);
      const eventDifference = persistedEvents.findIndex(
        (event, index) =>
          canonicalJson(event) !== canonicalJson(simulation.events[index]),
      );
      if (
        eventDifference >= 0 ||
        persistedEvents.length !== simulation.events.length
      ) {
        throw new Error(
          `Engine/API event divergence at ${eventDifference < 0 ? Math.min(persistedEvents.length, simulation.events.length) : eventDifference}: ${persistedEvents[eventDifference]?.type ?? 'missing'} vs ${simulation.events[eventDifference]?.type ?? 'missing'}`,
        );
      }
      await Promise.all(
        socketClients.map(
          (client) =>
            new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => {
                client.off('game:view', isCurrent);
                reject(new Error('Socket did not resynchronise to FINISHED'));
              }, 5_000);
              const isCurrent = (payload: {
                version: number;
                view: unknown;
              }) => {
                if (payload.version >= simulation.state.version) {
                  clearTimeout(timeout);
                  client.off('game:view', isCurrent);
                  resolve();
                }
              };
              client.on('game:view', isCurrent);
              client.emit(
                'game:watch',
                { gameId },
                (acknowledgement: { ok?: boolean; error?: string }) => {
                  if (!acknowledgement.ok) {
                    clearTimeout(timeout);
                    client.off('game:view', isCurrent);
                    reject(
                      new Error(
                        acknowledgement.error ??
                          'Final presenter/player watch was rejected',
                      ),
                    );
                  }
                },
              );
            }),
        ),
      );
      expect(projectionErrors).toEqual([]);
      expect(lastResponse?.view.winner).toBe(simulation.state.winner);
    } finally {
      await closeRuntime(runtime);
      await db.execute(sql`delete from games where id = ${gameId}`);
    }
  },
  120_000,
);
