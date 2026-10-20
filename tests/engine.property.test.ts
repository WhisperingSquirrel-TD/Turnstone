import { expect, it } from 'vitest';
import fc from 'fast-check';
import {
  replay,
  viewFor,
  VIEW_ALLOW_LIST,
  VISITOR_VIEW_ALLOW_LIST,
  assertInvariants,
} from '../lib/engine/src/index';
import { advance, fixture, command } from './support/engine';

it('preserves deal, replay, projection allow-lists and secret isolation across seat/Traitor counts', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 5, max: 40 }),
      fc.integer({ min: 1, max: 8 }),
      (count, value) => {
        const traitors = Math.min(count - 1, value);
        const game = fixture(count, { traitors: { number: traitors } });
        command(game, { type: 'StartGame' });
        expect(
          game.state.seats.filter((seat) => seat.role === 'traitor'),
        ).toHaveLength(traitors);
        assertInvariants(game.state);
        expect(replay(game.events)).toEqual(game.state);
        const original = JSON.stringify(game.state);
        for (const kind of ['coordinator', 'presenter', 'admin'] as const) {
          const view = viewFor({ kind, reveal: true }, game.state);
          expect(
            Object.keys(view).every((key) =>
              (VIEW_ALLOW_LIST as readonly string[]).includes(key),
            ),
          ).toBe(true);
          expect(view).toHaveProperty('publicAnnouncement');
          expect(view.private).toBeNull();
          expect(view.seats.every((seat) => seat.role === undefined)).toBe(
            true,
          );
          expect(view.fairness).toBeNull();
          expect(JSON.stringify(view)).not.toContain(game.state.deal!.salt);
        }
        for (const seat of game.state.seats) {
          const concealed = viewFor(
            { kind: 'player', seatId: seat.id },
            game.state,
          );
          expect(concealed.private).toBeNull();
          const revealed = viewFor(
            { kind: 'player', seatId: seat.id, reveal: true },
            game.state,
          );
          expect(revealed.private?.role).toBe(seat.role);
          if (seat.role === 'faithful')
            expect(revealed.private?.team).toEqual([]);
        }
        expect(JSON.stringify(game.state)).toBe(original);
      },
    ),
    { numRuns: 100, seed: 20261012 },
  );
});

it('keeps every visitor projection limited to join-screen data, even after ballot reveal', () => {
  fc.assert(
    fc.property(fc.integer({ min: 5, max: 20 }), (count) => {
      const game = fixture(count);
      command(game, { type: 'StartGame' });
      advance(game, 'VOTE');
      for (const seat of game.state.seats) {
        command(
          game,
          {
            type: 'SubmitVote',
            target: seat.id === 's0' ? 's1' : 's0',
          },
          true,
          { kind: 'player', seatId: seat.id },
        );
      }
      advance(game, 'VERDICT');
      command(game, { type: 'AdvancePhase' });

      const visitor = viewFor({ kind: 'visitor', reveal: true }, game.state);

      expect(Object.keys(visitor).sort()).toEqual(
        [...VISITOR_VIEW_ALLOW_LIST].sort(),
      );
      expect(visitor).toEqual({
        exists: true,
        phase: 'VERDICT',
        lobbyOpen: false,
        seatCount: count,
      });
      expect(JSON.stringify(visitor)).not.toContain('Player ');
      expect(visitor).not.toHaveProperty('ballots');
      expect(visitor).not.toHaveProperty('pot');
      expect(visitor).not.toHaveProperty('commitment');
    }),
    { numRuns: 20, seed: 20261013 },
  );
});

it('never exposes an unrevealed in-room ballot outside its owner phone', () => {
  fc.assert(
    fc.property(fc.integer({ min: 5, max: 20 }), (count) => {
      const game = fixture(count, {
        roundTable: { revealStyle: 'speaker-circle' },
      });
      command(game, { type: 'StartGame' });
      advance(game, 'VOTE');
      const viewers = [
        ...game.state.seats.map((seat) => ({
          kind: 'player' as const,
          seatId: seat.id,
        })),
        { kind: 'coordinator' as const },
        { kind: 'presenter' as const },
        { kind: 'admin' as const },
      ];
      for (const [index, seat] of game.state.seats.entries()) {
        const target =
          index === 0 ? game.state.seats[1]! : game.state.seats[0]!;
        command(game, { type: 'SubmitVote', target: target.id }, true, {
          kind: 'player',
          seatId: seat.id,
        });
        for (const viewer of viewers) {
          const projected = viewFor(viewer, game.state) as unknown as {
            ballots: Record<string, string>;
          };
          expect(projected.ballots).toEqual({});
        }
      }

      const votingView = viewFor({ kind: 'presenter' }, game.state);
      expect(votingView.ballots).toEqual({});
      expect(votingView).not.toHaveProperty('voteCircle');
      expect(votingView).not.toHaveProperty('ownVoteTargetId');

      advance(game, 'VERDICT');
      const circleView = viewFor(
        { kind: 'player', seatId: game.state.seats[0]!.id },
        game.state,
      ) as unknown as {
        ballots: Record<string, string>;
        voteCircle?: { speakerSeatId: string | null };
      };
      const speakerId = circleView.voteCircle?.speakerSeatId;
      expect(speakerId).toBeTruthy();
      expect(circleView.ballots).toEqual({});
      for (const seat of game.state.seats) {
        const playerView = viewFor(
          { kind: 'player', seatId: seat.id },
          game.state,
        ) as unknown as {
          ballots: Record<string, string>;
          voteCircle?: { speakerSeatId: string | null };
        };
        expect(playerView.ballots).toEqual({});
        expect(playerView.voteCircle?.speakerSeatId).toBe(speakerId);
      }
      const presenterCircleView = viewFor({ kind: 'presenter' }, game.state);
      expect(presenterCircleView.ballots).toEqual({});
      expect(presenterCircleView).not.toHaveProperty('voteCircle');
      expect(presenterCircleView).not.toHaveProperty('ownVoteTargetId');
      command(game, { type: 'RevealVote' }, true, {
        kind: 'player',
        seatId: speakerId!,
      });

      const revealed = Object.fromEntries([
        [speakerId!, game.state.votes[speakerId!]!],
      ]);
      for (const viewer of viewers) {
        const projected = viewFor(viewer, game.state) as unknown as {
          ballots: Record<string, string>;
          ownVoteTargetId?: string;
          voteCircle?: { speakerSeatId: string | null };
        };
        expect(projected.ballots).toEqual(
          viewer.kind === 'presenter' ? {} : revealed,
        );
        if (viewer.kind === 'presenter') {
          expect(projected).not.toHaveProperty('voteCircle');
          expect(projected).not.toHaveProperty('ownVoteTargetId');
        }
        if (viewer.kind === 'player') {
          expect(projected.ownVoteTargetId).toBe(
            game.state.votes[viewer.seatId],
          );
        } else {
          expect(projected).not.toHaveProperty('ownVoteTargetId');
        }
      }
    }),
    { numRuns: 15, seed: 20261020 },
  );
});

it('invariants reject corrupted role ownership and negative pots', () => {
  const game = fixture(5);
  command(game, { type: 'StartGame' });
  expect(() => assertInvariants({ ...game.state, pot: -1 })).toThrow();
  expect(() =>
    assertInvariants({
      ...game.state,
      seats: [...game.state.seats, game.state.seats[0]!],
    }),
  ).toThrow();
  expect(() =>
    assertInvariants({
      ...game.state,
      seats: game.state.seats.map((seat, index) =>
        index === 0 ? { ...seat, role: null } : seat,
      ),
    }),
  ).toThrow();
});
