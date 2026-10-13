import { expect, it } from 'vitest';
import { coreConfig } from '../scripts/src/scenarios/runner';

it.each([5, 15, 40])(
  'leaves the %i-seat cycle count to the planner instead of forcing an early endgame',
  (players) => {
    expect(
      coreConfig(players, 'auto', 'day').schedule.plannedCycles,
    ).toBeNull();
  },
);
