import { describe, expect, it } from 'vitest';
import { viewFor } from '../lib/engine/src/index';
import { advance, command, fixture } from './support/engine';

function startAndAcknowledgeEverySeat() {
  const game = fixture(6, {
    missions: { enabled: false },
    traitors: { number: 1 },
  });
  command(game, { type: 'StartGame' });
  for (const seat of game.state.seats) {
    command(game, { type: 'AcknowledgePrivate', ready: true }, true, {
      kind: 'player',
      seatId: seat.id,
    });
  }
  return game;
}

function moveToVote() {
  const game = startAndAcknowledgeEverySeat();
  while (game.state.phase !== 'VOTE') {
    game.context.now = (game.state.deadline ?? game.state.phaseStarted) + 1;
    command(game, { type: 'AdvancePhase' });
  }
  return game;
}

function submitVotesForEverySeatExcept(
  game: ReturnType<typeof fixture>,
  pendingSeatId: string,
) {
  const target = game.state.seats.find(
    (seat) => seat.role === 'faithful' && seat.id !== pendingSeatId,
  )!;
  for (const seat of game.state.seats) {
    if (seat.id === pendingSeatId) continue;
    const voteTarget =
      seat.id === target.id
        ? game.state.seats.find((candidate) => candidate.id !== seat.id)!.id
        : target.id;
    command(game, { type: 'SubmitVote', target: voteTarget }, true, {
      kind: 'player',
      seatId: seat.id,
    });
  }
}

