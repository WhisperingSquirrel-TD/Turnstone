import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { db, pool } from '@workspace/db';
import {
  createGameWithEvent,
  readGameEndDate,
  updateGameEndDate,
} from '@workspace/db/game-store';
import { runClearDown } from '@workspace/db/clear-down';
import { eventSchema, gameConfigSchema } from '../lib/shared/src/index';

// Other suites share this database (and claim every due deadline), so remove
// every game and tombstone this file creates.
const created = new Set<string>();
afterAll(async () => {
  const ids = [...created];
  await pool.query('delete from games where id = any($1::text[])', [ids]);
  await pool.query(
    'delete from game_tombstones where game_id = any($1::text[])',
    [ids],
  );
  await pool.end();
});

// Owner rule (28 October 2026, D117): real games are deleted the day after
// their UK end date; practice games 24 hours after their last activity.
// 05:00 UTC on 28 October 2026 is 05:00 in the UK (GMT), after the 04:00 run.
const now = Date.parse('2026-10-28T05:00:00Z');
const hour = 3_600_000;

async function realGame(endDate?: string, at = now - 2 * 24 * hour) {
  const gameId = randomUUID();
  created.add(gameId);
  await createGameWithEvent({
    event: eventSchema.parse({
      type: 'GameCreated',
      id: gameId,
      config: gameConfigSchema.parse({}),
      seq: 1,
      at,
      schemaVersion: 1,
    }),
    actorId: 'coordinator:test',
    idempotencyKey: `cleardown-${gameId}`,
    requestHash: `cleardown-${gameId}`,
    ...(endDate ? { endDate } : {}),
  });
  return gameId;
}

async function practiceGame(lastActivity: number) {
  const gameId = randomUUID();
  created.add(gameId);
  await db.execute(sql`
    insert into games (id, config, version, status, created_at, updated_at)
    values (${gameId}, ${JSON.stringify({ rehearsal: { enabled: true } })}::jsonb,
            1, 'active', ${new Date(lastActivity)}, ${new Date(lastActivity)})`);
  return gameId;
}

const hex = () => randomBytes(32).toString('hex');

/** Puts one row for the game in every table that holds game data. */
async function fillEveryGameTable(gameId: string) {
  const later = new Date(now + 24 * hour);
  await db.execute(sql`insert into game_snapshots (game_id, seq, state)
    values (${gameId}, 1, '{}'::jsonb)`);
  await db.execute(sql`insert into game_coordinator_capabilities (game_id, token_hash, expires_at)
    values (${gameId}, ${hex()}, ${later})`);
  await db.execute(sql`insert into game_undo_windows (game_id, action_version, state, expires_at)
    values (${gameId}, 1, '{}'::jsonb, ${later})`);
  await db.execute(sql`insert into game_deadlines (game_id, kind, version, due_at, completed_at)
    values (${gameId}, 'LOBBY', 1, ${new Date(now - hour)}, ${new Date(now - hour)})`);
  await db.execute(sql`insert into game_seat_access (game_id, seat_id, pin_salt, pin_hash)
    values (${gameId}, 'seat-1', 'salt', 'hash')`);
  await db.execute(sql`insert into game_viewer_sessions (token_hash, game_id, seat_id, expires_at)
    values (${hex()}, ${gameId}, 'seat-1', ${later})`);
  await db.execute(sql`insert into game_invites (game_id, link_token_hash, short_code_hash, recovery_code_hash, display_code)
    values (${gameId}, ${hex()}, ${hex()}, ${hex()}, 'ABC234')`);
  await db.execute(sql`insert into game_join_requests (id, game_id, seat_id, request_token_hash, name, expires_at)
    values (${randomUUID()}, ${gameId}, 'seat-1', ${hex()}, 'Guest', ${later})`);
  await db.execute(sql`insert into game_seat_connections (connection_id, game_id, seat_id, last_seen_at)
    values (${randomUUID()}, ${gameId}, 'seat-1', ${new Date(now - hour)})`);
  await db.execute(sql`insert into game_coordinator_delegates (game_id, seat_id)
    values (${gameId}, 'seat-1')`);
  const takeoverId = randomUUID();
  await db.execute(sql`insert into game_coordinator_takeovers (id, game_id, requester_seat_id, expires_at)
    values (${takeoverId}, ${gameId}, 'seat-1', ${later})`);
  await db.execute(sql`insert into game_coordinator_takeover_votes (request_id, seat_id, approved)
    values (${takeoverId}, 'seat-1', true)`);
  await db.execute(sql`insert into game_coordinator_handoffs (id, game_id, target_seat_id, code_hash, expires_at)
    values (${randomUUID()}, ${gameId}, 'seat-1', ${hex()}, ${later})`);
  await db.execute(sql`insert into game_presenter_pairings (code_hash, game_id, expires_at)
    values (${hex()}, ${gameId}, ${later})`);
  await db.execute(sql`insert into game_presenter_sessions (token_hash, game_id, expires_at)
    values (${hex()}, ${gameId}, ${later})`);
}

