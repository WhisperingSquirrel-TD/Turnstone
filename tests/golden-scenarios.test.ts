import { expect, it } from 'vitest';
import { runCompleteGame } from '../scripts/src/scenarios/simulate';
import { loadGoldenScenarios } from '../scripts/src/scenarios/golden';

it('replays every implemented complete-game golden scenario exactly', () => {
  const scenarios = loadGoldenScenarios();
  expect(scenarios.length).toBeGreaterThanOrEqual(12);
  for (const scenario of scenarios) {
    const result = runCompleteGame({
      seed: scenario.seed,
      strategy: scenario.strategy,
      config: scenario.config,
    });
    expect({
      phase: result.state.phase,
      winner: result.state.winner,
      reason: result.state.reason,
      alive: result.state.seats.filter((seat) => seat.status === 'alive')
        .length,
      eliminated:
        result.state.seats.length -
        result.state.seats.filter((seat) => seat.status === 'alive').length,
    }).toEqual(scenario.expected);
  }
}, 30_000);
