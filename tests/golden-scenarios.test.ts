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

function hasDoubleMurderSplit(events: readonly Event[]): boolean {
  const traitors = new Set<string>();
  for (const event of events)
    if (event.type === 'RolesDealt')
      for (const [seatId, role] of Object.entries(event.roles))
        if (role === 'traitor') traitors.add(seatId);
  const resolutions = events.filter(
    (event) =>
      event.type === 'MurderSlotResolved' && event.outcome === 'murdered',
  );
  const first = resolutions.find(
    (event) => event.type === 'MurderSlotResolved' && event.slot === 1,
  );
  const second = resolutions.find(
    (event) => event.type === 'MurderSlotResolved' && event.slot === 2,
  );
  if (
    first?.type !== 'MurderSlotResolved' ||
    second?.type !== 'MurderSlotResolved' ||
    first.cycle !== second.cycle ||
    first.chosen === second.chosen
  )
    return false;
  const finalPicks = (resolution: typeof first) =>
    new Map(
      resolution.picks
        .filter((pick) => pick.round === 2 && traitors.has(pick.seatId))
        .map((pick) => [pick.seatId, pick.choice]),
    );
  const firstPicks = finalPicks(first);
  const secondPicks = finalPicks(second);
  const activeTraitors = [...firstPicks.keys()].filter((seatId) =>
    secondPicks.has(seatId),
  );
  return (
    activeTraitors.length > 0 &&
    activeTraitors.every(
      (seatId) =>
        firstPicks.has(seatId) &&
        secondPicks.has(seatId) &&
        firstPicks.get(seatId) !== secondPicks.get(seatId),
    )
  );
}

function findAbstentionOutcomes(events: readonly Event[]) {
  let phase = '';
  let waitingForVoteRevote = false;
  let ballotsInCurrentRound = 0;
  const outcomes = {
    noVoteRound: false,
    noVoteRevote: false,
    abstainedEndgameBanishment: false,
  };
  for (const event of events) {
    if (event.type === 'PhaseChanged') {
      phase = event.phase;
      if (phase === 'VOTE' || phase === 'FINAL_BANISH')
        ballotsInCurrentRound = 0;
    } else if (event.type === 'VoteSubmitted') {
      if (phase === 'VOTE' || phase === 'FINAL_BANISH') ballotsInCurrentRound++;
    } else if (event.type === 'VoteClosed') {
      if (phase === 'VOTE') waitingForVoteRevote = event.revote;
      if (phase === 'FINAL_BANISH' && ballotsInCurrentRound === 0)
        outcomes.abstainedEndgameBanishment = true;
    } else if (event.type === 'VoteSkipped' && phase === 'VOTE') {
      outcomes.noVoteRound = true;
      if (waitingForVoteRevote) outcomes.noVoteRevote = true;
      waitingForVoteRevote = false;
    }
  }
  return outcomes;
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
    if (scenario.assertions?.doubleMurderSplit)
      expect(hasDoubleMurderSplit(result.events), scenario.id).toBe(true);
    const abstentionOutcomes = findAbstentionOutcomes(result.events);
    for (const assertion of [
      'noVoteRound',
      'noVoteRevote',
      'abstainedEndgameBanishment',
    ] as const) {
      if (scenario.assertions?.[assertion])
        expect(abstentionOutcomes[assertion], scenario.id).toBe(true);
    }
  }
}, 30_000);

it('keeps golden coverage for abstained regular, tie-revote and endgame ballots', () => {
  const scenarios = loadGoldenScenarios();
  expect(scenarios.some((scenario) => scenario.assertions?.noVoteRound)).toBe(
    true,
  );
  expect(scenarios.some((scenario) => scenario.assertions?.noVoteRevote)).toBe(
    true,
  );
  expect(
    scenarios.some(
      (scenario) => scenario.assertions?.abstainedEndgameBanishment,
    ),
  ).toBe(true);
});

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

it('includes a complete-game golden with independent first and second murder choices', () => {
  const scenario = loadGoldenScenarios().find(
    (candidate) => candidate.assertions?.doubleMurderSplit,
  );
  expect(scenario).toBeDefined();
  const result = runCompleteGame({
    seed: scenario!.seed,
    strategy: scenario!.strategy,
    config: scenario!.config,
  });
  expect(hasDoubleMurderSplit(result.events)).toBe(true);
  const finishedView = viewFor(
    { kind: 'player', seatId: result.state.seats[0]!.id },
    result.state,
  );
  const firstCycle = finishedView.fairness?.murderSlots.filter(
    (slot) => slot.cycle === 1,
  );
  expect(firstCycle?.map((slot) => slot.slot)).toEqual([1, 2]);
  expect(firstCycle?.every((slot) => slot.picks.length > 0)).toBe(true);
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
