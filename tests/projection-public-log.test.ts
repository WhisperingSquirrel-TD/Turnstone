import { afterEach, expect, it, vi } from 'vitest';
import { viewFor, type State } from '../lib/engine/src';
import { fullViewSchema } from '../lib/shared/src';
import { fixture } from './support/engine';

afterEach(() => vi.restoreAllMocks());

function example() {
  const { state } = fixture(5);
  state.publicLog = [
    { seq: 1, at: 0, action: 'dawn', victimIds: ['s0', 's1'] },
    {
      seq: 2,
      at: 1,
      action: 'phase_action_skipped',
      seatId: 's0',
      phase: 'VOTE',
      reason: 'disconnected',
    },
    { seq: 3, at: 2, action: 'finished', winner: 'traitor' },
  ];
  return state;
}

it('validates identical public-log contents once while returning independent mutable views', () => {
  const state = example();
  const parse = vi.spyOn(fullViewSchema.shape.publicLog.element, 'safeParse');
  const first = viewFor({ kind: 'coordinator' }, state);
  const player = viewFor({ kind: 'player', seatId: 's0' }, state);
  const presenter = viewFor({ kind: 'presenter' }, state);
  const again = viewFor({ kind: 'coordinator' }, state, {
    disconnectedSeatIds: ['s0'],
  });

  expect(parse).toHaveBeenCalledTimes(3);
  expect(player.publicLog).toEqual(first.publicLog);
  expect(again.publicLog).toEqual(first.publicLog);
  expect(presenter.publicLog).toEqual(first.publicLog.slice(0, 2));
  expect(again.publicLog).not.toBe(first.publicLog);
  expect(again.publicLog[0]).not.toBe(first.publicLog[0]);
  const dawn = first.publicLog[0]!;
  const otherDawn = again.publicLog[0]!;
  if (dawn.action !== 'dawn' || otherDawn.action !== 'dawn')
    throw new Error('Expected dawn');
  expect(otherDawn.victims).not.toBe(dawn.victims);
  expect(otherDawn.victims[0]).not.toBe(dawn.victims[0]);
  dawn.victims[0]!.name = 'tampered';
  dawn.victims.push({ id: 'injected', name: 'injected' });
  first.publicLog.splice(1, 1);
  const skipped = player.publicLog[1]!;
  if (skipped.action !== 'phase_action_skipped')
    throw new Error('Expected skipped action');
  skipped.seat.name = 'tampered';
  expect(viewFor({ kind: 'coordinator' }, state).publicLog).toEqual(
    again.publicLog,
  );
  expect(parse).toHaveBeenCalledTimes(3);
  expect(state.seats[0]!.name).not.toBe('tampered');
});

it('revalidates in-place source, nested array, seat-name and cross-state changes', () => {
  const state = example();
  const parse = vi.spyOn(fullViewSchema.shape.publicLog.element, 'safeParse');
  viewFor({ kind: 'coordinator' }, state);
  state.seats[0]!.name = 'Renamed';
  expect(viewFor({ kind: 'coordinator' }, state).publicLog[0]).toMatchObject({
    victims: [{ id: 's0', name: 'Renamed' }, { id: 's1' }],
  });
  expect(parse).toHaveBeenCalledTimes(5);
  const dawn = state.publicLog[0]!;
  if (dawn.action !== 'dawn') throw new Error('Expected dawn');
  dawn.victimIds.reverse();
  expect(viewFor({ kind: 'coordinator' }, state).publicLog[0]).toMatchObject({
    victims: [{ id: 's1' }, { id: 's0', name: 'Renamed' }],
  });
  expect(parse).toHaveBeenCalledTimes(6);
  const other = { ...state, seats: structuredClone(state.seats) };
  other.seats[0]!.name = 'Other game';
  expect(viewFor({ kind: 'coordinator' }, other).publicLog[1]).toMatchObject({
    seat: { name: 'Other game' },
  });
  expect(viewFor({ kind: 'coordinator' }, state).publicLog[1]).toMatchObject({
    seat: { name: 'Renamed' },
  });
  state.publicLog.push({ seq: 4, at: 3, action: 'no_votes' });
  expect(viewFor({ kind: 'coordinator' }, state).publicLog).toHaveLength(4);
  state.publicLog.splice(0, 1);
  expect(viewFor({ kind: 'coordinator' }, state).publicLog[0]!.seq).toBe(2);
});

