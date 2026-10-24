import { describe, expect, it } from 'vitest';
import { gameConfigSchema, eventSchema } from '../lib/shared/src';
import { readRehearsalEvents } from '../e2e/support/read-rehearsal-events';

const gameId = 'rehearsal-test-game';
const createdEvent = eventSchema.parse({
  id: gameId,
  seq: 1,
  at: 1_800_000_000_000,
  schemaVersion: 1,
  type: 'GameCreated',
  config: gameConfigSchema.parse({}),
});

describe('readRehearsalEvents', () => {
  it('reads stored payloads in sequence and validates them with the shared schema', async () => {
    const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
    const events = await readRehearsalEvents(gameId, async (sql, values) => {
      calls.push({ sql, values });
      return { rows: [{ payload: createdEvent }] };
    });

    expect(events).toEqual([createdEvent]);
    expect(calls).toEqual([
      {
        sql: 'SELECT payload FROM game_events WHERE game_id = $1 ORDER BY seq',
        values: [gameId],
      },
    ]);
  });

  it('fails on malformed persisted events instead of silently dropping them', async () => {
    await expect(
      readRehearsalEvents(gameId, async () => ({
        rows: [{ payload: { ...createdEvent, seq: -1 } }],
      })),
    ).rejects.toThrow();
  });
});
