import { describe, expect, it } from 'vitest';
import { viewFor } from '../lib/engine/src/index';
import { assertInvariants } from '../lib/engine/src/invariants';
import { command, advance, fixture } from './support/engine';

function advanceAfterDeadline(game: ReturnType<typeof fixture>) {
  if (game.state.deadline === null)
    throw new Error(`Expected a deadline in ${game.state.phase}`);
  game.context.now = game.state.deadline + 1;
  command(game, { type: 'AdvancePhase' });
}

describe('banishment verdict reveal', () => {
  it('keeps the result visible until the next phase advance', () => {
    const game = fixture(5, {
      missions: { enabled: false },
      roundTable: {
        tieRule: 'revote-random',
        revealStyle: 'one-by-one',
        revealRole: 'always',
      },
      endgame: { size: 3 },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'VOTE');

    const target = game.state.seats.find((seat) => seat.role === 'faithful');
    if (!target) throw new Error('Expected a Faithful seat to banish');
    const otherTarget = game.state.seats.find((seat) => seat.id !== target.id);
    if (!otherTarget) throw new Error('Expected another living seat');
    command(game, { type: 'SubmitVote', target: otherTarget.id }, true, {
      kind: 'player',
      seatId: target.id,
    });
    for (const voter of game.state.seats.filter(
      (seat) => seat.status === 'alive' && seat.id !== target.id,
    )) {
      command(game, { type: 'SubmitVote', target: target.id }, true, {
        kind: 'player',
        seatId: voter.id,
      });
    }

    advanceAfterDeadline(game);
    expect(game.state.phase).toBe('VERDICT');
    const voteCount = Object.keys(game.state.votes).length;
    expect(voteCount).toBeGreaterThan(0);

    while (game.state.revealed.length < voteCount) {
      advanceAfterDeadline(game);
      expect(game.state.phase).toBe('VERDICT');
    }

    advanceAfterDeadline(game);
    expect(game.state.publicAnnouncement).toMatchObject({
      kind: 'verdict',
      seatId: target.id,
    });
    expect(game.state.phase).toBe('VERDICT');
    const view = viewFor(
      { kind: 'player', seatId: otherTarget.id },
      game.state,
    );
    expect(Object.keys(view.ballots)).toHaveLength(voteCount);
    expect(view.ballots[target.id]).toBe(otherTarget.id);
    expect(() => assertInvariants(game.state)).not.toThrow();

    advanceAfterDeadline(game);
    expect(game.state.phase).toBe('SHADOW');
    expect(() => assertInvariants(game.state)).not.toThrow();
    expect(
      viewFor({ kind: 'player', seatId: otherTarget.id }, game.state).ballots,
    ).toEqual({});
  });
});
