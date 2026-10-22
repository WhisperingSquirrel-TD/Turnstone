import { expect, it } from 'vitest';
import fc from 'fast-check';
import { performance } from 'node:perf_hooks';
import {
  assertInvariants,
  evolve,
  replay,
  viewFor,
} from '../lib/engine/src/index';
import { command, fixture } from './support/engine';

const strategies = [
  'random',
  'cautious-faithful',
  'aggressive-traitor',
  'never-acts',
  'non-voter',
  'serial-disconnector',
  'coordinator-probes-for-secrets',
] as const;

function runToFinish(
  strategy: (typeof strategies)[number],
  count: number,
  unanimous = false,
) {
  const game = fixture(count, {
    tasks: { enabled: true },
    missions: { enabled: false, shields: 'off' },
    traitors: {
      number: 'auto',
      sleeper: false,
      recruitment: 'off',
      victimDecision: unanimous ? 'unanimous' : 'majority',
      timeoutChoice: 'random',
    },
    roundTable: {
      tieRule: 'revote-none',
      revealStyle: 'all',
      debateMinutes: 2,
      voteMinutes: 1,
    },
    schedule: { format: 'quick', plannedCycles: 1 },
    endgame: { trigger: 'alive', size: 3, parity: false },
  });
  Reflect.set(game.context, 'taskCatalog', [
    {
      id: 'termination-task',
      text: 'Ask two guests to use a chosen word during an ordinary conversation.',
      tags: ['family', 'seated'],
      minimumAge: 8,
      difficulty: 'easy',
    },
  ]);
  command(game, { type: 'StartGame' });
  for (const seat of game.state.seats)
    command(game, { type: 'AcknowledgePrivate' }, true, {
      kind: 'player',
      seatId: seat.id,
    });
  let replayCursor = replay(game.events);
  let replayedEvents = game.events.length;
  const cycleLimit = game.state.maxCycles;
  let transitions = 0;

  while (game.state.phase !== 'FINISHED' && transitions < 400) {
    const phase = game.state.phase;
    const cycle = game.state.cycle;
    const disconnected =
      strategy === 'never-acts' ||
      (strategy === 'non-voter' && ['VOTE', 'FINAL_BANISH'].includes(phase)) ||
      (strategy === 'serial-disconnector' && cycle % 2 === 0);

    const blindView = viewFor(
      { kind: 'coordinator', reveal: true },
      game.state,
    );
    expect(blindView.private).toBeNull();
    expect(blindView.fairness).toBeNull();
    expect(
      blindView.seats.every(
        (seat) =>
          seat.role === undefined ||
          game.state.seats.find((source) => source.id === seat.id)?.publicRole,
      ),
    ).toBe(true);

    if (strategy === 'coordinator-probes-for-secrets') {
      const adminView = viewFor({ kind: 'admin', reveal: true }, game.state);
      expect(adminView.private).toBeNull();
      expect(adminView.fairness).toBeNull();
    }

    if (!disconnected && ['VOTE', 'FINAL_BANISH'].includes(phase)) {
      for (const seat of game.state.seats.filter(
        (item) => item.status === 'alive',
      )) {
        const privateView = viewFor(
          { kind: 'player', seatId: seat.id, reveal: true },
          game.state,
        ).private!;
        let options = privateView.options;
        if (phase === 'FINAL_BANISH' && game.state.candidates.length)
          options = options.filter((option) =>
            game.state.candidates.includes(option.id),
          );
        if (options.length) {
          const index =
            strategy === 'random' ? game.state.version % options.length : 0;
          const result = command(
            game,
            { type: 'SubmitVote', target: options[index]!.id },
            true,
            { kind: 'player', seatId: seat.id },
          );
          expect(result.ok).toBe(true);
          assertInvariants(game.state);
        }
      }
    }

    if (!disconnected && phase === 'SHADOW') {
      for (const seat of game.state.seats.filter(
        (item) => item.status === 'alive',
      )) {
        if (game.state.shadowRound === 1) {
          const reported = command(
            game,
            { type: 'SubmitTaskReport', answer: 'done' },
            true,
            { kind: 'player', seatId: seat.id },
          );
          expect(reported.ok).toBe(true);
        }
        const privateView = viewFor(
          { kind: 'player', seatId: seat.id, reveal: true },
          game.state,
        ).private!;
        let options = privateView.options;
        if (privateView.role === 'traitor') {
          const teammates = new Set(
            privateView.team.map((member) => member.id),
          );
          options = options.filter(
            (option) => option.id !== seat.id && !teammates.has(option.id),
          );
        }
        if (game.state.shadowSlot === 2) {
          const firstSlotChoice = game.state.shadowPicks
            .filter(
              (pick) =>
                pick.cycle === cycle &&
                pick.slot === 1 &&
                pick.seatId === seat.id,
            )
            .sort((left, right) => right.seq - left.seq)[0]?.choice;
          options = options.filter((option) => option.id !== firstSlotChoice);
        }
        const livingTraitors = game.state.seats.filter(
          (item) => item.status === 'alive' && item.role === 'traitor',
        );
        const choiceIndex =
          unanimous &&
          game.state.shadowRound === 2 &&
          privateView.role === 'traitor'
            ? livingTraitors.findIndex((item) => item.id === seat.id) %
              options.length
            : 0;
        if (options.length)
          command(
            game,
            {
              type: 'SubmitShadowChoice',
              choice: options[choiceIndex]!.id,
            },
            true,
            { kind: 'player', seatId: seat.id },
          );
      }
    }

    game.context.now = (game.state.deadline ?? game.context.now) + 1;
    command(game, { type: 'AdvancePhase' });
    assertInvariants(game.state);
    while (replayedEvents < game.events.length) {
      replayCursor = evolve(replayCursor, game.events[replayedEvents]!);
      replayedEvents++;
    }
    expect(replayCursor).toEqual(game.state);
    expect(game.state.cycle).toBeLessThanOrEqual(cycleLimit);
    transitions += 1;
  }

  expect(game.state.phase).toBe('FINISHED');
  expect(replay(game.events)).toEqual(game.state);
  expect(game.state.steps).toBeLessThanOrEqual(
    1 + cycleLimit * 7 + Math.max(0, count - 2),
  );
  return game.state.steps;
}

for (const [index, strategy] of strategies.entries()) {
  it(`reaches FINISHED within the D13 bound for the ${strategy} bot`, () => {
    let durationMs = 0;
    let ruleSteps = 0;
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 40 }), (count) => {
        const started = performance.now();
        ruleSteps = runToFinish(strategy, count);
        durationMs = performance.now() - started;
      }),
      { numRuns: 1, seed: 20261020 + index },
    );
    const millisecondsPerRuleStep = durationMs / Math.max(1, ruleSteps);
    console.info(
      `[engine-performance] strategy=${strategy} game=${durationMs.toFixed(1)}ms steps=${ruleSteps} mean-step=${millisecondsPerRuleStep.toFixed(1)}ms`,
    );
    expect(millisecondsPerRuleStep).toBeLessThan(100);
    expect(durationMs).toBeLessThan(15_000);
  }, 60_000);

  it(`terminates with the fixed unanimous re-vote for the ${strategy} bot`, () => {
    const steps = runToFinish(strategy, 15, true);
    expect(steps).toBeGreaterThan(0);
  }, 60_000);
}
