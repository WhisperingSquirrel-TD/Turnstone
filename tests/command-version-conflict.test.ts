import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { replay } from '../lib/engine/src';
import { createApp } from '../artifacts/api-server/src/app';
import { advance, command, fixture } from './support/engine';

const mockStore = vi.hoisted(() => ({
  events: [] as unknown[],
  conflictingEvents: [] as unknown[],
}));

vi.mock('@workspace/db/game-store', () => ({
  appendGameEvents: async (input: {
    expectedVersion: number;
    events: unknown[];
  }) => {
    if (mockStore.conflictingEvents.length > 0) {
      mockStore.events.push(mockStore.conflictingEvents.shift());
      return {
        ok: false as const,
        code: 'VERSION_CONFLICT' as const,
        currentVersion: mockStore.events.length,
      };
    }
    if (input.expectedVersion !== mockStore.events.length) {
      return {
        ok: false as const,
        code: 'VERSION_CONFLICT' as const,
        currentVersion: mockStore.events.length,
      };
    }
    mockStore.events.push(...input.events);
    return {
      ok: true as const,
      version: mockStore.events.length,
      duplicate: false,
    };
  },
  readGameCommandResult: async () => null,
  readGameEvents: async () => mockStore.events,
  readGameEventsAfter: async () => [],
  readGameUndoWindow: async () => null,
  readGameEndDate: async () => '2026-12-31',
  readGameTombstone: async () => null,
  readLatestGameSnapshot: async () => null,
}));

vi.mock('@workspace/db/seat-presence-store', () => ({
  listConnectedSeatIds: async () => [],
}));

import type { Event } from '../lib/shared/src';

function stateAt(phase: 'VOTE' | 'SHADOW', count = 6) {
  const game = fixture(count);
  command(game, { type: 'StartGame' });
  advance(game, phase);
  return game;
}

function competingEvent(
  game: ReturnType<typeof stateAt>,
  type: 'SubmitVote' | 'SubmitShadowChoice',
): { event: Event; seatId: string } {
  const competingSeat = game.state.seats.find(
    (seat) => seat.status === 'alive' && seat.id !== 's0',
  );
  if (!competingSeat) throw new Error('A second living seat is required.');
  const target = game.state.seats.find(
    (seat) =>
      seat.status === 'alive' &&
      seat.id !== competingSeat.id &&
      (type !== 'SubmitShadowChoice' ||
        (competingSeat.role !== 'traitor' && seat.id !== competingSeat.id) ||
        (competingSeat.role === 'traitor' && seat.role !== 'traitor')),
  );
  if (!target) throw new Error('An eligible target is required.');
  const payload =
    type === 'SubmitVote'
      ? { type, target: target.id }
      : { type, choice: target.id };
  const result = command(
    { ...game, events: [...game.events] },
    payload,
    false,
    { kind: 'player', seatId: competingSeat.id },
  );
  if (!result.ok || !result.events[0])
    throw new Error(`Could not create a competing ${type} event.`);
  return { event: result.events[0] as Event, seatId: competingSeat.id };
}

afterEach(() => {
  mockStore.events = [];
  mockStore.conflictingEvents = [];
});

describe('concurrent player commands', () => {
  it.each([
    ['SubmitVote', 'VOTE'],
    ['SubmitShadowChoice', 'SHADOW'],
  ] as const)(
    're-evaluates a valid %s after another seat commits first',
    async (type, phase) => {
      const game = stateAt(phase);
      const actor = game.state.seats.find((seat) => seat.id === 's0');
      if (!actor) throw new Error('The acting seat is missing.');
      const target = game.state.seats.find(
        (seat) =>
          seat.status === 'alive' &&
          seat.id !== actor.id &&
          (type !== 'SubmitShadowChoice' ||
            actor.role !== 'traitor' ||
            seat.role !== 'traitor'),
      );
      if (!target) throw new Error('An eligible target is required.');

      mockStore.events = [...game.events];
      const competing = competingEvent(game, type);
      mockStore.conflictingEvents = [competing.event];

      const app = createApp(async () => {}, {
        resolveViewer: (incoming) => ({
          kind: 'player',
          seatId: incoming.get('x-test-seat') ?? 's0',
        }),
        testOnlyNow: () => game.state.phaseStarted + 1,
        consumeRateLimit: async () => true,
      });
      const response = await request(app)
        .post(`/api/games/${game.state.id}/commands`)
        .set('X-Test-Seat', actor.id)
        .send({
          type,
          ...(type === 'SubmitVote'
            ? { target: target.id }
            : { choice: target.id }),
          expectedVersion: game.state.version,
          idempotencyKey: `concurrent-${type}-${actor.id}`,
        });

      expect(response.status).toBe(200);
      const current = replay(mockStore.events as Event[]);
      expect(current.version).toBe(game.state.version + 2);
      if (type === 'SubmitVote') {
        expect(current.votes).toHaveProperty(actor.id);
        expect(current.votes).toHaveProperty(competing.seatId);
      } else {
        expect(current.shadow).toHaveProperty(actor.id);
        expect(current.shadow).toHaveProperty(competing.seatId);
      }
    },
  );

  it('retries private acknowledgement through sustained concurrent writes', async () => {
    const game = stateAt('SHADOW', 12);
    const actor = game.state.seats.find((seat) => seat.id === 's0');
    if (!actor) throw new Error('The acting seat is missing.');
    const competingGame = {
      state: game.state,
      events: [...game.events],
      context: game.context,
    };
    const competingEvents: Event[] = [];
    for (const seat of game.state.seats
      .filter(
        (candidate) =>
          candidate.status === 'alive' && candidate.id !== actor.id,
      )
      .slice(0, 8)) {
      const eventCount = competingGame.events.length;
      command(competingGame, { type: 'AcknowledgePrivate' }, true, {
        kind: 'player',
        seatId: seat.id,
      });
      const event = competingGame.events[eventCount];
      if (!event) throw new Error('A competing acknowledgement is missing.');
      competingEvents.push(event);
    }

    mockStore.events = [...game.events];
    mockStore.conflictingEvents = competingEvents;
    const app = createApp(async () => {}, {
      resolveViewer: (incoming) => ({
        kind: 'player',
        seatId: incoming.get('x-test-seat') ?? 's0',
      }),
      testOnlyNow: () => game.state.phaseStarted + 1,
      consumeRateLimit: async () => true,
    });
    const response = await request(app)
      .post(`/api/games/${game.state.id}/commands`)
      .set('X-Test-Seat', actor.id)
      .send({
        type: 'AcknowledgePrivate',
        expectedVersion: game.state.version,
        idempotencyKey: `concurrent-ack-${actor.id}`,
      });

    expect(response.status).toBe(200);
    const current = replay(mockStore.events as Event[]);
    expect(current.version).toBe(game.state.version + 9);
  });
});