it.each([
  ['seq', 0],
  ['at', -1],
  ['action', 'unknown'],
  ['winner', 'unknown'],
] as const)('rejects invalid %s even after warming the log', (key, value) => {
  const state = example();
  const initial = viewFor({ kind: 'coordinator' }, state);
  const entry = state.publicLog[2]!;
  Object.assign(entry, { [key]: value });
  const expected = structuredClone(initial);
  Object.assign(expected.publicLog[2]!, { [key]: value });
  state.pot = -1;
  expected.pot = -1;
  const reference = fullViewSchema.safeParse(expected);
  expect(reference.success).toBe(false);
  try {
    viewFor({ kind: 'coordinator' }, state);
    throw new Error('Expected schema rejection');
  } catch (error) {
    expect(error).toHaveProperty('issues');
    if (!reference.success)
      expect((error as { issues: unknown }).issues).toEqual(
        reference.error.issues,
      );
  }
  if (key !== 'action')
    expect(
      viewFor({ kind: 'presenter' }, { ...state, pot: 0 }).publicLog,
    ).toEqual(initial.publicLog.slice(0, 2));
});

it('does not freeze or retain source aliases, and strips unprojected fields', () => {
  const state = example();
  Object.assign(state.publicLog[0]!, { secret: 'do not disclose' });
  const output = viewFor({ kind: 'admin' }, state);
  expect(JSON.stringify(output)).not.toContain('do not disclose');
  expect(Object.isFrozen(output.publicLog)).toBe(false);
  expect(Object.isFrozen(output.publicLog[0])).toBe(false);
  expect(Object.isFrozen(state.publicLog[0])).toBe(false);
  Object.assign(state.publicLog[0]!, { at: 100 });
  expect(viewFor({ kind: 'admin' }, state).publicLog[0]!.at).toBe(100);
  const clone = structuredClone(state) as State;
  expect(viewFor({ kind: 'admin' }, clone)).toEqual(
    viewFor({ kind: 'admin' }, state),
  );
});

it('preserves every public-log variant, nested contents, and schema JSON key ordering', () => {
  const state = example();
  const actions: State['publicLog'] = [
    { seq: 1, at: 0, action: 'seat_pin_reset', seatId: 's0' },
    { seq: 2, at: 1, action: 'device_recovered', seatId: 's0' },
    { seq: 3, at: 2, action: 'dawn', victimIds: ['s0', 'missing'] },
    { seq: 4, at: 3, action: 'no_votes' },
    { seq: 5, at: 4, action: 'banishment', seatId: 's0' },
    { seq: 6, at: 5, action: 'seat_departed', seatId: 's0' },
    {
      seq: 7,
      at: 6,
      action: 'seat_left_disconnected',
      seatId: 's0',
      reason: 'disconnected',
    },
    { seq: 8, at: 7, action: 'seat_reinstated', seatId: 's0' },
    { seq: 9, at: 8, action: 'coordinator_role_moved' },
    {
      seq: 10,
      at: 9,
      action: 'phase_action_skipped',
      seatId: 's0',
      phase: 'SHADOW',
      reason: 'disconnected',
    },
    {
      seq: 11,
      at: 10,
      action: 'phase_action_skip_undone',
      seatId: 's0',
      phase: 'SHADOW',
    },
    { seq: 12, at: 11, action: 'schedule_shift', minutes: 15 },
    { seq: 13, at: 12, action: 'coordinator_undo' },
    { seq: 14, at: 13, action: 'finished', winner: 'faithful' },
  ];
  state.publicLog = actions;
  const seat = { id: 's0', name: state.seats[0]!.name };
  const expected = [
    {
      seq: 1,
      at: 0,
      action: 'seat_pin_reset',
      name: seat.name,
      seatId: seat.id,
    },
    {
      seq: 2,
      at: 1,
      action: 'device_recovered',
      name: seat.name,
      seatId: seat.id,
    },
    {
      seq: 3,
      at: 2,
      action: 'dawn',
      victims: [seat, { id: 'missing', name: '' }],
    },
    { seq: 4, at: 3, action: 'no_votes' },
    { seq: 5, at: 4, action: 'banishment', seat },
    { seq: 6, at: 5, action: 'seat_departed', seat },
    {
      seq: 7,
      at: 6,
      action: 'seat_left_disconnected',
      seat,
      reason: 'disconnected',
    },
    { seq: 8, at: 7, action: 'seat_reinstated', seat },
    { seq: 9, at: 8, action: 'coordinator_role_moved' },
    {
      seq: 10,
      at: 9,
      action: 'phase_action_skipped',
      seat,
      phase: 'SHADOW',
      reason: 'disconnected',
    },
    {
      seq: 11,
      at: 10,
      action: 'phase_action_skip_undone',
      seat,
      phase: 'SHADOW',
    },
    { seq: 12, at: 11, action: 'schedule_shift', minutes: 15 },
    { seq: 13, at: 12, action: 'coordinator_undo' },
    { seq: 14, at: 13, action: 'finished', winner: 'faithful' },
  ];
  for (const kind of [
    'admin',
    'coordinator',
    'player',
    'ghost',
    'host',
    'presenter',
  ] as const) {
    const view = viewFor({ kind, seatId: 's0', reveal: true }, state);
    expect(view.publicLog).toEqual(
      kind === 'presenter' ? expected.slice(0, -1) : expected,
    );
    expect(JSON.stringify(view)).toBe(
      JSON.stringify(fullViewSchema.parse(view)),
    );
  }
  for (const action of actions) {
    action.seq += 100;
    action.at += 100;
  }
  expect(viewFor({ kind: 'admin' }, state).publicLog).toEqual(
    expected.map((entry) => ({
      ...entry,
      seq: entry.seq + 100,
      at: entry.at + 100,
    })),
  );
});

