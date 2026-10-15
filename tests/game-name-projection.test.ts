import { expect, it } from 'vitest';
import { replay, viewFor } from '../lib/engine/src';
import { gameConfigSchema } from '../lib/shared/src';

it('projects the public game name only to seated viewers', () => {
  const state = replay([
    {
      seq: 1,
      at: 0,
      schemaVersion: 1,
      type: 'GameCreated',
      id: 'game-1',
      config: gameConfigSchema.parse({
        basics: { gameName: 'Family game' },
      }),
    },
  ]);

  expect(viewFor({ kind: 'coordinator' }, state).gameName).toBe('Family game');
  expect(Object.keys(viewFor({ kind: 'visitor' }, state)).sort()).toEqual([
    'exists',
    'lobbyOpen',
    'phase',
    'seatCount',
  ]);
});

it('projects tied vote candidates to seated views without adding visitor data', () => {
  const state = replay([
    {
      seq: 1,
      at: 0,
      schemaVersion: 1,
      type: 'GameCreated',
      id: 'game-tied-vote',
      config: gameConfigSchema.parse({}),
    },
  ]);
  state.phase = 'VOTE';
  state.candidates = ['seat-a', 'seat-b'];

  const view = viewFor({ kind: 'coordinator' }, state);
  expect(view.voteCandidates).toEqual(['seat-a', 'seat-b']);
  expect(Object.keys(viewFor({ kind: 'visitor' }, state)).sort()).toEqual([
    'exists',
    'lobbyOpen',
    'phase',
    'seatCount',
  ]);
});
