import { expect, it } from 'vitest';
import fc from 'fast-check';
import { assertInvariants, replay, viewFor } from '../lib/engine/src/index';
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

function runToFinish(strategy: (typeof strategies)[number], count: number) {
  const game = fixture(count, {
    tasks: { enabled: true },
    missions: { enabled: false, shields: 'off' },
    traitors: {
      number: 'auto',
      sleeper: false,
      recruitment: 'off',
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
        const reported = command(
          game,
          { type: 'SubmitTaskReport', answer: 'done' },
          true,
          { kind: 'player', seatId: seat.id },
        );
        expect(reported.ok).toBe(true);
        const privateView = viewFor(
          { kind: 'player', seatId: seat.id, reveal: true },
          game.state,
        ).private!;
        let options = privateView.options;
        if (privateView.role === 'traitor') {
          const teammates = new Set(
            privateView.team.map((member) => member.id),
          );
          options = options.filter((option) => !teammates.has(option.id));
        }
        if (options.length)
          command(
            game,
            { type: 'SubmitShadowChoice', choice: options[0]!.id },
            true,
            { kind: 'player', seatId: seat.id },
          );
      }
    }

    game.context.now = (game.state.deadline ?? game.context.now) + 1;
    command(game, { type: 'AdvancePhase' });
    assertInvariants(game.state);
    expect(replay(game.events)).toEqual(game.state);
    expect(game.state.cycle).toBeLessThanOrEqual(cycleLimit);
    transitions += 1;
  }

  expect(game.state.phase).toBe('FINISHED');
  expect(game.state.steps).toBeLessThanOrEqual(
    1 + cycleLimit * 7 + Math.max(0, count - 2),
  );
}

for (const [index, strategy] of strategies.entries()) {
  it(`reaches FINISHED within the D13 bound for the ${strategy} bot`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 40 }), (count) =>
        runToFinish(strategy, count),
      ),
      { numRuns: 1, seed: 20261020 + index },
    );
  }, 30_000);
}
