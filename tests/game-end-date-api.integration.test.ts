import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { pool } from '@workspace/db';
import { runClearDown } from '@workspace/db/clear-down';
import { gameConfigSchema } from '../lib/shared/src/index';
import {
  addDays,
  latestGameEndDate,
  ukCalendarDate,
} from '../lib/shared/src/game-end-date';
import { createApp } from '../artifacts/api-server/src/app';

// Owner rule (28 October 2026, D117): every real game has a required end
// date from UK today up to six months ahead; anyone opening a cleared game
// is told it has ended and been cleared.
const created: string[] = [];
afterAll(async () => {
  await pool.query('delete from games where id = any($1::text[])', [created]);
  await pool.query(
    'delete from game_tombstones where game_id = any($1::text[])',
    [created],
  );
  await pool.end();
});

const coordinatorApp = () =>
  createApp(async () => {}, {
    resolveViewer: () => ({ kind: 'coordinator' }),
    resolveCoordinatorViewer: () => ({ kind: 'coordinator' }),
    rateLimitSecret: 'integration-test-rate-limit-secret',
    publicBaseUrl: 'https://oathstone.test',
    consumeRateLimit: async () => true,
  });

async function createGame(endDate?: string) {
  const gameId = randomUUID();
  created.push(gameId);
  const response = await request(coordinatorApp())
    .post('/api/games')
    .send({
      type: 'CreateGame',
      id: gameId,
      idempotencyKey: `end-date-${gameId}`,
      config: gameConfigSchema.parse({}),
      ...(endDate === undefined ? {} : { endDate }),
    });
  return { gameId, response };
}

describe('creating a real game', () => {
  const today = ukCalendarDate(Date.now());

  it('requires an end date', async () => {
    const { response } = await createGame();
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Choose the last day of your game.',
    });
  });

  it('rejects a past date and one beyond six months, with plain messages', async () => {
    const past = await createGame(addDays(today, -1));
    expect(past.response.status).toBe(400);
    expect(past.response.body.error).toBe(
      'The last day of your game cannot be in the past.',
    );
    const late = await createGame(addDays(latestGameEndDate(Date.now()), 1));
    expect(late.response.status).toBe(400);
    expect(late.response.body.error).toBe(
      'The last day of your game must be within six months of today.',
    );
  });

  it('accepts today and shows the end date in every full view', async () => {
    const { gameId, response } = await createGame(today);
    expect(response.status).toBe(201);
    const view = await request(coordinatorApp()).get(
      `/api/games/${gameId}/coordinator/view`,
    );
    expect(view.body.view.gameEndDate).toBe(today);
  });
});

describe('changing the end date', () => {
  it('lets the organiser move it later or earlier, within six months of today', async () => {
    const today = ukCalendarDate(Date.now());
    const { gameId } = await createGame(today);
    const app = coordinatorApp();
    const later = addDays(today, 10);
    const moved = await request(app)
      .put(`/api/games/${gameId}/end-date`)
      .send({ endDate: later });
    expect(moved.status).toBe(200);
    expect(moved.body).toEqual({ gameEndDate: later });
    const tooLate = await request(app)
      .put(`/api/games/${gameId}/end-date`)
      .send({ endDate: addDays(latestGameEndDate(Date.now()), 1) });
    expect(tooLate.status).toBe(400);
    const earlier = await request(app)
      .put(`/api/games/${gameId}/end-date`)
      .send({ endDate: today });
    expect(earlier.status).toBe(200);
  });

  it('is refused to anyone but the organiser', async () => {
    const { gameId } = await createGame(ukCalendarDate(Date.now()));
    const player = createApp(async () => {}, {
      resolveViewer: () => ({ kind: 'player', seatId: 'seat-x' }),
      resolveCoordinatorViewer: () => ({ kind: 'visitor' }),
      rateLimitSecret: 'integration-test-rate-limit-secret',
      consumeRateLimit: async () => true,
    });
    const refused = await request(player)
      .put(`/api/games/${gameId}/end-date`)
      .send({ endDate: ukCalendarDate(Date.now()) });
    expect(refused.status).toBe(401);
  });
});

describe('a cleared game', () => {
  it('tells anyone opening an old link that it has ended and been cleared', async () => {
    const today = ukCalendarDate(Date.now());
    const { gameId } = await createGame(today);
    // Clear it as if the nightly run happened two days later.
    const result = await runClearDown({
      now: Date.now() + 2 * 24 * 3_600_000,
      mode: 'delete',
      realGames: true,
      testOnlyGameIds: [gameId],
    });
    expect(result).toMatchObject({ deleted: 1 });
    const app = coordinatorApp();
    for (const path of [
      `/api/games/${gameId}/view`,
      `/api/games/${gameId}/coordinator/view`,
    ]) {
      const response = await request(app).get(path);
      expect(response.status).toBe(410);
      expect(response.body).toEqual({
        error: 'This game has ended and been cleared.',
      });
    }
    const unknown = await request(app).get(`/api/games/${randomUUID()}/view`);
    expect(unknown.status).toBe(404);
  });
});