it.each([
  ['reason', 'invalid'],
  ['phase', 'invalid'],
  ['seatId', ''],
] as const)(
  'revalidates nested skipped-action %s and preserves complete errors',
  (key, value) => {
    const state = example();
    const expected = viewFor({ kind: 'admin' }, state);
    Object.assign(state.publicLog[1]!, { [key]: value });
    const entry = expected.publicLog[1]!;
    if (entry.action !== 'phase_action_skipped')
      throw new Error('Expected skip');
    if (key === 'seatId') {
      entry.seat.id = value;
      entry.seat.name = '';
    } else Object.assign(entry, { [key]: value });
    const reference = fullViewSchema.safeParse(expected);
    expect(reference.success).toBe(false);
    try {
      viewFor({ kind: 'admin' }, state);
      throw new Error('Expected schema rejection');
    } catch (error) {
      expect(error).toHaveProperty('issues');
      if (!reference.success) {
        expect((error as { issues: unknown }).issues).toEqual(
          reference.error.issues,
        );
        expect((error as Error).message).toBe(reference.error.message);
      }
    }
  },
);

it('keeps mutable viewer, disclosure, lobby and presence context separate from shared log contents', () => {
  const state = example();
  state.seats[0]!.role = 'traitor';
  state.seats[1]!.role = 'faithful';
  const viewer = { kind: 'player' as const, seatId: 's0', reveal: true };
  const context = { lobbyCode: 'ABC234', disconnectedSeatIds: [] as string[] };
  expect(viewFor(viewer, state, context).private?.role).toBe('traitor');
  expect(viewFor(viewer, state, context).lobbyCode).toBe('ABC234');
  viewer.seatId = 's1';
  const faithful = viewFor(viewer, state, context);
  expect(faithful.private?.role).toBe('faithful');
  expect(faithful.private?.team).toEqual([]);
  viewer.reveal = false;
  context.lobbyCode = 'DEF567';
  const concealed = viewFor(viewer, state, context);
  expect(concealed.private).toBeNull();
  expect(concealed.lobbyCode).toBe('DEF567');
  expect(
    viewFor({ kind: 'presenter', reveal: true }, state).private,
  ).toBeNull();
  expect(viewFor({ kind: 'visitor', reveal: true }, state)).not.toHaveProperty(
    'publicLog',
  );
  state.phase = 'VOTE';
  expect(
    viewFor({ kind: 'coordinator' }, state, context).coordinatorPendingSeats,
  ).toContainEqual({
    id: 's0',
    name: state.seats[0]!.name,
    disconnected: false,
  });
  context.disconnectedSeatIds.push('s0');
  const coordinator = viewFor({ kind: 'coordinator' }, state, context);
  expect(coordinator.coordinatorPendingSeats).toContainEqual({
    id: 's0',
    name: state.seats[0]!.name,
    disconnected: true,
  });
  expect(coordinator.publicLog).toEqual(concealed.publicLog);
});

it('rejects nested victim mutation after warming, then accepts repaired contents without stale errors', () => {
  const state = example();
  const initial = viewFor({ kind: 'admin' }, state);
  const dawn = state.publicLog[0]!;
  if (dawn.action !== 'dawn') throw new Error('Expected dawn');
  dawn.victimIds[0] = '';
  try {
    viewFor({ kind: 'admin' }, state);
    throw new Error('Expected schema rejection');
  } catch (error) {
    expect(error).toHaveProperty('issues');
    expect((error as { issues: unknown[] }).issues).toContainEqual(
      expect.objectContaining({
        path: ['publicLog', 0, 'victims', 0, 'id'],
      }),
    );
  }
  dawn.victimIds[0] = 's0';
  expect(viewFor({ kind: 'admin' }, state)).toEqual(initial);
  Object.assign(dawn, { action: 'coordinator_undo' });
  expect(viewFor({ kind: 'admin' }, state).publicLog[0]).toEqual({
    seq: 1,
    at: 0,
    action: 'coordinator_undo',
  });
});