describe('Q6 phase action gate', () => {
  it('holds the role acknowledgement phase until every living player is ready', () => {
    const game = fixture(6, {
      missions: { enabled: false },
      traitors: { number: 1 },
    });
    command(game, { type: 'StartGame' });
    const pendingSeat = game.state.seats.at(-1)!;

    for (const seat of game.state.seats.slice(0, -1)) {
      command(game, { type: 'AcknowledgePrivate', ready: true }, true, {
        kind: 'player',
        seatId: seat.id,
      });
    }
    game.context.now = game.state.deadline! + 1;

    expect(
      command(game, { type: 'AdvancePhase' }, false, { kind: 'system' }),
    ).toMatchObject({ ok: false, code: 'PENDING_ACTIONS' });
    expect(game.state.phase).toBe('DEAL');

    command(game, { type: 'AcknowledgePrivate', ready: true }, true, {
      kind: 'player',
      seatId: pendingSeat.id,
    });
    command(game, { type: 'AdvancePhase' }, true, { kind: 'system' });
    expect(game.state.phase).toBe('DEBATE');
  });

  it('holds a ballot at its deadline and accepts the pending player before resolution', () => {
    const game = moveToVote();
    const pendingSeatId = game.state.seats.at(-1)!.id;
    submitVotesForEverySeatExcept(game, pendingSeatId);
    game.context.now = game.state.deadline! + 1;

    expect(
      command(game, { type: 'AdvancePhase' }, false, { kind: 'system' }),
    ).toMatchObject({ ok: false, code: 'PENDING_ACTIONS' });
    expect(game.state.phase).toBe('VOTE');

    const target = game.state.seats.find((seat) => seat.id !== pendingSeatId)!;
    command(game, { type: 'SubmitVote', target: target.id }, true, {
      kind: 'player',
      seatId: pendingSeatId,
    });
    command(game, { type: 'AdvancePhase' }, true, { kind: 'system' });
    expect(game.state.phase).toBe('VERDICT');
  });

  it('counts completed night choices, not acknowledgements, identically for every role', () => {
    const game = moveToVote();
    const target = game.state.seats.find((seat) => seat.role === 'faithful')!;
    for (const seat of game.state.seats) {
      const voteTarget =
        seat.id === target.id
          ? game.state.seats.find((candidate) => candidate.id !== seat.id)!.id
          : target.id;
      command(game, { type: 'SubmitVote', target: voteTarget }, true, {
        kind: 'player',
        seatId: seat.id,
      });
    }
    advance(game, 'SHADOW');

    const living = game.state.seats.filter((seat) => seat.status === 'alive');
    const pendingSeat = living.at(-1)!;
    for (const seat of living) {
      if (seat.id === pendingSeat.id) continue;
      const choice =
        seat.role === 'traitor'
          ? living.find(
              (candidate) =>
                candidate.role === 'faithful' && candidate.id !== seat.id,
            )!
          : living.find((candidate) => candidate.id !== seat.id)!;
      command(game, { type: 'SubmitShadowChoice', choice: choice.id }, true, {
        kind: 'player',
        seatId: seat.id,
      });
    }
    command(game, { type: 'AcknowledgePrivate' }, true, {
      kind: 'player',
      seatId: pendingSeat.id,
    });

    const traitor = living.find((seat) => seat.role === 'traitor')!;
    const faithful = living.find((seat) => seat.role === 'faithful')!;
    const traitorView = viewFor(
      { kind: 'player', seatId: traitor.id },
      game.state,
    );
    const faithfulView = viewFor(
      { kind: 'player', seatId: faithful.id },
      game.state,
    );
    const traitorProgress = traitorView.progress;
    const faithfulProgress = faithfulView.progress;
    expect(traitorProgress).toEqual({
      done: living.length - 1,
      total: living.length,
    });
    expect(faithfulProgress).toEqual(traitorProgress);
    expect(traitorView.actionStatus).toEqual({
      waiting: 1,
      total: living.length,
    });
    expect(faithfulView.actionStatus).toEqual(traitorView.actionStatus);
    expect(traitorView).not.toHaveProperty('coordinatorPendingSeats');
    const coordinatorView = viewFor({ kind: 'coordinator' }, game.state, {
      disconnectedSeatIds: [pendingSeat.id],
    });
    expect(coordinatorView.coordinatorPendingSeats).toEqual([
      {
        id: pendingSeat.id,
        name: pendingSeat.name,
        disconnected: true,
      },
    ]);

    game.context.now = game.state.deadline! + 1;
    expect(
      command(game, { type: 'AdvancePhase' }, false, { kind: 'system' }),
    ).toMatchObject({ ok: false, code: 'PENDING_ACTIONS' });
    expect(game.state.phase).toBe('SHADOW');
  });

  it('skips only a pending action and records a role-neutral public entry', () => {
    const game = moveToVote();
    const pendingSeatId = game.state.seats.at(-1)!.id;
    submitVotesForEverySeatExcept(game, pendingSeatId);

    command(game, { type: 'SkipPendingAction', seatId: pendingSeatId });
    expect(game.events.at(-1)).toMatchObject({
      type: 'PhaseActionSkipped',
      seatId: pendingSeatId,
      phase: 'VOTE',
      cycle: game.state.cycle,
    });
    const skipLog = viewFor(
      { kind: 'player', seatId: game.state.seats[0]!.id },
      game.state,
    ).publicLog.at(-1);
    expect(skipLog).toMatchObject({
      action: 'phase_action_skipped',
      seat: {
        id: pendingSeatId,
        name: game.state.seats.find((seat) => seat.id === pendingSeatId)!.name,
      },
      reason: 'disconnected',
      phase: 'VOTE',
    });
    expect(JSON.stringify(skipLog)).not.toMatch(/traitor|faithful/i);

    game.context.now = game.state.deadline! + 1;
    command(game, { type: 'AdvancePhase' }, true, { kind: 'system' });
    expect(game.state.phase).toBe('VERDICT');
  });

  it('allows a skip to be undone before resolution, then accepts the returning player action', () => {
    const game = moveToVote();
    const pendingSeatId = game.state.seats.at(-1)!.id;
    submitVotesForEverySeatExcept(game, pendingSeatId);
    command(game, { type: 'SkipPendingAction', seatId: pendingSeatId });
    command(game, { type: 'UndoPendingActionSkip', seatId: pendingSeatId });

    game.context.now = game.state.deadline! + 1;
    expect(
      command(game, { type: 'AdvancePhase' }, false, { kind: 'system' }),
    ).toMatchObject({ ok: false, code: 'PENDING_ACTIONS' });
    const target = game.state.seats.find((seat) => seat.id !== pendingSeatId)!;
    command(game, { type: 'SubmitVote', target: target.id }, true, {
      kind: 'player',
      seatId: pendingSeatId,
    });
    command(game, { type: 'AdvancePhase' }, true, { kind: 'system' });
    expect(game.state.phase).toBe('VERDICT');
  });
});
