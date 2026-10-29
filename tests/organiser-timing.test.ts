import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { pendingActionSeatIds, viewFor } from '../lib/engine/src/index';
import { command, advance, fixture, type TestGame } from './support/engine';

const config = {
  missions: { enabled: false },
  endgame: { size: 3 },
  roundTable: { tieRule: 'revote-random', contendersOnDraw: true },
};

function started(players = 6): TestGame {
  const g = fixture(players, config);
  command(g, { type: 'StartGame' });
  return g;
}

function sharedNotices(g: TestGame) {
  const notices = g.state.seats.map(
    (seat) =>
      viewFor({ kind: 'player', seatId: seat.id }, g.state).organiserNotice,
  );
  // Identical for every seat, so for Traitor and Faithful alike.
  for (const notice of notices) expect(notice).toEqual(notices[0]);
  const roles = new Set(g.state.seats.map((seat) => seat.role));
  expect(roles.has('traitor') && roles.has('faithful')).toBe(true);
  return notices[0];
}

function toContenders(g: TestGame) {
  advance(g, 'VOTE');
  for (const [voter, target] of [
    ['s2', 's0'],
    ['s3', 's1'],
  ] as const)
    command(g, { type: 'SubmitVote', target }, true, {
      kind: 'player',
      seatId: voter,
    });
  g.context.now = g.state.deadline! + 1;
  command(g, { type: 'AdvancePhase' }, true, { kind: 'system' });
  expect(g.state.phase).toBe('CONTENDERS');
}

const discussionSteps: Record<string, (g: TestGame) => void> = {
  DEBATE: (g) => advance(g, 'DEBATE'),
  CONTENDERS: toContenders,
  DAWN: (g) => advance(g, 'DAWN'),
};

