import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { replay, viewFor } from '../lib/engine/src/index';
import { eventSchema, gameConfigSchema } from '../lib/shared/src/index';

describe('reduced-scale capacity contracts', () => {
  it('keeps a 15-seat whole-view update below 2 KB', () => {
    const gameId = 'capacity-game';
    const events = [
      eventSchema.parse({
        seq: 1,
        at: 1_800_000_000_000,
        schemaVersion: 1,
        type: 'GameCreated',
        id: gameId,
        config: gameConfigSchema.parse({}),
      }),
      ...Array.from({ length: 15 }, (_, index) =>
        eventSchema.parse({
          seq: index + 2,
          at: 1_800_000_000_000 + index + 1,
          schemaVersion: 1,
          type: 'SeatJoined',
          seatId: `seat-${index + 1}`,
          name: `Player ${String(index + 1).padStart(2, '0')}`,
        }),
      ),
    ];
    const state = replay(events);
    const view = JSON.stringify(
      viewFor({ kind: 'player', seatId: 'seat-1' }, state),
    );
    expect(Buffer.byteLength(view, 'utf8')).toBeLessThan(2_000);
  });

  it('sets a configurable libuv threadpool default before starting the API', () => {
    const packageJson = JSON.parse(
      readFileSync(
        new URL('../artifacts/api-server/package.json', import.meta.url),
        'utf8',
      ),
    ) as { scripts: { start: string } };

    expect(packageJson.scripts.start).toMatch(
      /UV_THREADPOOL_SIZE=\$\{UV_THREADPOOL_SIZE:-8\}/,
    );
  });
});
