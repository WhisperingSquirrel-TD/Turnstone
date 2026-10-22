import { afterEach, expect, it, vi } from 'vitest';
import type { State, Viewer } from '../lib/engine/src/index';
import type { FullView } from '../lib/shared/src/index';
import { runCompleteGame } from '../scripts/src/scenarios/simulate';

const projections = vi.hoisted(() => ({
  calls: [] as { state: State; viewer: Viewer }[],
  mutate: undefined as
    ((view: FullView, state: State, viewer: Viewer) => void) | undefined,
}));

vi.mock('../lib/engine/src/index', async (importOriginal) => {
  const engine =
    await importOriginal<typeof import('../lib/engine/src/index')>();
  return {
    ...engine,
    viewFor(viewer: Viewer, state: State) {
      projections.calls.push({ viewer, state });
      if (viewer.kind === 'visitor') return engine.viewFor(viewer, state);
      const view = engine.viewFor(viewer, state);
      projections.mutate?.(view, state, viewer);
      return view;
    },
  };
});

const options = {
  seed: 20261021,
  strategy: 'never-acts' as const,
  config: {
    players: { count: 5 },
    traitors: { number: 1, sleeper: false, recruitment: 'off' },
    missions: { enabled: false, shields: 'off' },
    tasks: { enabled: false },
    endgame: { size: 3, parity: false },
    schedule: { format: 'quick', plannedCycles: 1 },
  },
};

afterEach(() => {
  projections.calls = [];
  projections.mutate = undefined;
});

it('computes each living-seat private projection only once for an identical state', () => {
  const result = runCompleteGame(options);
  expect(result.checks.noLeaks).toBe(true);
  const byState = new Map<State, Set<string>>();
  for (const { state, viewer } of projections.calls) {
    if (!['DEAL', 'SHADOW'].includes(state.phase) || viewer.kind !== 'player')
      continue;
    const seats = byState.get(state) ?? new Set<string>();
    expect(seats.has(viewer.seatId!)).toBe(false);
    seats.add(viewer.seatId!);
    byState.set(state, seats);
  }
  expect(byState.size).toBeGreaterThan(1);
  for (const [state, seats] of byState)
    expect([...seats].sort()).toEqual(
      state.seats
        .filter((seat) => seat.status === 'alive')
        .map((seat) => seat.id)
        .sort(),
    );
});

it.each([
  ['DEAL', 'minimumDurationMs'],
  ['DEAL', 'options'],
  ['SHADOW', 'minimumDurationMs'],
  ['SHADOW', 'options'],
] as const)(
  'still rejects inconsistent %s %s in the reused living-player projections',
  (phase, field) => {
    projections.mutate = (view, state, viewer) => {
      if (
        state.phase !== phase ||
        viewer.kind !== 'player' ||
        viewer.seatId !== state.seats[0]?.id ||
        !view.private
      )
        return;
      if (field === 'minimumDurationMs') view.private.minimumDurationMs++;
      else view.private.options = [];
    };
    expect(() => runCompleteGame(options)).toThrow(
      'Private moments have inconsistent core timing or options',
    );
  },
);

it('still applies projection safety before reusing a living-player projection', () => {
  projections.mutate = (view, state, viewer) => {
    if (
      state.phase === 'DEAL' &&
      viewer.kind === 'player' &&
      state.seats.find((seat) => seat.id === viewer.seatId)?.role ===
        'faithful' &&
      view.private
    )
      view.private.team = [
        { id: 'leaked-traitor', name: 'Traitor', role: 'traitor' },
      ];
  };
  expect(() => runCompleteGame(options)).toThrow(
    'Faithful projection contains a Traitor team',
  );
});
