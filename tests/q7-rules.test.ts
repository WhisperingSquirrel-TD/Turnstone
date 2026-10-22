import { describe, expect, it } from 'vitest';
import {
  pendingActionSeatIds,
  replayFrom,
  viewFor,
  type State,
  type Viewer,
} from '../lib/engine/src/index';
import { command, fixture, type TestGame } from './support/engine';

type FullViewer = Exclude<Viewer, { kind: 'visitor' }>;

// Three surviving Traitors distinguish the owner rule from the existing
// two-player win. These snapshots model late-game states with parity disabled.
function lastFaithful(parity = false): TestGame {
  const game = fixture(5, {
    traitors: { number: 3, murders: 2, sleeper: false, recruitment: 'off' },
    endgame: { parity, size: 3 },
    missions: { enabled: true, shields: 'public' },
  });
  command(game, { type: 'StartGame' });
  game.state = {
    ...game.state,
    phase: 'VOTE',
    cycle: 1,
    phaseStarted: game.context.now - 120_000,
    deadline: game.context.now - 1,
    seats: game.state.seats.map((seat, index) => ({
      ...seat,
      role: index < 3 ? 'traitor' : 'faithful',
      status: index === 4 ? 'departed' : 'alive',
    })),
  };
  return game;
}

function resolveWindow(game: TestGame) {
  game.context.now =
    Math.max(
      game.state.deadline ?? 0,
      game.state.phaseStarted +
        game.state.config.privacy.shieldSeconds * 1_000 +
        game.state.config.privacy.holdMs,
    ) + 1;
  // Omitted inputs use the existing explicit skip mechanism, not a
  // role-dependent change to public progress or pending-seat bookkeeping.
  return command(game, { type: 'AdvancePhase' });
}

function advanceWithoutSkipping(game: TestGame) {
  game.context.now =
    Math.max(
      game.state.deadline ?? 0,
      game.state.phaseStarted +
        game.state.config.privacy.shieldSeconds * 1_000 +
        game.state.config.privacy.holdMs,
    ) + 1;
  return command(game, { type: 'AdvancePhase' }, false);
}

function exhaustedSlot() {
  const game = lastFaithful();
  game.state = {
    ...game.state,
    phase: 'SHADOW',
    shadowSlot: 1,
    shadowRound: 2,
    shadowEndAt: game.state.deadline,
    shields: ['s3'],
    shadowPicks: ['s0', 's1', 's2'].map((seatId, index) => ({
      seatId,
      cycle: 1,
      slot: 1,
      round: 2,
      choice: 's3',
      seq: index + 1,
    })),
  };
  resolveWindow(game);
  expect(game.state).toMatchObject({
    phase: 'SHADOW',
    shadowSlot: 2,
    shadowRound: 1,
  });
  expect(game.state.murderResolutions).toMatchObject([
    { slot: 1, chosen: 's3', outcome: 'protected' },
  ]);
  return game;
}

function shadow(game: TestGame, choice: string, seatId = 's0') {
  return command(game, { type: 'SubmitShadowChoice', slot: 2, choice }, false, {
    kind: 'player',
    seatId,
  });
}

