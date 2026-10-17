import { describe, expect, it } from 'vitest';
import { replay, replayFrom, viewFor } from '../lib/engine/src';
import {
  commandSchema,
  eventSchema,
  gameConfigSchema,
} from '../lib/shared/src';

function fixture() {
  return replay([
    eventSchema.parse({
      type: 'GameCreated',
      id: 'readiness',
      config: gameConfigSchema.parse({}),
      seq: 1,
      at: 0,
      schemaVersion: 1,
    }),
    eventSchema.parse({
      type: 'SeatJoined',
      seatId: 'alex',
      name: 'Alex',
      seq: 2,
      at: 1,
      schemaVersion: 1,
    }),
    eventSchema.parse({
      type: 'PhaseChanged',
      phase: 'DEAL',
      cycle: 0,
      deadline: null,
      seq: 3,
      at: 2,
      schemaVersion: 1,
    }),
  ]);
}

describe('truthful private-step readiness', () => {
  it('accepts an explicit completed acknowledgement', () => {
    expect(
      commandSchema.safeParse({
        type: 'AcknowledgePrivate',
        ready: true,
        idempotencyKey: 'done',
      }).success,
    ).toBe(true);
  });

  it('does not count shielding as seeing a role; completion counts once', () => {
    const shielded = replayFrom(fixture(), [
      eventSchema.parse({
        type: 'PrivateAcknowledged',
        seatId: 'alex',
        seq: 4,
        at: 3,
        schemaVersion: 1,
      }),
    ]);
    expect(
      viewFor({ kind: 'player', seatId: 'alex' }, shielded).progress.done,
    ).toBe(0);
    const ready = replayFrom(
      shielded,
      [5, 6].map((seq) =>
        eventSchema.parse({
          type: 'PrivateAcknowledged',
          seatId: 'alex',
          ready: true,
          seq,
          at: seq,
          schemaVersion: 1,
        }),
      ),
    );
    expect(
      viewFor({ kind: 'player', seatId: 'alex' }, ready).progress.done,
    ).toBe(1);
  });

  it('counts endgame decisions, not shield acknowledgements', () => {
    const state = {
      ...fixture(),
      phase: 'FINAL_VOTE' as const,
      acks: ['alex'],
      endVotes: {},
    };
    expect(
      viewFor({ kind: 'player', seatId: 'alex' }, state).progress.done,
    ).toBe(0);
    state.endVotes = { alex: 'end' };
    expect(
      viewFor({ kind: 'player', seatId: 'alex' }, state).progress.done,
    ).toBe(1);
  });
});