// Every table with a game_id column. A new game table must be added here with
// its clear-down rule, or this inventory fails.
const gameTables = [
  'game_coordinator_capabilities',
  'game_coordinator_delegates',
  'game_coordinator_handoffs',
  'game_coordinator_takeovers',
  'game_deadlines',
  'game_events',
  'game_idempotency',
  'game_invites',
  'game_join_requests',
  'game_presenter_pairings',
  'game_presenter_sessions',
  'game_seat_access',
  'game_seat_connections',
  'game_snapshots',
  'game_tombstones',
  'game_undo_windows',
  'game_viewer_sessions',
];

async function rowsForGame(gameId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of [...gameTables, 'games']) {
    if (table === 'game_tombstones') continue;
    const column = table === 'games' ? 'id' : 'game_id';
    const result = await db.execute(
      sql`select count(*)::int as count from ${sql.identifier(table)} where ${sql.identifier(column)} = ${gameId}`,
    );
    counts[table] = Number(result.rows[0]?.count ?? 0);
  }
  const votes = await db.execute(sql`
    select count(*)::int as count from game_coordinator_takeover_votes v
    join game_coordinator_takeovers t on t.id = v.request_id
    where t.game_id = ${gameId}`);
  counts.game_coordinator_takeover_votes = Number(votes.rows[0]?.count ?? 0);
  return counts;
}

async function exists(gameId: string) {
  const result = await db.execute(
    sql`select 1 from games where id = ${gameId}`,
  );
  return result.rows.length === 1;
}

async function tombstone(gameId: string) {
  const result = await db.execute(
    sql`select * from game_tombstones where game_id = ${gameId}`,
  );
  return result.rows[0] ?? null;
}

