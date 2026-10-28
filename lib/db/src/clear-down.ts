import type { PoolClient } from 'pg';
import { ukCalendarDate } from '@workspace/shared/game-end-date';
import { pool } from './index';

// Game clear-down (D117). Real games are deleted the day after their UK end
// date; practice games 24 hours after their last activity. Deleting the games
// row removes every game table through ON DELETE CASCADE; a tombstone keeps
// only the id, the UK deletion date and the reason.

export type ClearDownMode = 'off' | 'dry-run' | 'delete';

export const CLEAR_DOWN_DEFAULT_MODE: ClearDownMode = 'dry-run';
const PRACTICE_IDLE_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;
// Arbitrary constant shared by every process; only one run may hold it.
const CLEAR_DOWN_LOCK_KEY = 7_117_028;

export type ClearDownResult =
  | { ran: false; reason: 'off' | 'locked'; mode: ClearDownMode }
  | {
      ran: true;
      mode: ClearDownMode;
      expiredGames: number;
      practiceGames: number;
      deleted: number;
      failed: number;
    };

export type ClearDownOptions = {
  now: number;
  mode: ClearDownMode;
  /** Real games only in the nightly run (at or after 04:00 UK). */
  realGames: boolean;
  batchSize?: number;
  pruneRateLimits?: boolean;
  /** Tests only: limits the run to these games. */
  testOnlyGameIds?: string[];
  /** Tests only: throws inside the delete transaction for matching games. */
  testOnlyFailAfterDelete?: (gameId: string) => boolean;
};

/** Reads OATHSTONE_CLEARDOWN_MODE; anything unrecognised stays in dry-run. */
export function clearDownModeFromEnvironment(
  value: string | undefined,
): ClearDownMode {
  return value === 'off' || value === 'delete' || value === 'dry-run'
    ? value
    : CLEAR_DOWN_DEFAULT_MODE;
}

type Candidate = {
  id: string;
  reason: 'end_date_passed' | 'practice_inactive';
};

const isPractice = `coalesce(config #>> '{rehearsal,enabled}', 'false') = 'true'`;
// Every query passes $1 (UK today), $2 (now) and $3 (practice cut-off); this
// types all three even where a query uses only some of them.
const baseParams = `$1::date is not null and $2::timestamptz is not null and $3::timestamptz is not null`;
const expiredRealGame = `not (${isPractice})
  and game_end_date < $1::date
  and not exists (
    select 1 from game_deadlines d
    where d.game_id = games.id and d.completed_at is null and d.due_at > $2::timestamptz
  )`;
const idlePracticeGame = `${isPractice} and updated_at <= $3::timestamptz`;

export async function runClearDown(
  options: ClearDownOptions,
): Promise<ClearDownResult> {
  const { mode } = options;
  if (mode === 'off') return { ran: false, reason: 'off', mode };

  const client = await pool.connect();
  try {
    const lock = await client.query<{ locked: boolean }>(
      'select pg_try_advisory_lock($1) as locked',
      [CLEAR_DOWN_LOCK_KEY],
    );
    if (!lock.rows[0]?.locked) return { ran: false, reason: 'locked', mode };
    try {
      return await runLocked(client, options);
    } finally {
      await client.query('select pg_advisory_unlock($1)', [
        CLEAR_DOWN_LOCK_KEY,
      ]);
    }
  } finally {
    client.release();
  }
}

type Client = PoolClient;

async function runLocked(
  client: Client,
  options: ClearDownOptions,
): Promise<ClearDownResult> {
  const { now, mode } = options;
  const today = ukCalendarDate(now);
  const nowDate = new Date(now);
  const practiceBefore = new Date(now - PRACTICE_IDLE_MS);
  const batchSize = Math.min(Math.max(options.batchSize ?? 20, 1), 200);
  const scope = options.testOnlyGameIds;
  const scopeClause = scope ? 'and id = any($4::text[])' : '';
  const params = (extra: unknown[] = []) => [
    today,
    nowDate,
    practiceBefore,
    ...(scope ? [scope] : []),
    ...extra,
  ];

  const count = async (where: string) => {
    if (where === expiredRealGame && !options.realGames) return 0;
    const result = await client.query<{ count: number }>(
      `select count(*)::int as count from games where ${baseParams} and ${where} ${scopeClause}`,
      params(),
    );
    return Number(result.rows[0]?.count ?? 0);
  };
  const expiredGames = await count(expiredRealGame);
  const practiceGames = await count(idlePracticeGame);

  let deleted = 0;
  let failed = 0;
  if (mode === 'delete') {
    const failedIds = new Set<string>();
    for (;;) {
      const candidates = await nextBatch(
        client,
        options.realGames,
        scopeClause,
        params,
        batchSize,
        failedIds,
      );
      if (candidates.length === 0) break;
      for (const candidate of candidates) {
        const outcome = await deleteGame(client, candidate, options, params);
        if (outcome === 'deleted') deleted += 1;
        if (outcome === 'failed') {
          failed += 1;
          failedIds.add(candidate.id);
        }
        if (outcome === 'skipped') failedIds.add(candidate.id);
      }
    }
    if (options.pruneRateLimits ?? !scope)
      await client.query(
        'delete from api_rate_limits where window_started_at < $1',
        [new Date(now - RATE_LIMIT_RETENTION_MS)],
      );
  }
  return { ran: true, mode, expiredGames, practiceGames, deleted, failed };
}

async function nextBatch(
  client: Client,
  realGames: boolean,
  scopeClause: string,
  params: (extra?: unknown[]) => unknown[],
  batchSize: number,
  skip: Set<string>,
): Promise<Candidate[]> {
  const skipIndex = params().length + 1;
  const skipClause = `and not (id = any($${skipIndex}::text[]))`;
  const limitIndex = skipIndex + 1;
  const where = realGames
    ? `((${expiredRealGame}) or (${idlePracticeGame}))`
    : `(${idlePracticeGame})`;
  const result = await client.query<{ id: string; practice: boolean }>(
    `select id, (${isPractice}) as practice from games
     where ${baseParams} and ${where} ${scopeClause} ${skipClause}
     order by id
     limit $${limitIndex}`,
    params([[...skip], batchSize]),
  );
  return result.rows.map((row) => ({
    id: row.id,
    reason: row.practice ? 'practice_inactive' : 'end_date_passed',
  }));
}

/** One game per transaction: tombstone and delete together, or neither. */
async function deleteGame(
  client: Client,
  candidate: Candidate,
  options: ClearDownOptions,
  params: (extra?: unknown[]) => unknown[],
): Promise<'deleted' | 'skipped' | 'failed'> {
  const stillDue =
    candidate.reason === 'practice_inactive'
      ? idlePracticeGame
      : expiredRealGame;
  const [today, nowDate, practiceBefore] = params();
  try {
    await client.query('begin');
    // Re-check inside the transaction: the end date may have just moved.
    const removed = await client.query(
      `delete from games where id = $4 and ${baseParams} and ${stillDue} returning id`,
      [today, nowDate, practiceBefore, candidate.id],
    );
    if (removed.rowCount !== 1) {
      await client.query('rollback');
      return 'skipped';
    }
    await client.query(
      `insert into game_tombstones (game_id, deleted_on, reason)
       values ($1, $2::date, $3) on conflict (game_id) do nothing`,
      [candidate.id, ukCalendarDate(options.now), candidate.reason],
    );
    if (options.testOnlyFailAfterDelete?.(candidate.id))
      throw new Error('Test-only clear-down failure');
    await client.query('commit');
    return 'deleted';
  } catch {
    await client.query('rollback').catch(() => undefined);
    return 'failed';
  }
}