describe('organiser-governed timing (D120)', () => {
  it('adds +5, +15, +30 or a custom 1 to 60 minutes and refuses anything else', () => {
    const g = started();
    advance(g, 'DEBATE');
    for (const minutes of [5, 15, 30, 7, 1, 60]) {
      const before = g.state.deadline!;
      command(g, { type: 'ExtendPhase', minutes });
      expect(g.state.deadline).toBe(before + minutes * 60_000);
      expect(sharedNotices(g)).toMatchObject({ kind: 'added_time', minutes });
    }
    for (const minutes of [0, 61, 2.5, -5])
      expect(command(g, { type: 'ExtendPhase', minutes }, false).ok).toBe(
        false,
      );
  });

  for (const [step, reach] of Object.entries(discussionSteps)) {
    for (const when of ['at 0 seconds', 'mid-step', 'after the guide time']) {
      it(`moves on from ${step} ${when} with the same notice for every role`, () => {
        const g = started();
        reach(g);
        expect(g.state.phase).toBe(step);
        const span = g.state.deadline! - g.state.phaseStarted;
        g.context.now =
          g.state.phaseStarted +
          (when === 'at 0 seconds'
            ? 0
            : when === 'mid-step'
              ? span / 2
              : span + 5_000);
        const before = g.state.phase;
        command(g, { type: 'AdvancePhase' });
        expect(g.state.phase).not.toBe(before);
        expect(sharedNotices(g)).toMatchObject({ kind: 'moved_on' });
      });
    }
  }

  it('lets the organiser move on during the very first Conversation', () => {
    const g = started();
    advance(g, 'DEBATE');
    expect(g.state.cycle).toBe(1);
    g.context.now = g.state.phaseStarted;
    command(g, { type: 'AdvancePhase' });
    expect(g.state.phase).toBe('VOTE');
  });

  it('shifts every later guide time: each step is timed from when it starts', () => {
    const g = started();
    advance(g, 'DEBATE');
    command(g, { type: 'ExtendPhase', minutes: 30 });
    g.context.now = g.state.phaseStarted + 1_000;
    command(g, { type: 'AdvancePhase' });
    expect(g.state.phase).toBe('VOTE');
    expect(g.state.phaseStarted).toBe(g.context.now);
    expect(g.state.deadline! - g.state.phaseStarted).toBe(
      g.state.config.roundTable.voteMinutes * 60_000,
    );
  });

  it('clears the notice when a step ends at its guide time, with no notice of its own', () => {
    const g = started();
    advance(g, 'DEBATE');
    command(g, { type: 'ExtendPhase', minutes: 5 });
    g.context.now = g.state.deadline! + 1;
    command(g, { type: 'AdvancePhase' }, true, { kind: 'system' });
    expect(g.state.phase).toBe('VOTE');
    expect(sharedNotices(g)).toBeNull();
  });

  it('never skips or time-forces action steps: votes, circle reveals and night choices', () => {
    const g = started();
    advance(g, 'VOTE');
    g.context.now = g.state.phaseStarted;
    expect(command(g, { type: 'AdvancePhase' }, false).ok).toBe(false);
    command(g, { type: 'ExtendPhase', minutes: 15 });
    expect(g.state.phase).toBe('VOTE');
    g.context.now = g.state.deadline! + 1;
    const pending = pendingActionSeatIds(g.state);
    expect(pending.length).toBeGreaterThan(0);
    for (const actor of [
      { kind: 'coordinator' },
      { kind: 'system' },
    ] as const) {
      const result = command(g, { type: 'AdvancePhase' }, false, actor);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('PENDING_ACTIONS');
    }
    expect(g.state.phase).toBe('VOTE');

    const circle = fixture(6, {
      ...config,
      roundTable: { ...config.roundTable, revealStyle: 'speaker-circle' },
    });
    command(circle, { type: 'StartGame' });
    advance(circle, 'VOTE');
    for (const voter of ['s1', 's2', 's3'])
      command(circle, { type: 'SubmitVote', target: 's0' }, true, {
        kind: 'player',
        seatId: voter,
      });
    circle.context.now = circle.state.deadline! + 1;
    command(circle, { type: 'AdvancePhase' }, true, { kind: 'system' });
    expect(circle.state.phase).toBe('VERDICT');
    const early = command(circle, { type: 'AdvancePhase' }, false);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('VOTE_CIRCLE_INCOMPLETE');
  });

  it('shows no notice in practice games, where the player moves on', () => {
    const g = fixture(5, {
      missions: { enabled: false },
      rehearsal: { enabled: true, botSeatIds: ['s1', 's2', 's3', 's4'] },
    });
    command(g, { type: 'StartGame' });
    advance(g, 'DEBATE');
    command(g, { type: 'AdvancePhase' });
    expect(g.state.organiserNotice).toBeNull();
  });

  it('property: any mix of add time and move on keeps steps valid and notices role-neutral', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.record({
              kind: fc.constant('extend' as const),
              minutes: fc.integer({ min: 1, max: 60 }),
            }),
            fc.record({
              kind: fc.constant('move' as const),
              fraction: fc.double({ min: 0, max: 1.5, noNaN: true }),
            }),
          ),
          { maxLength: 25 },
        ),
        (ops) => {
          const g = started(7);
          advance(g, 'DEBATE');
          for (const op of ops) {
            if (g.state.phase === 'FINISHED') break;
            const discussion = ['DEBATE', 'CONTENDERS', 'DAWN'].includes(
              g.state.phase,
            );
            if (op.kind === 'extend' && g.state.deadline !== null) {
              const before = g.state.deadline;
              command(g, { type: 'ExtendPhase', minutes: op.minutes });
              expect(g.state.deadline).toBe(before + op.minutes * 60_000);
            } else if (op.kind === 'move' && discussion) {
              const span = g.state.deadline! - g.state.phaseStarted;
              g.context.now = Math.round(
                g.state.phaseStarted + span * op.fraction,
              );
              command(g, { type: 'AdvancePhase' });
              expect(sharedNotices(g)).toMatchObject({ kind: 'moved_on' });
            } else {
              // Action steps only close through the normal path.
              advance(g, g.state.phase === 'VOTE' ? 'VERDICT' : 'DEBATE');
            }
            if (g.state.deadline !== null)
              expect(g.state.deadline).toBeGreaterThan(g.state.phaseStarted);
            sharedNotices(g);
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});