describe('game end date storage', () => {
  it('requires an end date for every real game at the database', async () => {
    const gameId = randomUUID();
    created.add(gameId);
    await expect(
      db.execute(
        sql`insert into games (id, config) values (${gameId}, '{}'::jsonb)`,
      ),
    ).rejects.toThrow();
  });

  it('stores the chosen end date, or created date plus 30 days for old callers', async () => {
    const chosen = await realGame('2026-11-30');
    expect(await readGameEndDate(chosen)).toBe('2026-11-30');
    const legacy = await realGame(
      undefined,
      Date.parse('2026-10-01T12:00:00Z'),
    );
    expect(await readGameEndDate(legacy)).toBe('2026-10-31');
  });

  it('backfills real games without an end date to created date plus 30 UK days', async () => {
    const migration = readFileSync(
      'lib/db/migrations/0014_game_end_date.sql',
      'utf8',
    );
    const backfill = migration
      .split('--> statement-breakpoint')
      .find((statement) => statement.trim().startsWith('UPDATE "games"'));
    expect(backfill).toBeDefined();
    const client = await pool.connect();
    try {
      // A temporary copy without the new check, so the shared table keeps it.
      await client.query(
        'create temp table "games_backfill_check" (like games including defaults)',
      );
      await client.query(`insert into games_backfill_check (id, config, created_at) values
        ('legacy-real', '{}'::jsonb, '2026-10-01T23:30:00Z'),
        ('legacy-practice', '{"rehearsal":{"enabled":true}}'::jsonb, '2026-10-01T12:00:00Z')`);
      await client.query(
        backfill!.replace('UPDATE "games"', 'UPDATE "games_backfill_check"'),
      );
      const rows = await client.query(
        'select id, game_end_date::text as end_date from games_backfill_check order by id',
      );
      // 23:30 UTC on 1 October is 2 October in the UK (BST): plus 30 days.
      expect(rows.rows).toEqual([
        { id: 'legacy-practice', end_date: null },
        { id: 'legacy-real', end_date: '2026-11-01' },
      ]);
    } finally {
      await client.query('drop table if exists games_backfill_check');
      client.release();
    }
  });

  it('saves a later end date, so the game is no longer due for deletion', async () => {
    const gameId = await realGame('2026-10-27');
    expect(await updateGameEndDate(gameId, '2026-12-01')).toBe(true);
    expect(await readGameEndDate(gameId)).toBe('2026-12-01');
    await runClearDown({
      now,
      mode: 'delete',
      realGames: true,
      testOnlyGameIds: [gameId],
    });
    expect(await exists(gameId)).toBe(true);
  });
});

describe('clear-down of real games', () => {
  it('removes a game ended yesterday and keeps today and tomorrow', async () => {
    const yesterday = await realGame('2026-10-27');
    const today = await realGame('2026-10-28');
    const tomorrow = await realGame('2026-10-29');
    const result = await runClearDown({
      now,
      mode: 'delete',
      realGames: true,
      testOnlyGameIds: [yesterday, today, tomorrow],
    });
    expect(result).toMatchObject({ ran: true, deleted: 1 });
    expect(await exists(yesterday)).toBe(false);
    expect(await exists(today)).toBe(true);
    expect(await exists(tomorrow)).toBe(true);
  });

  it('never deletes a game with a deadline still due in the future', async () => {
    const gameId = await realGame('2026-10-27');
    // Due a week after the real clock too, so other suites that claim every
    // due deadline (up to a day ahead) never see it.
    await db.execute(sql`insert into game_deadlines (game_id, kind, version, due_at)
      values (${gameId}, 'SHADOW', 2, ${new Date(Math.max(now, Date.now()) + 7 * 24 * hour)})`);
    await runClearDown({
      now,
      mode: 'delete',
      realGames: true,
      testOnlyGameIds: [gameId],
    });
    expect(await exists(gameId)).toBe(true);
  });

  it('leaves real games alone when the run is not the nightly one', async () => {
    const gameId = await realGame('2026-10-27');
    await runClearDown({
      now,
      mode: 'delete',
      realGames: false,
      testOnlyGameIds: [gameId],
    });
    expect(await exists(gameId)).toBe(true);
  });

  it('empties every game table for the deleted game only, leaving a bare tombstone', async () => {
    const tables = await db.execute(sql`
      select table_name from information_schema.columns
      where table_schema = 'public' and column_name = 'game_id'
      order by table_name`);
    expect(tables.rows.map((row) => row.table_name)).toEqual(gameTables);

    const expired = await realGame('2026-10-27');
    const kept = await realGame('2026-10-29');
    await fillEveryGameTable(expired);
    await fillEveryGameTable(kept);
    const keptBefore = await rowsForGame(kept);

    await runClearDown({
      now,
      mode: 'delete',
      realGames: true,
      testOnlyGameIds: [expired, kept],
    });

    const after = await rowsForGame(expired);
    expect(Object.values(after).every((count) => count === 0)).toBe(true);
    expect(await rowsForGame(kept)).toEqual(keptBefore);
    expect(Object.values(keptBefore).every((count) => count > 0)).toBe(true);
    const stone = await tombstone(expired);
    expect(Object.keys(stone ?? {}).sort()).toEqual([
      'deleted_on',
      'game_id',
      'reason',
    ]);
    expect(stone).toMatchObject({
      game_id: expired,
      reason: 'end_date_passed',
    });
    expect(String(stone?.deleted_on)).toMatch(/2026-10-28|Oct 28 2026/);
  });
});

