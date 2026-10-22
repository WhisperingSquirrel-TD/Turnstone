import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';
import { db, pool } from '@workspace/db';
import {
  appendGameEvents,
  createGameWithEvent,
  readGameEventsAfter,
  readLatestGameSnapshot,
} from '@workspace/db/game-store';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { createApp } from '../artifacts/api-server/src/app';
import { replayFrom } from '../lib/engine/src';
import { eventSchema } from '../lib/shared/src';
import { command, fixture } from './support/engine';

afterAll(async () => {
  await pool.end();
});

it('deduplicates exhausted slot-two shadow retries through HTTP and durable idempotency', async () => {
  const gameId = randomUUID();
  const game = fixture(5, {
    traitors: { number: 3, murders: 2, sleeper: false, recruitment: 'off' },
    endgame: { parity: false, size: 3 },
    missions: { enabled: true, shields: 'public' },
  });
  command(game, { type: 'StartGame' });
  // Model the same late-game protected first slot as the Q7 engine fixture.
  // Persist this constructed state as a real snapshot, not an injected loader.
  game.state = {
    ...game.state,
    id: gameId,
    phase: 'SHADOW',
    cycle: 1,
    phaseStarted: game.context.now - 120_000,
    deadline: game.context.now - 1,
    shadowEndAt: game.context.now - 1,
    shadowSlot: 1,
    shadowRound: 2,
    shields: ['s3'],
    seats: game.state.seats.map((seat, index) => ({
      ...seat,
      role: index < 3 ? 'traitor' : 'faithful',
      status: index === 4 ? 'departed' : 'alive',
    })),
    shadowPicks: ['s0', 's1', 's2'].map((seatId, index) => ({
      seatId,
      cycle: 1,
      slot: 1,
      round: 2,
      choice: 's3',
      seq: index + 1,
    })),
  };
  command(game, { type: 'AdvancePhase' });
  expect(game.state).toMatchObject({
    phase: 'SHADOW',
    shadowSlot: 2,
    shadowRound: 1,
    winner: null,
    murderResolutions: [{ slot: 1, chosen: 's3', outcome: 'protected' }],
  });
  expect(
    game.state.seats
      .filter((seat) => seat.status === 'alive' && seat.role === 'faithful')
      .map((seat) => seat.id),
  ).toEqual(['s3']);
  const before = structuredClone(game.state);
  const events = [
    eventSchema.parse({ ...game.events[0], id: gameId }),
    ...game.events.slice(1),
  ];
  const app = createApp(async () => {}, {
    resolveViewer: () => ({ kind: 'player', seatId: 's0' }),
  });
  const submission = {
    type: 'SubmitShadowChoice',
    slot: 2,
    choice: 's3', // The only Faithful was already chosen in slot one.
    expectedVersion: before.version,
    idempotencyKey: randomUUID(),
  };
  // Freeze only wall-clock metadata so the entire HTTP response is comparable.
  // Command decisions, persistence and idempotency all use production code.
  const clock = vi.spyOn(Date, 'now').mockReturnValue(game.context.now);
  try {
    expect(
      await createGameWithEvent({
        event: events[0]!,
        actorId: 'coordinator:q7-fixture',
        idempotencyKey: randomUUID(),
        requestHash: randomUUID(),
      }),
    ).toMatchObject({ ok: true, version: 1, duplicate: false });
    expect(
      await appendGameEvents({
        gameId,
        actorId: 'coordinator:q7-fixture',
        idempotencyKey: randomUUID(),
        requestHash: randomUUID(),
        expectedVersion: 1,
        events: events.slice(1),
        snapshot: { seq: before.version, state: before },
        deadline: { kind: before.phase, dueAt: before.deadline },
      }),
    ).toEqual({ ok: true, version: before.version, duplicate: false });
    expect((await readLatestGameSnapshot(gameId))?.state).toEqual(before);

    const first = await request(app)
      .post(`/api/games/${gameId}/commands`)
      .send(submission);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      version: before.version + 1,
      view: { id: gameId, phase: 'SHADOW', shadowSlot: 2, shadowRound: 1 },
    });
    const committed = await readGameEventsAfter(gameId, before.version);
    expect(committed).toEqual([
      expect.objectContaining({
        seq: before.version + 1,
        type: 'ShadowSubmitted',
        seatId: 's0',
        choice: 's3',
        slot: 2,
        round: 1,
      }),
    ]);

    // Keep the original (now stale) expectedVersion and request key on retries.
    for (let retry = 0; retry < 2; retry += 1) {
      const response = await request(app)
        .post(`/api/games/${gameId}/commands`)
        .send(submission);
      expect(response.status).toBe(first.status);
      expect(response.body).toEqual(first.body);
      expect(await readGameEventsAfter(gameId, before.version)).toEqual(
        committed,
      );
    }
    const persisted = replayFrom(
      before,
      await readGameEventsAfter(gameId, before.version),
    );
    expect(persisted.version).toBe(before.version + 1);
    expect(
      persisted.shadowPicks.filter(
        (pick) => pick.seatId === 's0' && pick.slot === 2 && pick.round === 1,
      ),
    ).toHaveLength(1);
    const records = await db.execute(sql`
      select resulting_version, response from game_idempotency
      where game_id = ${gameId} and actor_id = 'seat:s0'
        and key = ${submission.idempotencyKey}
    `);
    expect(records.rows).toEqual([
      {
        resulting_version: before.version + 1,
        response: { ok: true, version: before.version + 1, duplicate: false },
      },
    ]);
  } finally {
    clock.mockRestore();
    await db.execute(sql`delete from games where id = ${gameId}`);
  }
});
