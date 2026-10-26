import { expect, it } from 'vitest';
import { viewFor } from '../lib/engine/src';
import { advance, command, fixture } from './support/engine';

// D109: the round table agrees who holds the shield; the organiser records it.
it('shows the round-table shield holder to everyone until dawn', () => {
  const game = fixture(8, {
    missions: { enabled: false, shields: 'public', allocation: 'coordinator' },
    schedule: { format: 'quick' },
  });
  command(game, { type: 'StartGame' });
  advance(game, 'DEBATE');
  const holder = game.state.seats.find((seat) => seat.status === 'alive')!;
  command(game, { type: 'AllocatePower', holders: [holder.id] });

  for (const viewer of [
    ...game.state.seats.map((seat) => ({
      kind: 'player' as const,
      seatId: seat.id,
    })),
    { kind: 'presenter' as const },
  ]) {
    const view = viewFor(viewer, game.state);
    expect(view.shieldsPublic).toBe(true);
    expect(view.shieldHolderIds).toEqual([holder.id]);
    expect(view.publicLog.at(-1)).toMatchObject({
      action: 'shield_given',
      seats: [{ id: holder.id, name: holder.name }],
    });
  }

  advance(game, 'DAWN');
  expect(
    viewFor({ kind: 'player', seatId: holder.id }, game.state).shieldHolderIds,
  ).toEqual([]);
});

it('never reveals a secret shield holder to any viewer or in the log', () => {
  const game = fixture(8, {
    missions: { enabled: true, shields: 'secret', allocation: 'random' },
    schedule: { format: 'quick' },
  });
  command(game, { type: 'StartGame' });
  advance(game, 'DEBATE');
  const holder = game.state.seats.find((seat) => seat.status === 'alive')!;
  game.state.shields = [holder.id];

  for (const viewer of [
    ...game.state.seats.map((seat) => ({
      kind: 'player' as const,
      seatId: seat.id,
    })),
    { kind: 'coordinator' as const },
    { kind: 'presenter' as const },
  ]) {
    const view = viewFor(viewer, game.state);
    expect(view.shieldsPublic).toBe(false);
    expect(view.shieldHolderIds).toEqual([]);
    expect(
      view.publicLog.some((entry) => entry.action === 'shield_given'),
    ).toBe(false);
  }
});