describe('clear-down safety', () => {
  it('deletes nothing in dry-run and reports counts only', async () => {
    const gameId = await realGame('2026-10-27');
    const result = await runClearDown({
      now,
      mode: 'dry-run',
      realGames: true,
      testOnlyGameIds: [gameId],
    });
    expect(result).toMatchObject({
      ran: true,
      mode: 'dry-run',
      expiredGames: 1,
      deleted: 0,
    });
    expect(await exists(gameId)).toBe(true);
    expect(await tombstone(gameId)).toBeNull();
  });

  it('does nothing when switched off', async () => {
    const gameId = await realGame('2026-10-27');
    const result = await runClearDown({
      now,
      mode: 'off',
      realGames: true,
      testOnlyGameIds: [gameId],
    });
    expect(result).toMatchObject({ ran: false, reason: 'off' });
    expect(await exists(gameId)).toBe(true);
  });

  it('two concurrent runs delete each game once', async () => {
    const ids = await Promise.all([1, 2, 3].map(() => realGame('2026-10-27')));
    const runs = await Promise.all([
      runClearDown({
        now,
        mode: 'delete',
        realGames: true,
        testOnlyGameIds: ids,
      }),
      runClearDown({
        now,
        mode: 'delete',
        realGames: true,
        testOnlyGameIds: ids,
      }),
    ]);
    expect(runs.reduce((total, run) => total + (run.deleted ?? 0), 0)).toBe(3);
    for (const id of ids) {
      expect(await exists(id)).toBe(false);
      expect(await tombstone(id)).not.toBeNull();
    }
  });

  it('a failure mid-delete leaves that game whole and others cleared', async () => {
    const failing = await realGame('2026-10-27');
    const other = await realGame('2026-10-27');
    await fillEveryGameTable(failing);
    const before = await rowsForGame(failing);
    const result = await runClearDown({
      now,
      mode: 'delete',
      realGames: true,
      testOnlyGameIds: [failing, other],
      testOnlyFailAfterDelete: (id) => id === failing,
    });
    expect(result).toMatchObject({ deleted: 1, failed: 1 });
    expect(await rowsForGame(failing)).toEqual(before);
    expect(await tombstone(failing)).toBeNull();
    expect(await exists(other)).toBe(false);
  });

  it('prunes rate-limit windows older than a day', async () => {
    const old = hex();
    const fresh = hex();
    const real = Date.now();
    await db.execute(sql`insert into api_rate_limits (bucket_hash, window_started_at, hit_count)
      values (${old}, ${new Date(real - 25 * hour)}, 1), (${fresh}, ${new Date(real)}, 1)`);
    await runClearDown({
      now: real,
      mode: 'delete',
      realGames: false,
      testOnlyGameIds: [],
      pruneRateLimits: true,
    });
    const rows = await db.execute(
      sql`select bucket_hash from api_rate_limits where bucket_hash in (${old}, ${fresh})`,
    );
    expect(rows.rows.map((row) => row.bucket_hash)).toEqual([fresh]);
  });
});

describe('clear-down of practice games', () => {
  it('clears a practice game 24 hours after its last activity, not before', async () => {
    const idle = await practiceGame(now - 25 * hour);
    const recent = await practiceGame(now - 23 * hour);
    const result = await runClearDown({
      now,
      mode: 'delete',
      realGames: false,
      testOnlyGameIds: [idle, recent],
    });
    expect(result).toMatchObject({ practiceGames: 1, deleted: 1 });
    expect(await exists(idle)).toBe(false);
    expect(await exists(recent)).toBe(true);
    expect(await tombstone(idle)).toMatchObject({
      reason: 'practice_inactive',
    });
  });
});
