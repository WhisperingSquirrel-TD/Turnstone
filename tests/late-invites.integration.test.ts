import { randomUUID } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { afterAll, expect, it, vi } from 'vitest';
import request from 'supertest';
import { sql } from 'drizzle-orm';
import { db, pool } from '@workspace/db';
import {
  appendGameEvents,
  createGameWithEvent,
  readGameEvents,
} from '@workspace/db/game-store';
import { replay } from '../lib/engine/src/index';
import { eventSchema, gameConfigSchema } from '../lib/shared/src/index';
import { createApp } from '../artifacts/api-server/src/app';
import * as inviteStore from '../lib/db/src/seat-access-store';
import * as pinSecurity from '../lib/security/src/seat-pin';
import { hashSeatPin, verifySeatPin } from '../lib/security/src/seat-pin';
import { consumeRateLimit } from '../lib/db/src/rate-limit';

afterAll(() => pool.end());

const pinPepperConfig = {
  current: {
    version: 2,
    secret: 'current-test-pin-pepper-0123456789abcdef',
  },
  previous: {
    version: 1,
    secret: 'p'.repeat(32),
  },
};

async function startedGame(
  lateJoining: 'never' | 'first-vote' | 'cycle' = 'first-vote',
  useEnvironmentPepper = false,
  options: { playerCount?: number; bypassRateLimits?: boolean } = {},
) {
  const gameId = randomUUID();
  const now = Date.now() + 86_400_000;
  await createGameWithEvent({
    event: eventSchema.parse({
      type: 'GameCreated',
      id: gameId,
      config: gameConfigSchema.parse({
        basics: { coCoordinators: 0 },
        players: {
          count: options.playerCount ?? 6,
          lateJoining,
          lateJoinCycle: 1,
        },
        traitors: { number: 1, sleeper: false, recruitment: 'off' },
      }),
      seq: 1,
      at: now,
      schemaVersion: 1,
    }),
    actorId: 'coordinator:test',
    idempotencyKey: 'late-create',
    requestHash: 'late-create',
  });
  await appendGameEvents({
    gameId,
    expectedVersion: 1,
    actorId: 'coordinator:test',
    idempotencyKey: 'late-lobby',
    requestHash: 'late-lobby',
    events: [
      eventSchema.parse({
        type: 'PhaseChanged',
        phase: 'LOBBY',
        deadline: null,
        shadowEndAt: null,
        cycle: 0,
        seq: 2,
        at: now,
        schemaVersion: 1,
      }),
      ...Array.from({ length: 5 }, (_, index) =>
        eventSchema.parse({
          type: 'SeatJoined',
          seatId: `seat-${index}`,
          name: `Player ${index + 1}`,
          seq: index + 3,
          at: now,
          schemaVersion: 1,
        }),
      ),
    ],
  });
  const rateLimitBuckets = new Set<string>();
  const app = createApp(async () => {}, {
    resolveViewer: (req) => {
      const kind = req.headers['x-test-viewer'];
      if (kind === 'player' || kind === 'ghost')
        return { kind, seatId: 'seat-0' };
      if (kind === 'visitor' || kind === 'presenter' || kind === 'admin')
        return { kind };
      return { kind: 'coordinator' };
    },
    rateLimitSecret: `test-only-${gameId}`,
    ...(useEnvironmentPepper ? {} : { pinPepperConfig }),
    consumeRateLimit: async (bucket, limit, window) => {
      rateLimitBuckets.add(bucket);
      if (options.bypassRateLimits) return true;
      return consumeRateLimit(bucket, limit, window, now + 1000);
    },
    publicBaseUrl: 'https://oathstone.test',
    secureCookies: true,
    testOnlyNow: () => now + 1000,
  });
  const original = await request(app)
    .post(`/api/games/${gameId}/invites`)
    .expect(201);
  const start = await request(app)
    .post(`/api/games/${gameId}/commands`)
    .send({
      type: 'StartGame',
      expectedVersion: 7,
      idempotencyKey: 'late-start',
    })
    .expect(200);
  return {
    app,
    gameId,
    now,
    original: original.body,
    version: start.body.version,
    rateLimitBuckets,
  };
}

