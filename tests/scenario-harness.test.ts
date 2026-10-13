import { expect, it } from 'vitest';
import {
  BOT_STRATEGIES,
  runCompleteGame,
} from '../scripts/src/scenarios/simulate';
import { coreConfig } from '../scripts/src/scenarios/runner';
import { SAMPLE_SCENARIO_LIMITS } from '../scripts/src/scenarios/runner';

const config = {
  players: { count: 5 },
  traitors: { number: 1, sleeper: false, recruitment: 'off' },
  missions: { enabled: false, shields: 'off' },
  roundTable: { tieRule: 'revote-random' },
  endgame: { size: 3, parity: false },
  schedule: { format: 'quick', plannedCycles: 1 },
};

for (const strategy of BOT_STRATEGIES) {
  it(`finishes a deterministic full game with the ${strategy} bot`, () => {
    const result = runCompleteGame({
      seed: 20261021,
      strategy,
      config,
    });

    expect(result.state.phase).toBe('FINISHED');
    expect(result.checks.referenceMatches).toBe(true);
    expect(result.checks.potValidation).toBe('pending Milestone 7');
    expect(result.checks.replayMatches).toBe(true);
    expect(result.checks.incrementalReplayEvents).toBe(result.events.length);
    expect(result.checks.replayStepChecks).toBeGreaterThan(0);
    expect(result.checks.noLeaks).toBe(true);
    expect(result.steps).toBeLessThanOrEqual(
      1 + result.state.maxCycles * 7 + config.players.count - 2,
    );
  }, 10_000);
}

it('allows 40-seat one-by-one vote reveals to reach the endgame', () => {
  const result = runCompleteGame({
    seed: 20353529,
    strategy: 'coordinator-probes-for-secrets',
    config: coreConfig(40, 1, 'quick'),
  });

  expect(result.state.phase).toBe('FINISHED');
  expect(result.steps).toBeLessThanOrEqual(
    1 + result.state.maxCycles * 7 + 40 - 2,
  );
}, 30_000);

it('keeps verify fast while preserving one run for every coverage row', () => {
  expect(SAMPLE_SCENARIO_LIMITS).toEqual({
    gamesPerSweepCell: 1,
    gamesPerCoveringRow: 1,
    fuzzGames: 32,
  });
});
