import { describe, expect, it } from 'vitest';
import { viewFor } from '../lib/engine/src/index';
import { command, advance, fixture, type TestGame } from './support/engine';

const base = {
  missions: { enabled: false },
  endgame: { size: 3 },
};

function game(
  players: number,
  roundTable: Record<string, unknown> = {},
): TestGame {
  const g = fixture(players, {
    ...base,
    roundTable: {
      tieRule: 'revote-random',
      contendersOnDraw: true,
      ...roundTable,
    },
  });
  command(g, { type: 'StartGame' });
  advance(g, 'VOTE');
  return g;
}

function vote(g: TestGame, voter: string, target: string) {
  command(g, { type: 'SubmitVote', target }, true, {
    kind: 'player',
    seatId: voter,
  });
}

function expire(g: TestGame) {
  if (g.state.deadline === null) throw new Error('no deadline');
  g.context.now = g.state.deadline + 1;
  command(g, { type: 'AdvancePhase' }, true, { kind: 'system' });
}

function views(g: TestGame) {
  return g.state.seats.map((seat) =>
    viewFor({ kind: 'player', seatId: seat.id }, g.state),
  );
}

// Fields that legitimately differ per seat; everything else must match.
function shared(view: object) {
  const rest: Record<string, unknown> = { ...view };
  delete rest.private;
  delete rest.viewerSeatId;
  delete rest.ownVoteTargetId;
  return rest;
}

// Two-way tie: s0 and s1 get one vote each, everyone else abstains.
function tieTwo(g: TestGame) {
  vote(g, 's2', 's0');
  vote(g, 's3', 's1');
}

