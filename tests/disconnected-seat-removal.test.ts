import { describe, expect, it } from 'vitest';
import { replayFrom, viewFor } from '../lib/engine/src/index';
import { eventSchema } from '../lib/shared/src/contracts';
import {
  fixture,
  command,
  advance,
  skipPendingPlayerActions,
} from './support/engine';

function startGame(count = 5, config: Record<string, unknown> = {}) {
  const game = fixture(count, {
    missions: { enabled: false },
    traitors: { number: 1, sleeper: false, recruitment: 'off' },
    roundTable: { revealRole: 'always' },
    ...config,
  });
  command(game, { type: 'StartGame' });
  for (const seat of game.state.seats)
    command(game, { type: 'AcknowledgePrivate', ready: true }, true, {
      kind: 'player',
      seatId: seat.id,
    });
  advance(game, 'DEBATE');
  advance(game, 'VOTE');
  return game;
}

describe('disconnected-seat removal', () => {
  it('hides removed roles and role-identifying chat from every private viewer', () => {
    const game = startGame(8, {
      basics: { coordinatorPlays: false },
      ghosts: { seeRoles: true },
      traitors: { number: 2, sleeper: false, recruitment: 'off' },
    });
    const traitor = game.state.seats.find((seat) => seat.role === 'traitor')!;
    const ghost = game.state.seats.find((seat) => seat.role === 'faithful')!;
    command(
      game,
      { type: 'PostTraitorMessage', text: 'A private message from this seat.' },
      true,
      { kind: 'player', seatId: traitor.id },
    );
    command(game, { type: 'MarkDeparted', seatId: ghost.id });
    command(game, { type: 'RemoveDisconnectedSeat', seatId: traitor.id });
    expect(game.state.phase).toBe('VOTE');

    for (const viewer of [
      { kind: 'host', reveal: true },
      { kind: 'ghost', seatId: ghost.id, reveal: true },
      {
        kind: 'player',
        seatId: game.state.seats.find(
          (seat) => seat.role === 'traitor' && seat.status === 'alive',
        )!.id,
        reveal: true,
      },
    ] as const) {
      const view = viewFor(viewer, game.state);
      expect(view.private).not.toBeNull();
      expect(view.private!.team.some((seat) => seat.id === traitor.id)).toBe(
        false,
      );
      expect(
        view.private!.chat.some((item) => item.seatId === traitor.id),
      ).toBe(false);
      expect(
        view.seats.find((seat) => seat.id === traitor.id),
      ).not.toHaveProperty('role');
    }
    expect(
      viewFor({ kind: 'ghost', seatId: traitor.id, reveal: true }, game.state)
        .private,
    ).toBeNull();

    command(game, { type: 'EndGameEarly' });
    for (const viewer of [
      { kind: 'host', reveal: true },
      { kind: 'ghost', seatId: ghost.id, reveal: true },
      { kind: 'ghost', seatId: traitor.id, reveal: true },
    ] as const) {
      const view = viewFor(viewer, game.state);
      expect(
        view.private?.team.some((seat) => seat.id === traitor.id),
      ).not.toBe(true);
      expect(
        view.seats.find((seat) => seat.id === traitor.id),
      ).not.toHaveProperty('role');
      expect(view.fairness).toBeNull();
    }
  });

  it('cancels pending sleeper activation when the last Traitor is reinstated', () => {
    const game = startGame(8, {
      traitors: { number: 1, sleeper: true, recruitment: 'off' },
      endgame: { size: 3, trigger: 'alive' },
    });
    const traitor = game.state.seats.find((seat) => seat.role === 'traitor')!;
    const sleeperId = game.state.deal!.sleeper!;
    command(game, { type: 'RemoveDisconnectedSeat', seatId: traitor.id });
    expect(game.state.pendingSleeper).toBe(true);
    command(game, { type: 'ReinstateDisconnectedSeat', seatId: traitor.id });
    expect(game.state.pendingSleeper).toBe(false);

    advance(game, 'SHADOW');
    expect(game.state.seats.find((seat) => seat.id === sleeperId)?.role).toBe(
      'faithful',
    );
    expect(game.events.some((event) => event.type === 'SleeperActivated')).toBe(
      false,
    );
    expect(replayFrom(null, game.events)).toEqual(game.state);
  });

  it('preserves a valid pending sleeper when a Faithful is reinstated', () => {
    const game = startGame(8, {
      traitors: { number: 1, sleeper: true, recruitment: 'off' },
      endgame: { size: 3, trigger: 'alive' },
    });
    const traitor = game.state.seats.find((seat) => seat.role === 'traitor')!;
    const faithful = game.state.seats.find(
      (seat) =>
        seat.role === 'faithful' && seat.id !== game.state.deal!.sleeper,
    )!;
    command(game, { type: 'RemoveDisconnectedSeat', seatId: traitor.id });
    command(game, { type: 'RemoveDisconnectedSeat', seatId: faithful.id });
    command(game, { type: 'ReinstateDisconnectedSeat', seatId: faithful.id });
    expect(game.state.pendingSleeper).toBe(true);
    advance(game, 'SHADOW');
    expect(
      game.state.seats.find((seat) => seat.id === game.state.deal!.sleeper)
        ?.role,
    ).toBe('traitor');
  });

  it('removes a disconnected Traitor without revealing their role or side', () => {
    const game = startGame();
    const traitor = game.state.seats.find((seat) => seat.role === 'traitor')!;

    command(game, { type: 'RemoveDisconnectedSeat', seatId: traitor.id });

    expect(game.state.phase).toBe('FINISHED');
    expect(game.state.winner).toBe('faithful');
    const view = viewFor(
      {
        kind: 'player',
        seatId: game.state.seats.find((s) => s.status === 'alive')!.id,
      },
      game.state,
    );
    expect(view.winner).toBe('faithful');
    expect(
      view.seats.find((seat) => seat.id === traitor.id),
    ).not.toHaveProperty('role');
    expect(view.fairness).toBeNull();
    expect(view).not.toHaveProperty('coordinatorRestorableSeats');
    expect(
      view.publicLog.find((entry) => entry.action === 'seat_left_disconnected'),
    ).toMatchObject({
      action: 'seat_left_disconnected',
      reason: 'disconnected',
      seat: { id: traitor.id, name: traitor.name },
    });
    expect(JSON.stringify(view.publicLog.at(-1))).not.toContain('traitor');
  });

  it('allows a removed player back only before the next phase starts', () => {
    const game = startGame();
    const returning = game.state.seats.find(
      (seat) => seat.role === 'faithful',
    )!;

    command(game, {
      type: 'RemoveDisconnectedSeat',
      seatId: returning.id,
    });
    expect(
      viewFor({ kind: 'coordinator' }, game.state).coordinatorRestorableSeats,
    ).toEqual([{ id: returning.id, name: returning.name }]);
    expect(
      viewFor({ kind: 'player', seatId: returning.id }, game.state),
    ).not.toHaveProperty('coordinatorRestorableSeats');
    command(game, {
      type: 'ReinstateDisconnectedSeat',
      seatId: returning.id,
    });
    expect(
      game.state.seats.find((seat) => seat.id === returning.id)?.status,
    ).toBe('alive');

    command(game, {
      type: 'RemoveDisconnectedSeat',
      seatId: returning.id,
    });
    skipPendingPlayerActions(game);
    advance(game, 'VERDICT');
    const lateReinstatement = command(
      game,
      { type: 'ReinstateDisconnectedSeat', seatId: returning.id },
      false,
    );
    expect(lateReinstatement).toMatchObject({
      ok: false,
      code: 'REINSTATEMENT_WINDOW_CLOSED',
    });
    expect(
      game.state.seats.find((seat) => seat.id === returning.id)?.status,
    ).toBe('departed');
  });

  it('records an organiser handover as the same role-neutral public entry', () => {
    const game = startGame();
    const [first, second] = game.state.seats;
    const event = eventSchema.parse({
      schemaVersion: 1,
      seq: game.state.version + 1,
      at: game.state.phaseStarted,
      type: 'CoordinatorRoleMoved',
    });
    const updated = replayFrom(game.state, [event]);
    const firstView = viewFor({ kind: 'player', seatId: first!.id }, updated);
    const secondView = viewFor({ kind: 'player', seatId: second!.id }, updated);
    expect(firstView.publicLog.at(-1)).toEqual({
      seq: event.seq,
      at: event.at,
      action: 'coordinator_role_moved',
    });
    expect(secondView.publicLog).toEqual(firstView.publicLog);
  });
});