it('measures a reduced real-HTTP join storm with stored, verifiable PIN hashes', async () => {
  const fixture = await startedGame('first-vote', false, {
    playerCount: 40,
    bypassRateLimits: true,
  });
  const verifySpy = vi.spyOn(pinSecurity, 'verifySeatPinWithRotation');
  const { app, gameId } = fixture;
  try {
    const freshInvite = await request(app)
      .post(`/api/games/${gameId}/late-invites`)
      .expect(201);
    const inviteToken = new URL(freshInvite.body.joinUrl).hash.slice(1);
    const joinCount = 32;
    const joins = Array.from({ length: joinCount }, (_, index) => ({
      inviteToken,
      name: `Capacity guest ${index + 1}`,
      pin: String(1000 + index),
      idempotencyKey: `capacity-join-${index + 1}`,
    }));
    const startedAt = performance.now();
    const responses = await Promise.all(
      joins.map((body) =>
        request(app).post(`/api/games/${gameId}/join`).send(body),
      ),
    );
    const durationMs = performance.now() - startedAt;
    expect(responses.map((response) => response.status)).toEqual(
      Array.from({ length: joinCount }, () => 202),
    );
    expect(verifySpy.mock.calls.length).toBe(0);
    await request(app)
      .post(`/api/games/${gameId}/join`)
      .send({ ...joins[0], pin: '9999' })
      .expect(401);
    expect(verifySpy.mock.calls.length).toBe(1);

    for (const [index, response] of responses.entries()) {
      const joinRequest = await inviteStore.findGameJoinRequestById(
        gameId,
        response.body.requestId,
      );
      expect(joinRequest).not.toBeNull();
      const access = await inviteStore.getSeatAccess(
        gameId,
        joinRequest!.seatId,
      );
      expect(access).not.toBeNull();
      await expect(
        verifySeatPin(
          joins[index]!.pin,
          access!.pinSalt,
          access!.pinHash,
          pinPepperConfig.current,
        ),
      ).resolves.toBe(true);
    }

    const storedHashes = await pool.query<{
      rows: string;
      unique_hashes: string;
    }>(
      `select count(*)::text as rows,
              count(distinct pin_hash)::text as unique_hashes
       from game_seat_access
       where game_id = $1 and pin_pepper_version = $2`,
      [gameId, pinPepperConfig.current.version],
    );
    expect(Number(storedHashes.rows[0]?.rows)).toBe(joinCount);
    expect(Number(storedHashes.rows[0]?.unique_hashes)).toBe(joinCount);

    const hashStartedAt = performance.now();
    const directHashes = await Promise.all(
      joins.map((_, index) =>
        hashSeatPin(String(2000 + index), pinPepperConfig.current),
      ),
    );
    const hashDurationMs = performance.now() - hashStartedAt;
    expect(new Set(directHashes.map((hash) => hash.hash)).size).toBe(joinCount);

    const joinsPerSecond = joinCount / (durationMs / 1000);
    const hashesPerSecond = joinCount / (hashDurationMs / 1000);
    const cores = availableParallelism();
    const result = {
      joinCount,
      durationMs: Number(durationMs.toFixed(1)),
      joinsPerSecond: Number(joinsPerSecond.toFixed(2)),
      hostCores: cores,
      joinsPerSecondPerCore: Number((joinsPerSecond / cores).toFixed(2)),
      directHashDurationMs: Number(hashDurationMs.toFixed(1)),
      hashesPerSecond: Number(hashesPerSecond.toFixed(2)),
      hashesPerSecondPerCore: Number((hashesPerSecond / cores).toFixed(2)),
      threadpoolSize: process.env.UV_THREADPOOL_SIZE ?? 'Node default',
    };
    if (process.env.CAPACITY_REPORT === '1') {
      console.info(`[pin-join-capacity] ${JSON.stringify(result)}`);
    }
    expect(durationMs).toBeLessThan(30_000);
    expect(joinsPerSecond).toBeGreaterThan(0);
    expect(hashesPerSecond).toBeGreaterThan(0);
  } finally {
    verifySpy.mockRestore();
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('admits an always-Faithful late seat by fresh link only, with approval and join limits', async () => {
  const fixture = await startedGame();
  const { app, gameId } = fixture;
  try {
    for (const kind of ['visitor', 'player', 'ghost', 'presenter', 'admin']) {
      await request(app)
        .post(`/api/games/${gameId}/late-invites`)
        .set('X-Test-Viewer', kind)
        .expect(401);
    }
    await request(app)
      .post(`/api/games/${gameId}/late-invites`)
      .send({ role: 'traitor' })
      .expect(400);
    await request(app).post('/api/games/missing-game/late-invites').expect(404);
    const fresh = await request(app)
      .post(`/api/games/${gameId}/late-invites`)
      .expect(201);
    expect(Object.keys(fresh.body).sort()).toEqual(['gameId', 'joinUrl']);
    const stored = await pool.query<{ display_code: string | null }>(
      'select display_code from game_invites where game_id = $1',
      [gameId],
    );
    expect(stored.rows[0]?.display_code).toBeNull();
    await request(app)
      .post('/api/join')
      .send({
        shortCode: fixture.original.shortCode,
        name: 'Late guest',
        pin: '1234',
        idempotencyKey: 'old-code',
      })
      .expect(404);
    await request(app)
      .post(`/api/games/${gameId}/join`)
      .send({
        inviteToken: new URL(fixture.original.joinUrl).hash.slice(1),
        name: 'Late guest',
        pin: '1234',
        idempotencyKey: 'old-link',
      })
      .expect(404);
    const body = {
      inviteToken: new URL(fresh.body.joinUrl).hash.slice(1),
      name: 'Late guest',
      pin: '1234',
      idempotencyKey: 'fresh-late-join',
    };
    const pending = await request(app)
      .post(`/api/games/${gameId}/join`)
      .send(body)
      .expect(202);
    expect(pending.body).toEqual({
      requestId: expect.any(String),
      status: 'pending',
    });
    const setCookie = pending.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
    expect(cookies.some((cookie) => cookie.startsWith('oathstone-seat-'))).toBe(
      false,
    );
    expect(replay(await readGameEvents(gameId)).seats).toHaveLength(5);
    for (let retry = 0; retry < 39; retry += 1) {
      const repeated = await request(app)
        .post(`/api/games/${gameId}/join`)
        .send(body)
        .expect(202);
      expect(repeated.body).toEqual(pending.body);
    }
    await request(app).post(`/api/games/${gameId}/join`).send(body).expect(429);
    const requests = await request(app)
      .get(`/api/games/${gameId}/join-requests`)
      .expect(200);
    expect(requests.body.requests).toHaveLength(1);
    const approval = await request(app)
      .post(
        `/api/games/${gameId}/join-requests/${pending.body.requestId}/decision`,
      )
      .send({ decision: 'approve', expectedVersion: fixture.version })
      .expect(200);
    const state = replay(await readGameEvents(gameId));
    expect(
      state.seats.find((seat) => seat.id === approval.body.seatId),
    ).toMatchObject({
      name: 'Late guest',
      role: 'faithful',
      publicRole: true,
      status: 'alive',
    });
    const status = await request(app)
      .get(`/api/join-requests/${pending.body.requestId}`)
      .set('Cookie', cookies[0]!.split(';')[0]!)
      .expect(200);
    expect(status.body.status).toBe('approved');
    expect(status.body.game.view.private).toBeNull();
    await request(app).post(`/api/games/${gameId}/late-invites`).expect(409);
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('limits fresh invitation rotation and invalidates the previous link', async () => {
  const { app, gameId, now, rateLimitBuckets } = await startedGame();
  try {
    const tokens: string[] = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const fresh = await request(app)
        .post(`/api/games/${gameId}/late-invites`)
        .expect(201);
      tokens.push(new URL(fresh.body.joinUrl).hash.slice(1));
    }
    expect(new Set(tokens).size).toBe(10);
    const persisted = await pool.query<{ window_started_at: Date }>(
      'select window_started_at from api_rate_limits where bucket_hash = any($1::text[])',
      [[...rateLimitBuckets]],
    );
    expect(persisted.rows).toHaveLength(rateLimitBuckets.size);
    expect(persisted.rows.length).toBeGreaterThan(0);
    expect(
      persisted.rows.every(
        (bucket) => bucket.window_started_at.getTime() === now + 1000,
      ),
    ).toBe(true);
    await request(app).post(`/api/games/${gameId}/late-invites`).expect(429);
    const join = (inviteToken: string) =>
      request(app).post(`/api/games/${gameId}/join`).send({
        inviteToken,
        name: 'Late guest',
        pin: '1234',
        idempotencyKey: 'rotated-link-join',
      });
    await join(tokens[0]!).expect(404);
    await join(tokens[9]!).expect(202);
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('fails closed without leaking invitation data on a database failure', async () => {
  const { app, gameId } = await startedGame();
  const insert = vi
    .spyOn(inviteStore, 'createGameInvite')
    .mockRejectedValueOnce(new Error('test-only database failure'));
  try {
    const response = await request(app)
      .post(`/api/games/${gameId}/late-invites`)
      .expect(503);
    expect(response.body).toEqual({ error: 'Service unavailable' });
  } finally {
    insert.mockRestore();
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it('recovers a seat after lobby closure and after a fresh link rotates without reopening joins', async () => {
  const { app, gameId, original } = await startedGame();
  try {
    const pin = await hashSeatPin('1234', pinPepperConfig.previous);
    await inviteStore.createSeatAccess({
      gameId,
      seatId: 'seat-0',
      pinSalt: pin.salt,
      pinHash: pin.hash,
      pinPepperVersion: pin.pepperVersion,
    });
    const recovery = {
      shortCode: original.shortCode,
      name: 'Player 1',
      pin: '1234',
    };
    await request(app)
      .post('/api/recover')
      .send({ ...recovery, pin: '9999' })
      .expect(401);
    const first = await request(app)
      .post('/api/recover')
      .send(recovery)
      .expect(200);
    expect(first.body.view).toMatchObject({
      id: gameId,
      viewerSeatId: 'seat-0',
      private: null,
    });
    const upgraded = await inviteStore.getSeatAccess(gameId, 'seat-0');
    expect(upgraded?.pinPepperVersion).toBe(pinPepperConfig.current.version);
    await expect(
      verifySeatPin(
        '1234',
        upgraded!.pinSalt,
        upgraded!.pinHash,
        pinPepperConfig.current,
      ),
    ).resolves.toBe(true);
    await request(app).post(`/api/games/${gameId}/late-invites`).expect(201);
    const next = await request(app)
      .post('/api/recover')
      .send(recovery)
      .expect(200);
    expect(next.body.view).toMatchObject({
      id: gameId,
      viewerSeatId: 'seat-0',
      private: null,
    });
    const sessions = await pool.query<{
      revoked_at: Date | null;
      token_hash: string;
    }>(
      'select revoked_at, token_hash from game_viewer_sessions where game_id = $1 and seat_id = $2',
      [gameId, 'seat-0'],
    );
    expect(sessions.rows).toHaveLength(2);
    expect(
      sessions.rows.filter((session) => session.revoked_at === null),
    ).toHaveLength(1);
    expect(
      new Set(sessions.rows.map((session) => session.token_hash)).size,
    ).toBe(2);
    await request(app)
      .post('/api/join')
      .send({
        shortCode: original.shortCode,
        name: 'Unapproved guest',
        pin: '1234',
        idempotencyKey: 'recovery-code-is-not-a-join-invite',
      })
      .expect(404);
  } finally {
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});

it.each(['never', 'first-vote', 'cycle', 'finished'] as const)(
  'rejects fresh late invitations outside the %s joining window',
  async (window) => {
    const fixture = await startedGame(window === 'finished' ? 'cycle' : window);
    const { app, gameId, now, version } = fixture;
    try {
      const fresh =
        window === 'never'
          ? null
          : await request(app)
              .post(`/api/games/${gameId}/late-invites`)
              .expect(201);
      if (window === 'finished') {
        await request(app)
          .post(`/api/games/${gameId}/commands`)
          .send({
            type: 'EndGameEarly',
            expectedVersion: version,
            idempotencyKey: 'late-end',
          })
          .expect(200);
      } else if (window !== 'never') {
        const events = [
          eventSchema.parse({
            type: 'PhaseChanged',
            phase: window === 'first-vote' ? 'VOTE' : 'DAWN',
            cycle: window === 'first-vote' ? 1 : 2,
            deadline: now + 60_000,
            shadowEndAt: null,
            seq: version + 1,
            at: now + 2000,
            schemaVersion: 1,
          }),
        ];
        if (window === 'first-vote') {
          events.push(
            eventSchema.parse({
              type: 'VoteClosed',
              target: null,
              revote: false,
              candidates: [],
              seq: version + 2,
              at: now + 3000,
              schemaVersion: 1,
            }),
          );
        }
        await appendGameEvents({
          gameId,
          expectedVersion: version,
          actorId: 'system:test',
          idempotencyKey: 'close-late-window',
          requestHash: 'close-late-window',
          events,
        });
      }
      if (fresh) {
        await request(app)
          .post(`/api/games/${gameId}/join`)
          .send({
            inviteToken: new URL(fresh.body.joinUrl).hash.slice(1),
            name: 'Too late',
            pin: '1234',
            idempotencyKey: 'closed-window-join',
          })
          .expect(window === 'finished' ? 404 : 409);
        const pending = await request(app)
          .get(`/api/games/${gameId}/join-requests`)
          .expect(200);
        expect(pending.body.requests).toHaveLength(0);
      }
      await request(app).post(`/api/games/${gameId}/late-invites`).expect(409);
    } finally {
      await db.execute(sql`delete from games where id = ${gameId}`);
    }
  },
);

it('uses the configured environment pepper and fails safely when it is missing', async () => {
  const { app, gameId } = await startedGame('first-vote', true);
  try {
    const fresh = await request(app)
      .post(`/api/games/${gameId}/late-invites`)
      .expect(201);
    const body = {
      inviteToken: new URL(fresh.body.joinUrl).hash.slice(1),
      name: 'Environment guest',
      pin: '1234',
      idempotencyKey: 'environment-pepper-join',
    };

    vi.stubEnv('PIN_PEPPER', '');
    await request(app).post(`/api/games/${gameId}/join`).send(body).expect(503);

    vi.stubEnv('PIN_PEPPER', 'environment-test-pin-pepper-0123456789');
    vi.stubEnv('PIN_PEPPER_VERSION', '1');
    await request(app).post(`/api/games/${gameId}/join`).send(body).expect(202);
  } finally {
    vi.unstubAllEnvs();
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});