describe('Q7: no living Faithful', () => {
  for (const parity of [false, true]) {
    for (const type of ['MarkDeparted', 'RemoveDisconnectedSeat']) {
      it(`wins immediately after ${type}, parity=${parity}`, () => {
        const game = lastFaithful(parity);
        const before = structuredClone(game.state);
        const result = command(game, { type, seatId: 's3' });
        expect(result.ok && result.events.map((event) => event.type)).toEqual([
          type === 'MarkDeparted' ? 'SeatRemoved' : 'DisconnectedSeatRemoved',
          'GameFinished',
        ]);
        expect(game.state).toMatchObject({
          phase: 'FINISHED',
          winner: 'traitor',
        });
        if (!result.ok) throw new Error(result.code);
        expect(replayFrom(before, result.events)).toEqual(game.state);
        // Engine command retries after termination are rejected without mutation;
        // request-key deduplication belongs to the server, not decide().
        const finished = structuredClone(game.state);
        expect(command(game, { type, seatId: 's3' }, false)).toEqual({
          ok: false,
          code: 'GAME_FINISHED',
        });
        expect(game.state).toEqual(finished);
      });
    }

    for (const revealStyle of [
      'all',
      'anonymous',
      'one-by-one',
      'speaker-circle',
    ] as const) {
      for (const context of ['cycle', 'final'] as const) {
        it(`wins on ${context} ${revealStyle} banishment itself, parity=${parity}`, () => {
          const game = lastFaithful(parity);
          game.state = {
            ...game.state,
            phase: 'VERDICT',
            voteContext: context,
            target: 's3',
            votes: { s0: 's3' },
            voteRevealOrder: revealStyle === 'speaker-circle' ? ['s0'] : [],
            config: {
              ...game.state.config,
              roundTable: { ...game.state.config.roundTable, revealStyle },
            },
          };
          if (revealStyle === 'speaker-circle') {
            command(game, { type: 'RevealVote' }, true, {
              kind: 'player',
              seatId: 's0',
            });
          } else {
            if (revealStyle === 'one-by-one') resolveWindow(game);
            resolveWindow(game);
          }
          expect(
            game.state.seats.find((seat) => seat.id === 's3')?.status,
          ).toBe('banished');
          expect(game.state).toMatchObject({
            phase: 'FINISHED',
            winner: 'traitor',
          });
          expect(game.events.at(-1)).toMatchObject({ type: 'GameFinished' });
        });
      }
    }

    it(`wins after direct final banishment, parity=${parity}`, () => {
      const game = lastFaithful(parity);
      game.state = {
        ...game.state,
        phase: 'FINAL_BANISH',
        votes: { s0: 's3' },
      };
      resolveWindow(game);
      expect(game.state).toMatchObject({
        phase: 'FINISHED',
        winner: 'traitor',
      });
      expect(game.state.seats.find((seat) => seat.id === 's3')?.status).toBe(
        'banished',
      );
    });
  }

  it('wins after murdering the last Faithful even with parity disabled', () => {
    const game = lastFaithful();
    game.state = {
      ...game.state,
      phase: 'SHADOW',
      shadowRound: 2,
      shadowSlot: 1,
      shadowEndAt: game.state.deadline,
      shadowPicks: ['s0', 's1', 's2'].map((seatId, index) => ({
        seatId,
        cycle: 1,
        slot: 1,
        round: 2,
        choice: 's3',
        seq: index + 1,
      })),
    };
    resolveWindow(game);
    expect(game.state).toMatchObject({ phase: 'FINISHED', winner: 'traitor' });
    expect(game.state.seats.find((seat) => seat.id === 's3')?.status).toBe(
      'murdered',
    );
    expect(game.state.murderResolutions).toMatchObject([
      { slot: 1, chosen: 's3', outcome: 'murdered' },
      { slot: 2, chosen: null, outcome: 'game-ended' },
    ]);
  });

  it('checks the last Faithful after each victim in a two-murder night', () => {
    const game = lastFaithful();
    game.state = {
      ...game.state,
      phase: 'SHADOW',
      shadowRound: 2,
      shadowSlot: 1,
      shadowEndAt: game.state.deadline,
      seats: game.state.seats.map((seat) => ({ ...seat, status: 'alive' })),
      shadowPicks: ['s0', 's1', 's2'].map((seatId, index) => ({
        seatId,
        cycle: 1,
        slot: 1,
        round: 2,
        choice: 's3',
        seq: index + 1,
      })),
    };
    resolveWindow(game);
    expect(game.state).toMatchObject({ phase: 'SHADOW', shadowSlot: 2 });
    for (const round of [1, 2]) {
      expect(game.state.shadowRound).toBe(round);
      expect(shadow(game, 's4').ok).toBe(true);
      resolveWindow(game);
    }
    expect(game.state).toMatchObject({ phase: 'FINISHED', winner: 'traitor' });
    expect(
      game.state.seats
        .filter((seat) => seat.status === 'murdered')
        .map((seat) => seat.id),
    ).toEqual(['s3', 's4']);
    expect(game.events.at(-1)).toMatchObject({
      type: 'GameFinished',
      winner: 'traitor',
      reason: 'no-faithful',
    });
  });

  it('does not turn ordinary disabled parity into a Traitor victory', () => {
    const game = lastFaithful();
    game.state.seats[4]!.status = 'alive';
    command(game, { type: 'MarkDeparted', seatId: 's3' });
    expect(game.state.phase).toBe('VOTE');
    expect(game.state.winner).toBeNull();
  });

  it('preserves the zero-living result rather than declaring a Traitor win', () => {
    const game = lastFaithful();
    game.state.seats = game.state.seats.map((seat, index) => ({
      ...seat,
      status: index === 0 ? 'alive' : 'departed',
    }));
    command(game, { type: 'MarkDeparted', seatId: 's0' });
    expect(game.state).toMatchObject({ phase: 'FINISHED', winner: 'faithful' });
  });
});

