import { expect, it } from 'vitest';
import type { Event } from '../lib/engine/src/index';
import { viewFor } from '../lib/engine/src/index';
import { gameConfigSchema } from '../lib/shared/src/index';
import { runCompleteGame } from '../scripts/src/scenarios/simulate';
import { loadGoldenScenarios } from '../scripts/src/scenarios/golden';

function hasSplitAfterShadowRevote(events: readonly Event[]): boolean {
  const roles = new Map<string, string>();
  let round = 0;
  let picks = new Map<string, string>();
  for (const event of events) {
    if (event.type === 'RolesDealt')
      for (const [seatId, role] of Object.entries(event.roles))
        roles.set(seatId, role);
    if (event.type === 'PhaseChanged' && event.phase === 'SHADOW') {
      round = 1;
      picks = new Map();
    } else if (event.type === 'ShadowRoundAdvanced') {
      round = 2;
      picks = new Map();
    } else if (
      event.type === 'ShadowSubmitted' &&
      round === 2 &&
      roles.get(event.seatId) === 'traitor'
    ) {
      picks.set(event.seatId, event.choice);
    } else if (event.type === 'DawnResolved' && round === 2) {
      if (new Set(picks.values()).size > 1) return true;
      round = 0;
    }
  }
  return false;
}

it('replays every implemented complete-game golden scenario exactly', () => {
  const scenarios = loadGoldenScenarios();
  expect(scenarios.length).toBeGreaterThanOrEqual(12);
  for (const scenario of scenarios) {
    const result = runCompleteGame({
      seed: scenario.seed,
      strategy: scenario.strategy,
      config: scenario.config,
    });
    expect(
      {
        phase: result.state.phase,
        winner: result.state.winner,
        reason: result.state.reason,
        alive: result.state.seats.filter((seat) => seat.status === 'alive')
          .length,
        eliminated:
          result.state.seats.length -
          result.state.seats.filter((seat) => seat.status === 'alive').length,
      },
      scenario.id,
    ).toEqual(scenario.expected);
    if (scenario.assertions?.shadowSplitAfterRevote)
      expect(hasSplitAfterShadowRevote(result.events), scenario.id).toBe(true);
  }
}, 30_000);

it('includes a complete-game golden where Traitors split after their re-vote', () => {
  const scenario = loadGoldenScenarios().find(
    (candidate) => candidate.assertions?.shadowSplitAfterRevote,
  );
  expect(scenario).toBeDefined();
  const result = runCompleteGame({
    seed: scenario!.seed,
    strategy: scenario!.strategy,
    config: scenario!.config,
  });
  expect(hasSplitAfterShadowRevote(result.events)).toBe(true);
});

it('finishes a golden game with identical public outcomes on player phones and no presenter', () => {
  const scenario = loadGoldenScenarios().find(
    (candidate) => !gameConfigSchema.parse(candidate.config).presenter.enabled,
  );
  expect(scenario).toBeDefined();
  const result = runCompleteGame({
    seed: scenario!.seed,
    strategy: scenario!.strategy,
    config: scenario!.config,
  });
  const phoneViews = result.state.seats.map((seat) =>
    viewFor({ kind: 'player', seatId: seat.id }, result.state),
  );

  expect(result.state.phase).toBe('FINISHED');
  expect(gameConfigSchema.parse(scenario!.config).presenter.enabled).toBe(
    false,
  );
  expect(phoneViews[0]?.publicAnnouncement?.kind).toBe('finished');
  expect(phoneViews.map((view) => view.publicAnnouncement)).toEqual(
    phoneViews.map(() => phoneViews[0]?.publicAnnouncement),
  );
});
