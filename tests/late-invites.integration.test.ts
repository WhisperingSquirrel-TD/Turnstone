import { randomUUID } from 'node:crypto';
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
import { hashSeatPin } from '../lib/security/src/seat-pin';
import { consumeRateLimit } from '../lib/db/src/rate-limit';

afterAll(() => pool.end());

async function startedGame(
  lateJoining: 'never' | 'first-vote' | 'cycle' = 'first-vote',
) {
  const gameId = randomUUID();
  const now = Date.now() + 86_400_000;
  await createGameWithEvent({
    event: eventSchema.parse({
      type: 'GameCreated',
      id: gameId,
      config: gameConfigSchema.parse({
        basics: { coCoordinators: 0 },
        players: { count: 6, lateJoining, lateJoinCycle: 1 },
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
    consumeRateLimit: (bucket, limit, window) => {
      rateLimitBuckets.add(bucket);
      return consumeRateLimit(bucket, limit, window, now + 1000);
    },
    publicBaseUrl: 'https://turnstone.test',
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
    expect(cookies.some((cookie) => cookie.startsWith('turnstone-seat-'))).toBe(
      false,
    );
    expect(replay(await readGameEvents(gameId)).seats).toHaveLength(5);
    for (let retry = 0; retry < 4; retry += 1) {
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
    const pin = await hashSeatPin('1234');
    await inviteStore.createSeatAccess({
      gameId,
      seatId: 'seat-0',
      pinSalt: pin.salt,
      pinHash: pin.hash,
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
