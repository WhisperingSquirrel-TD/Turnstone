import { expect, it } from 'vitest';
import { fuzzFailureReason, runFuzzBatch } from '../scripts/src/scenarios/fuzz';

it('replays deterministic faulted games and rejects invalid commands without mutation', () => {
  const first = runFuzzBatch({ seed: 20261013, games: 2 });
  const second = runFuzzBatch({ seed: 20261013, games: 2 });
  expect(first).toEqual(second);
  expect(first.games).toBe(2);
  expect(first.finished).toBe(2);
  expect(first.rejectedInvalidCommands).toBeGreaterThan(0);
  expect(first.failureSeeds).toEqual([]);
  expect(first.failureReasons).toEqual([]);
  expect(fuzzFailureReason(42, new Error('unexpected state'))).toBe(
    'Fuzz game failed at seed 42: unexpected state',
  );
});

it('does not issue another phase advance after a faulted game has finished', () => {
  const result = runFuzzBatch({ seed: 22_261_013, games: 30 });
  expect(result.failureReasons).toEqual([]);
  expect(result.failureSeeds).toEqual([]);
  expect(result.finished).toBe(30);
});
