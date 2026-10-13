import { afterAll, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { db, pool } from '@workspace/db';
import { io as socketIo, type Socket as ClientSocket } from 'socket.io-client';
import { gameConfigSchema, eventSchema } from '../lib/shared/src';
import { sql } from 'drizzle-orm';
import { createApp } from '../artifacts/api-server/src/app';
import { decide, evolve, replay, replayFrom } from '../lib/engine/src';
import { gameRandom } from '../lib/security/src/game-random';
import { attachRealtime } from '../artifacts/api-server/src/realtime';
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

afterAll(async () => {
  await pool.end();
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
      to_regclass('public.api_rate_limits')::text as api_rate_limits
  `);

  expect(result.rows[0]).toEqual({
    games: 'games',
    game_events: 'game_events',
    game_snapshots: 'game_snapshots',
    game_idempotency: 'game_idempotency',
    game_deadlines: 'game_deadlines',
    api_rate_limits: 'api_rate_limits',
  });
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
  const now = Date.now();
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
  const now = Date.now();
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
  const createdEvent = eventSchema.parse({
    seq: 1,
    at: 500,
    schemaVersion: 1,
    type: 'GameCreated',
    id: gameId,
    config: gameConfigSchema.parse({}),
  });
  const phaseEvent = eventSchema.parse({
    seq: 2,
    at: 750,
    schemaVersion: 1,
    type: 'PhaseChanged',
    phase: 'DRAFT',
    deadline: 1_500,
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
      deadline: { kind: 'DRAFT', dueAt: 1_500 },
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
        now: 1_000,
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

    await createDeadlineScheduler({ now: () => 2_000 }).runOnce();
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
        now: 2_000,
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

    await createDeadlineScheduler({ now: () => 2_499 }).runOnce();
    expect(replay(await readGameEvents(gameId)).phase).toBe('DRAFT');
    await createDeadlineScheduler({ now: () => 2_500 }).runOnce();
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

it('creates and advances a game through authenticated HTTP with idempotent replay', async () => {
  const gameId = randomUUID();
  const published: string[] = [];
  const app = createApp(async () => {}, {
    resolveViewer: () => ({ kind: 'coordinator' }),
    publishGame: async (id) => {
      published.push(id);
    },
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
      phase: 'DRAFT',
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
    const updatePromises = clients.map(
      (client) =>
        new Promise<{ version: number; view: { seats: unknown[] } }>(
          (resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error('Socket fan-out timed out')),
              2_000,
            );
            client.once('game:view', (view) => {
              clearTimeout(timeout);
              resolve(view);
            });
          },
        ),
    );
    await publisherRealtime.publishGame(gameId);
    const updatedViews = await Promise.all(updatePromises);
    expect(updatedViews.map((view) => view.version)).toEqual(
      Array(seatCount).fill(seatCount + 2),
    );
    expect(updatedViews.map((view) => view.view.seats.length)).toEqual(
      Array(seatCount).fill(seatCount),
    );
  } finally {
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