describe('Contenders on a draw (D120)', () => {
  it('names the two tied players and opens a 3-minute Contenders discussion', () => {
    const g = game(6);
    tieTwo(g);
    expire(g);
    expect(g.state.phase).toBe('CONTENDERS');
    expect(g.state.revote).toBe(true);
    expect([...g.state.candidates].sort()).toEqual(['s0', 's1']);
    expect(g.state.deadline! - g.state.phaseStarted).toBe(3 * 60_000);
    expect(g.events.some((e) => e.type === 'SeatRemoved')).toBe(false);
    const all = views(g);
    expect(all[0]?.voteCandidates).toEqual(['s0', 's1']);
    for (const view of all)
      expect(view.voteCandidates).toEqual(all[0]?.voteCandidates);
  });

  it('makes all three players contenders on a three-way draw', () => {
    const g = game(7);
    vote(g, 's3', 's0');
    vote(g, 's4', 's1');
    vote(g, 's5', 's2');
    expire(g);
    expect(g.state.phase).toBe('CONTENDERS');
    expect([...g.state.candidates].sort()).toEqual(['s0', 's1', 's2']);
  });

  it('re-votes between the contenders only, after the discussion', () => {
    const g = game(6);
    tieTwo(g);
    expire(g);
    expire(g);
    expect(g.state.phase).toBe('VOTE');
    expect(g.state.revote).toBe(true);
    const outside = command(g, { type: 'SubmitVote', target: 's4' }, false, {
      kind: 'player',
      seatId: 's2',
    });
    expect(outside.ok).toBe(false);
    vote(g, 's2', 's0');
    vote(g, 's3', 's0');
    vote(g, 's1', 's0');
    expire(g);
    expect(g.state.phase).toBe('VERDICT');
    const closed = g.events.filter((e) => e.type === 'VoteClosed').at(-1);
    expect(closed).toMatchObject({ target: 's0' });
  });

  it('settles a second tie at random, announces it, and holds no second Contenders step', () => {
    const g = game(6);
    tieTwo(g);
    expire(g);
    expire(g);
    tieTwo(g);
    expire(g);
    const phases = g.events
      .filter((e) => e.type === 'PhaseChanged')
      .map((e) => (e as { phase: string }).phase);
    expect(phases.filter((p) => p === 'CONTENDERS')).toHaveLength(1);
    expect(g.state.phase).toBe('VERDICT');
    expect(g.events.some((e) => e.type === 'RandomChoiceRecorded')).toBe(true);
    expire(g);
    const all = views(g);
    expect(all[0]?.publicAnnouncement).toMatchObject({
      kind: 'verdict',
      chosenAtRandom: true,
    });
    for (const view of all)
      expect(view.publicAnnouncement).toEqual(all[0]?.publicAnnouncement);
  });

  it('banishes nobody when no ballots are cast, with or without a draw', () => {
    const none = game(6);
    expire(none);
    expect(none.state.phase).toBe('VERDICT');
    expect(none.events.some((e) => e.type === 'SeatRemoved')).toBe(false);

    const g = game(6);
    tieTwo(g);
    expire(g);
    expire(g);
    expire(g);
    expect(g.state.phase).toBe('VERDICT');
    expect(g.events.some((e) => e.type === 'SeatRemoved')).toBe(false);
    expect(views(g)[0]?.publicAnnouncement).toMatchObject({ kind: 'no_votes' });
  });

  it('keeps the straight re-vote when the setting is off', () => {
    const g = game(6, { contendersOnDraw: false });
    tieTwo(g);
    expire(g);
    expect(g.state.phase).toBe('VOTE');
    expect(g.state.revote).toBe(true);
  });

  it('defaults off in the schema so replayed older games keep their rule', () => {
    const g = fixture(5, base);
    expect(g.state.config.roundTable.contendersOnDraw).toBe(false);
  });

  it('never applies to the endgame banishment (C6 unchanged)', () => {
    const g = fixture(5, {
      ...base,
      roundTable: { tieRule: 'revote-random', contendersOnDraw: true },
    });
    command(g, { type: 'StartGame' });
    advance(g, 'FINAL_BANISH');
    if (g.state.phase !== 'FINAL_BANISH') return;
    expire(g);
    expect(g.state.phase).not.toBe('CONTENDERS');
  });

  it('keeps the same contenders through reconnect and organiser takeover', () => {
    const g = game(6);
    tieTwo(g);
    expire(g);
    const before = viewFor({ kind: 'player', seatId: 's4' }, g.state);
    command(g, { type: 'Pause' });
    command(g, { type: 'Resume' });
    const after = viewFor({ kind: 'player', seatId: 's4' }, g.state);
    expect(after.phase).toBe('CONTENDERS');
    expect(after.voteCandidates).toEqual(before.voteCandidates);
    // A replacement organiser moves the table on like the original.
    command(g, { type: 'AdvancePhase' });
    expect(g.state.phase).toBe('VOTE');
    expect([...g.state.candidates].sort()).toEqual(['s0', 's1']);
  });

  it('reveals no tied-vote ballot to any seat, in any reveal style', () => {
    for (const revealStyle of [
      'speaker-circle',
      'one-by-one',
      'all',
      'anonymous',
    ] as const) {
      const g = game(6, { revealStyle });
      tieTwo(g);
      expire(g);
      for (const seat of g.state.seats) {
        const view = viewFor({ kind: 'player', seatId: seat.id }, g.state);
        const text = JSON.stringify(view);
        expect(view.phase).toBe('CONTENDERS');
        // No ballot map, tally or reveal order reaches any phone.
        expect(text).not.toMatch(/"votes"\s*:\s*\{\s*"/);
        expect(view.voteCircle ?? null).toBeNull();
        expect(view.ballots ?? {}).toEqual({});
        // Every role gets the same shared fields.
        expect(shared(view)).toEqual(
          shared(viewFor({ kind: 'player', seatId: 's0' }, g.state)),
        );
      }
    }
  });
});

describe('Contenders setting defaults (D120)', () => {
  it('is on for new games and can be switched off', async () => {
    const { buildNewGameConfig } =
      await import('../artifacts/party-game/src/new-game-config');
    const input = {
      gameName: 'Test',
      playerCount: 8,
      coCoordinatorCount: 0,
      presenterEnabled: false,
    };
    expect(buildNewGameConfig(input).roundTable.contendersOnDraw).toBe(true);
    expect(
      buildNewGameConfig({ ...input, contendersOnDraw: false }).roundTable
        .contendersOnDraw,
    ).toBe(false);
  });
});
