import { eventSchema } from '../../lib/shared/src/contracts';

type PersistedEventRow = { payload: unknown };
type EventQuery = (
  sql: string,
  values: readonly unknown[],
) => Promise<{ rows: readonly PersistedEventRow[] }>;

export async function readRehearsalEvents(gameId: string, query: EventQuery) {
  const { rows } = await query(
    'SELECT payload FROM game_events WHERE game_id = $1 ORDER BY seq',
    [gameId],
  );
  return eventSchema.array().parse(rows.map(({ payload }) => payload));
}

export async function readRehearsalEventsFromDatabase(gameId: string) {
  const { pool } = await import('@workspace/db');
  return readRehearsalEvents(gameId, async (sql, values) => {
    const result = await pool.query(sql, [...values]);
    return { rows: result.rows };
  });
}
