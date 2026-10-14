import { describe, expect, it } from 'vitest';
import {
  evolve,
  viewFor,
  VISITOR_VIEW_ALLOW_LIST,
} from '../lib/engine/src/index';
import { eventSchema } from '../lib/shared/src/index';
import { fixture, command } from './support/engine';

function eventFor(
  version: number,
  type: string,
  payload: Record<string, unknown>,
) {
  return eventSchema.parse({
    seq: version + 1,
    at: 100 + version,
    schemaVersion: 1,
    type,
    ...payload,
  });
}

describe('shared public announcements', () => {
  it('shows the lobby code to seated viewers but never to a visitor', () => {
    const game = fixture(5);
    const player = viewFor(
      { kind: 'player', seatId: game.state.seats[0]!.id },
      game.state,
      { lobbyCode: 'ABC234' },
    );
    const presenter = viewFor({ kind: 'presenter' }, game.state, {
      lobbyCode: 'ABC234',
    });
    const coordinator = viewFor({ kind: 'coordinator' }, game.state, {
      lobbyCode: 'ABC234',
    });
    const visitor = viewFor({ kind: 'visitor' }, game.state, {
      lobbyCode: 'ABC234',
    });

    expect(player).toHaveProperty('lobbyCode', 'ABC234');
    expect(presenter).toHaveProperty('lobbyCode', 'ABC234');
    expect(coordinator).not.toHaveProperty('lobbyCode');
    expect(visitor).not.toHaveProperty('lobbyCode');
    expect(VISITOR_VIEW_ALLOW_LIST).not.toContain('lobbyCode');

    command(game, { type: 'StartGame' });
    expect(
      viewFor({ kind: 'player', seatId: game.state.seats[0]!.id }, game.state, {
        lobbyCode: 'ABC234',
      }),
    ).not.toHaveProperty('lobbyCode');
  });

  it('projects the same dawn result to every seated viewer without disclosing why nobody was taken', () => {
    const game = fixture(5);
    const protectedSeat = game.state.seats[0]!;
    const phase = evolve(
      game.state,
      eventFor(game.state.version, 'PhaseChanged', {
        phase: 'DAWN',
        deadline: null,
        shadowEndAt: null,
        cycle: 1,
      }),
    );
    const state = evolve(
      phase,
      eventFor(phase.version, 'DawnResolved', {
        victims: [],
        protected: [protectedSeat.id],
      }),
    );

    const faithful = viewFor(
      { kind: 'player', seatId: game.state.seats[1]!.id },
      state,
    );
    const coordinator = viewFor({ kind: 'coordinator' }, state);
    const presenter = viewFor({ kind: 'presenter' }, state);
    const visitor = viewFor({ kind: 'visitor' }, state);
    const phoneAnnouncements = game.state.seats.map(
      (seat) =>
        viewFor({ kind: 'player', seatId: seat.id }, state).publicAnnouncement,
    );

    expect(faithful.publicAnnouncement).toEqual({
      kind: 'dawn',
      cycle: 1,
      victims: [],
    });
    expect(coordinator.publicAnnouncement).toEqual(faithful.publicAnnouncement);
    expect(presenter.publicAnnouncement).toEqual(faithful.publicAnnouncement);
    expect(phoneAnnouncements).toEqual(
      game.state.seats.map(() => faithful.publicAnnouncement),
    );
    expect(visitor).not.toHaveProperty('publicAnnouncement');
    expect(JSON.stringify(faithful.publicAnnouncement)).not.toContain(
      protectedSeat.id,
    );
  });

  it('announces a banishment without revealing a role when the game configuration hides it', () => {
    const game = fixture(5);
    command(game, { type: 'StartGame' });
    const removed = game.state.seats[0]!;
    const state = evolve(
      game.state,
      eventFor(game.state.version, 'SeatRemoved', {
        seatId: removed.id,
        reason: 'banished',
        publicRole: false,
      }),
    );

    expect(
      viewFor({ kind: 'player', seatId: game.state.seats[1]!.id }, state)
        .publicAnnouncement,
    ).toEqual({
      kind: 'verdict',
      cycle: state.cycle,
      seat: { id: removed.id, name: removed.name },
    });
  });

  it('publishes the final outcome identically to players and coordinators', () => {
    const game = fixture(5);
    const state = evolve(
      game.state,
      eventFor(game.state.version, 'GameFinished', {
        winner: 'faithful',
        reason: 'no-traitors',
      }),
    );

    expect(
      viewFor({ kind: 'player', seatId: game.state.seats[0]!.id }, state)
        .publicAnnouncement,
    ).toEqual({
      kind: 'finished',
      winner: 'faithful',
    });
    expect(viewFor({ kind: 'coordinator' }, state).publicAnnouncement).toEqual(
      viewFor({ kind: 'player', seatId: game.state.seats[0]!.id }, state)
        .publicAnnouncement,
    );
    const phoneAnnouncements = game.state.seats.map(
      (seat) =>
        viewFor({ kind: 'player', seatId: seat.id }, state).publicAnnouncement,
    );
    expect(phoneAnnouncements).toEqual(
      game.state.seats.map(() => phoneAnnouncements[0]),
    );
  });
});