describe('Q7: exhausted second murder slot', () => {
  it('does not reveal hidden eligibility through a deadline transition without a submission', () => {
    const exhausted = exhaustedSlot();
    const available: TestGame = {
      ...exhausted,
      state: structuredClone(exhausted.state),
      events: [...exhausted.events],
      context: { ...exhausted.context },
    };
    available.state.seats[2]!.role = 'faithful';
    for (const game of [exhausted, available]) {
      expect(shadow(game, 's0', 's3').ok).toBe(true);
      game.context.now = Math.max(
        game.state.deadline ?? 0,
        game.state.phaseStarted + 60_000,
      );
    }
    const publicBefore = (game: TestGame) => {
      const view = viewFor({ kind: 'presenter' }, game.state);
      return {
        phase: view.phase,
        progress: view.progress,
        actionStatus: view.actionStatus,
        deadline: view.deadline,
      };
    };
    expect(publicBefore(exhausted)).toEqual(publicBefore(available));
    for (const game of [exhausted, available])
      command(game, { type: 'AdvancePhase' }, false, { kind: 'system' });
    // A public transition must not act as a test of hidden target eligibility.
    expect({
      phase: exhausted.state.phase,
      round: exhausted.state.shadowRound,
    }).toEqual({
      phase: available.state.phase,
      round: available.state.shadowRound,
    });
  });
  for (const choice of ['missing-seat', 's3', 's0', 's1']) {
    it(`accepts ${choice} in either round without manufacturing a victim`, () => {
      const game = exhaustedSlot();
      for (const round of [1, 2]) {
        expect(game.state.shadowRound).toBe(round);
        expect(shadow(game, choice).ok).toBe(true);
        // A retry replaces the same round/slot pick rather than duplicating it.
        expect(shadow(game, choice).ok).toBe(true);
        expect(
          game.state.shadowPicks.filter(
            (pick) =>
              pick.slot === 2 && pick.round === round && pick.seatId === 's0',
          ),
        ).toHaveLength(1);
        resolveWindow(game);
      }
      expect(game.state).toMatchObject({ phase: 'DAWN', winner: null });
      expect(game.state.murderResolutions.at(-1)).toMatchObject({
        slot: 2,
        chosen: null,
        outcome: 'no-target',
      });
      expect(
        game.events.find((event) => event.type === 'DawnResolved'),
      ).toMatchObject({
        victims: [],
        protected: ['s3'],
      });
      expect(
        game.state.seats.filter((seat) => seat.status === 'murdered'),
      ).toHaveLength(0);
    });
  }

  it('completes both rounds without any Traitor submission or organiser skip', () => {
    const game = exhaustedSlot();
    const start = game.events.length;
    for (const round of [1, 2]) {
      expect(game.state.shadowRound).toBe(round);
      expect(shadow(game, 's0', 's3').ok).toBe(true);
      const view = viewFor({ kind: 'presenter' }, game.state);
      // Public bookkeeping records actual interactions only, not private
      // no-target exemptions. Traitors remain publicly waiting.
      expect(view.progress).toEqual({ done: 1, total: 4 });
      expect(view.actionStatus).toEqual({ waiting: 3, total: 4 });
      expect(pendingActionSeatIds(game.state)).toEqual(['s0', 's1', 's2']);
      expect(advanceWithoutSkipping(game).ok).toBe(true);
    }
    expect(game.state.phase).toBe('DAWN');
    expect(game.state.murderResolutions.at(-1)).toMatchObject({
      slot: 2,
      picks: [],
      chosen: null,
      outcome: 'no-target',
    });
    expect(
      game.events
        .slice(start)
        .some(
          (event) =>
            event.type === 'PhaseActionSkipped' ||
            (event.type === 'ShadowSubmitted' && event.seatId !== 's3'),
        ),
    ).toBe(false);
  });

  it('requires every role before the deadline and preserves the full private window', () => {
    const game = exhaustedSlot();
    game.context.now =
      game.state.phaseStarted +
      game.state.config.privacy.shieldSeconds * 1_000 +
      game.state.config.privacy.holdMs +
      1;
    expect(command(game, { type: 'AdvancePhase' }, false)).toEqual({
      ok: false,
      code: 'PENDING_ACTIONS',
    });
    expect(shadow(game, 's0', 's3').ok).toBe(true);
    expect(game.context.now).toBeLessThan(game.state.deadline!);
    expect(command(game, { type: 'AdvancePhase' }, false)).toEqual({
      ok: false,
      code: 'PENDING_ACTIONS',
    });
    for (const seatId of ['s0', 's1', 's2'])
      expect(shadow(game, 's0', seatId).ok).toBe(true);
    expect(command(game, { type: 'AdvancePhase' }, false)).toEqual({
      ok: false,
      code: 'SHADOW_ROUND_NOT_DUE',
    });
    expect(advanceWithoutSkipping(game).ok).toBe(true);
    expect(shadow(game, 's0', 's3').ok).toBe(true);
    for (const seatId of ['s0', 's1', 's2'])
      expect(shadow(game, 's0', seatId).ok).toBe(true);
    game.context.now = game.state.deadline! - 1;
    expect(command(game, { type: 'AdvancePhase' }, false)).toEqual({
      ok: false,
      code: 'SHADOW_WINDOW_NOT_DUE',
    });
    expect(advanceWithoutSkipping(game).ok).toBe(true);
  });

  it('uses the scheduled deadline even when a second eligible target exists', () => {
    const game = exhaustedSlot();
    game.state.seats[2]!.role = 'faithful';
    expect(shadow(game, 's0', 's3').ok).toBe(true);
    expect(shadow(game, 's0', 's2').ok).toBe(true);
    expect(advanceWithoutSkipping(game).ok).toBe(true);
    expect(game.state.shadowRound).toBe(2);
  });

  for (const round of [1, 2] as const) {
    it(`does not make secret-dependent progress before round ${round}'s deadline`, () => {
      const exhausted = exhaustedSlot();
      const available: TestGame = {
        ...exhausted,
        state: structuredClone(exhausted.state),
        events: [...exhausted.events],
        context: { ...exhausted.context },
      };
      available.state.seats[2]!.role = 'faithful';
      for (const game of [exhausted, available]) {
        game.state.shadowRound = round;
        expect(shadow(game, 's0', 's3').ok).toBe(true);
        game.context.now = game.state.deadline! - 1;
        const before = structuredClone(game.state);
        expect(command(game, { type: 'AdvancePhase' }, false)).toEqual({
          ok: false,
          code: 'PENDING_ACTIONS',
        });
        expect(game.state).toEqual(before);
      }
    });
  }

  for (const timeoutChoice of ['leading', 'random', 'none'] as const) {
    it(`defaults every role equally with no submissions at exhausted deadlines (${timeoutChoice})`, () => {
      const game = exhaustedSlot();
      game.state.config.traitors.timeoutChoice = timeoutChoice;
      const before = structuredClone(game.state);
      const start = game.events.length;
      for (const round of [1, 2]) {
        expect(game.state.shadowRound).toBe(round);
        expect(pendingActionSeatIds(game.state)).toEqual([
          's0',
          's1',
          's2',
          's3',
        ]);
        expect(viewFor({ kind: 'presenter' }, game.state).progress).toEqual({
          done: 0,
          total: 4,
        });
        game.context.now = game.state.deadline!;
        expect(
          command(game, { type: 'AdvancePhase' }, false, { kind: 'system' }).ok,
        ).toBe(true);
      }
      expect(game.state).toMatchObject({ phase: 'DAWN', winner: null });
      expect(game.state.murderResolutions.at(-1)).toMatchObject({
        slot: 2,
        picks: [],
        chosen: null,
        outcome: 'no-target',
      });
      const emitted = game.events.slice(start);
      expect(
        emitted.some((event) =>
          [
            'PhaseActionSkipped',
            'ShadowSubmitted',
            'RandomChoiceRecorded',
          ].includes(event.type),
        ),
      ).toBe(false);
      expect(replayFrom(before, emitted)).toEqual(game.state);
    });
  }

  for (const scenario of [
    {
      victimDecision: 'majority',
      timeoutChoice: 'leading',
      picks: ['s4', 's4'],
      chosen: 's4',
    },
    {
      victimDecision: 'majority',
      timeoutChoice: 'random',
      picks: [],
      chosen: 's2',
    },
    {
      victimDecision: 'unanimous',
      timeoutChoice: 'leading',
      picks: ['s4'],
      chosen: 's4',
    },
    {
      victimDecision: 'unanimous',
      timeoutChoice: 'random',
      picks: ['s4'],
      chosen: 's4',
    },
    {
      victimDecision: 'unanimous',
      timeoutChoice: 'none',
      picks: ['s4'],
      chosen: null,
    },
  ] as const) {
    it(`preserves valid-target ${scenario.victimDecision}/${scenario.timeoutChoice} deadline resolution`, () => {
      const game = exhaustedSlot();
      game.state.seats[2]!.role = 'faithful';
      game.state.seats[4]!.status = 'alive';
      game.state.config.traitors.victimDecision = scenario.victimDecision;
      game.state.config.traitors.timeoutChoice = scenario.timeoutChoice;
      game.context.random.int = () => 0;
      const before = structuredClone(game.state);
      const start = game.events.length;
      game.context.now = game.state.deadline!;
      expect(
        command(game, { type: 'AdvancePhase' }, false, { kind: 'system' }).ok,
      ).toBe(true);
      for (const [index, choice] of scenario.picks.entries())
        expect(shadow(game, choice, `s${index}`).ok).toBe(true);
      expect(pendingActionSeatIds(game.state).length).toBeGreaterThan(0);
      game.context.now = game.state.deadline!;
      expect(
        command(game, { type: 'AdvancePhase' }, false, { kind: 'system' }).ok,
      ).toBe(true);
      expect(game.state.phase).toBe('DAWN');
      expect(game.state.murderResolutions.at(-1)).toMatchObject({
        slot: 2,
        chosen: scenario.chosen,
        outcome: scenario.chosen === null ? 'no-target' : 'murdered',
      });
      const emitted = game.events.slice(start);
      expect(emitted.some((event) => event.type === 'PhaseActionSkipped')).toBe(
        false,
      );
      if (scenario.chosen !== null)
        expect(emitted).toContainEqual(
          expect.objectContaining({
            type: 'RandomChoiceRecorded',
            purpose: 'murder-target',
            slot: 2,
            candidates: scenario.picks.length
              ? [scenario.chosen]
              : ['s2', 's4'],
            chosen: scenario.chosen,
          }),
        );
      expect(replayFrom(before, emitted)).toEqual(game.state);
    });
  }

  it('does not relax valid-target rules outside exhausted Traitor slot two', () => {
    for (const choice of ['missing-seat', 's3', 's0', 's1']) {
      const game = exhaustedSlot();
      game.state.seats[4]!.status = 'alive'; // Another eligible Faithful exists.
      expect(shadow(game, choice)).toEqual({
        ok: false,
        code: choice === 's3' ? 'DUPLICATE_SHADOW_CHOICE' : 'INVALID_TARGET',
      });
    }
    const first = exhaustedSlot();
    first.state.shadowSlot = 1;
    expect(
      command(first, { type: 'SubmitShadowChoice', choice: 's0' }, false, {
        kind: 'player',
        seatId: 's0',
      }),
    ).toEqual({ ok: false, code: 'INVALID_TARGET' });
    const faithful = exhaustedSlot();
    faithful.state.shadowPicks.push({
      cycle: 1,
      slot: 1,
      round: 2,
      seatId: 's3',
      choice: 's0',
      seq: 99,
    });
    expect(shadow(faithful, 's0', 's3')).toEqual({
      ok: false,
      code: 'DUPLICATE_SHADOW_CHOICE',
    });
  });

  it('keeps progress, pending seats, advance eligibility, options and timing role-neutral', () => {
    const game = exhaustedSlot();
    const exhausted = structuredClone(game.state);
    const available = structuredClone(exhausted);
    available.seats[2]!.role = 'faithful';
    const viewers: FullViewer[] = [
      { kind: 'presenter' },
      { kind: 'coordinator' },
      { kind: 'host' },
      { kind: 'admin' },
      { kind: 'ghost', seatId: 's4' },
      { kind: 'player', seatId: 's0' },
      { kind: 'player', seatId: 's3' },
    ];
    const visibleShape = (state: State, viewer: FullViewer) => {
      const view = viewFor(viewer, state);
      return {
        progress: view.progress,
        actionStatus: view.actionStatus,
        pending: view.coordinatorPendingSeats,
        canAdvance: view.canAdvancePhase,
        slot: view.shadowSlot,
        slots: view.murderSlots,
        deadline: view.deadline,
        options: view.private?.options,
      };
    };
    expect(pendingActionSeatIds(exhausted)).toEqual(
      pendingActionSeatIds(available),
    );
    for (const viewer of viewers) {
      expect(visibleShape(exhausted, viewer)).toEqual(
        visibleShape(available, viewer),
      );
      expect(viewFor(viewer, exhausted).murderSlots).toBe(2);
    }
    for (const state of [exhausted, available]) {
      state.shadowPicks.push({
        cycle: 1,
        slot: 2,
        round: 1,
        seatId: 's3',
        choice: 's0',
        seq: 99,
      });
    }
    for (const viewer of viewers) {
      expect(visibleShape(exhausted, viewer)).toEqual(
        visibleShape(available, viewer),
      );
      expect(viewFor(viewer, exhausted).progress).toEqual({
        done: 1,
        total: 4,
      });
      expect(viewFor(viewer, exhausted).actionStatus).toEqual({
        waiting: 3,
        total: 4,
      });
    }
    const before = {
      deadline: game.state.deadline,
      shadowEndAt: game.state.shadowEndAt,
    };
    expect(shadow(game, 's0').ok).toBe(true);
    expect({
      deadline: game.state.deadline,
      shadowEndAt: game.state.shadowEndAt,
    }).toEqual(before);
  });
});
