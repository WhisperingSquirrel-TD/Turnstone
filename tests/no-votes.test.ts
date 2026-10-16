import { describe, expect, it } from 'vitest';
import { viewFor } from '../lib/engine/src/index';
import { command, advance, fixture } from './support/engine';

function expireCurrentStep(game: ReturnType<typeof fixture>) {
  if (game.state.deadline === null)
    throw new Error(`Expected a deadline in ${game.state.phase}`);
  game.context.now = game.state.deadline + 1;
  command(game, { type: 'AdvancePhase' });
}

describe('abstained banishment rounds', () => {
  it('moves on without a re-vote or banishment and announces the result to every phone', () => {
    const game = fixture(5, {
      missions: { enabled: false },
      roundTable: { tieRule: 'revote-random' },
      endgame: { size: 3 },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'VOTE');

    expireCurrentStep(game);

    expect(game.state.phase).toBe('VERDICT');
    expect(game.events.filter((event) => event.type === 'SeatRemoved')).toEqual(
      [],
    );
    expect(
      game.events.filter((event) => event.type === 'VoteSkipped'),
    ).toHaveLength(1);
    expect(game.events.filter((event) => event.type === 'VoteClosed')).toEqual(
      [],
    );

    const views = game.state.seats.map((seat) =>
      viewFor({ kind: 'player', seatId: seat.id }, game.state),
    );
    expect(views[0]?.publicAnnouncement).toMatchObject({
      kind: 'no_votes',
    });
    expect(views.map((view) => view.publicAnnouncement)).toEqual(
      views.map(() => views[0]?.publicAnnouncement),
    );
    expect(views[0]?.publicLog.at(-1)).toMatchObject({
      action: 'no_votes',
    });

    advance(game, 'SHADOW');
    expect(game.state.phase).toBe('SHADOW');
  });

  it('does not banish anyone when a tie re-vote receives no ballots', () => {
    const game = fixture(5, {
      missions: { enabled: false },
      roundTable: { tieRule: 'revote-random' },
      endgame: { size: 3 },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'VOTE');

    const [first, second, ...voters] = game.state.seats.map((seat) => seat.id);
    for (const [index, voter] of voters.slice(0, 2).entries())
      command(
        game,
        { type: 'SubmitVote', target: index === 0 ? first : second },
        true,
        { kind: 'player', seatId: voter! },
      );

    expireCurrentStep(game);
    expect(game.state.phase).toBe('VOTE');
    expect(game.state.revote).toBe(true);

    expireCurrentStep(game);

    expect(game.state.phase).toBe('VERDICT');
    expect(game.events.filter((event) => event.type === 'SeatRemoved')).toEqual(
      [],
    );
    expect(
      game.events.filter((event) => event.type === 'VoteSkipped'),
    ).toHaveLength(1);
    expect(game.state.publicAnnouncement).toMatchObject({
      kind: 'no_votes',
    });
  });
});
