import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db, games } from '@workspace/db';
import { eq } from 'drizzle-orm';
import {
  areGameSeatsDisconnected,
  disconnectGameSeatConnection,
  listConnectedSeatIds,
  seatDisconnectGraceMs,
  touchGameSeatConnection,
  upsertGameSeatConnection,
} from '@workspace/db/seat-presence-store';

const gameIds: string[] = [];

afterEach(async () => {
  for (const gameId of gameIds.splice(0))
    await db.delete(games).where(eq(games.id, gameId));
});

async function createGame() {
  const id = randomUUID();
  gameIds.push(id);
  await db.insert(games).values({
    id,
    config: {},
    version: 0,
    status: 'active',
    gameEndDate: '2099-12-31',
  });
  return id;
}

describe('seat connection presence', () => {
  it('uses the newest tab heartbeat and a full disconnect grace period', async () => {
    const gameId = await createGame();
    await upsertGameSeatConnection({
      connectionId: `initial:${gameId}:seat-1`,
      gameId,
      seatId: 'seat-1',
      seenAt: 1_000,
    });
    expect(
      await areGameSeatsDisconnected({
        gameId,
        seatIds: ['seat-1'],
        now: 1_000 + seatDisconnectGraceMs - 1,
      }),
    ).toEqual([]);

    await upsertGameSeatConnection({
      connectionId: `socket:${gameId}:tab-a`,
      gameId,
      seatId: 'seat-1',
      seenAt: 20_000,
    });
    await upsertGameSeatConnection({
      connectionId: `socket:${gameId}:tab-b`,
      gameId,
      seatId: 'seat-1',
      seenAt: 21_000,
    });
    expect(await listConnectedSeatIds({ gameId, now: 30_000 })).toEqual([
      'seat-1',
    ]);
    await disconnectGameSeatConnection(`socket:${gameId}:tab-b`, 30_000);
    expect(
      await areGameSeatsDisconnected({
        gameId,
        seatIds: ['seat-1'],
        now: 30_000,
      }),
    ).toEqual([]);
    expect(
      await areGameSeatsDisconnected({
        gameId,
        seatIds: ['seat-1'],
        now: 30_000 + seatDisconnectGraceMs - 1,
      }),
    ).toEqual([]);
    expect(
      await areGameSeatsDisconnected({
        gameId,
        seatIds: ['seat-1'],
        now: 30_000 + seatDisconnectGraceMs,
      }),
    ).toEqual(['seat-1']);
  });

  it('starts grace at disconnect, not at an expired initial connection', async () => {
    const gameId = await createGame();
    const connectionId = `socket:${gameId}:tab`;
    await upsertGameSeatConnection({
      connectionId: `initial:${gameId}:seat-1`,
      gameId,
      seatId: 'seat-1',
      seenAt: 1_000,
    });
    await upsertGameSeatConnection({
      connectionId,
      gameId,
      seatId: 'seat-1',
      seenAt: 120_000,
    });
    await disconnectGameSeatConnection(connectionId, 130_000);
    expect(await listConnectedSeatIds({ gameId, now: 130_000 })).toEqual([]);
    // An in-flight older pong must not move the disconnect timestamp backwards.
    await touchGameSeatConnection(connectionId, 125_000);
    for (const now of [130_000, 130_000 + seatDisconnectGraceMs - 1]) {
      expect(
        await areGameSeatsDisconnected({ gameId, seatIds: ['seat-1'], now }),
      ).toEqual([]);
    }
    expect(
      await areGameSeatsDisconnected({
        gameId,
        seatIds: ['seat-1'],
        now: 130_000 + seatDisconnectGraceMs,
      }),
    ).toEqual(['seat-1']);
  });

  it('retains disconnect evidence without an initial row and respects another live tab', async () => {
    const gameId = await createGame();
    const connectionId = `socket:${gameId}:tab-a`;
    await upsertGameSeatConnection({
      connectionId,
      gameId,
      seatId: 'seat-1',
      seenAt: 1_000,
    });
    await disconnectGameSeatConnection(connectionId, 100_000);
    expect(await listConnectedSeatIds({ gameId, now: 100_000 })).toEqual([]);
    expect(
      await areGameSeatsDisconnected({
        gameId,
        seatIds: ['seat-1'],
        now: 100_000 + seatDisconnectGraceMs,
      }),
    ).toEqual(['seat-1']);
    await upsertGameSeatConnection({
      connectionId: `socket:${gameId}:tab-b`,
      gameId,
      seatId: 'seat-1',
      seenAt: 100_000 + seatDisconnectGraceMs,
    });
    expect(
      await areGameSeatsDisconnected({
        gameId,
        seatIds: ['seat-1'],
        now: 100_000 + seatDisconnectGraceMs + 1,
      }),
    ).toEqual([]);
    expect(
      await listConnectedSeatIds({
        gameId,
        now: 100_000 + seatDisconnectGraceMs + 1,
      }),
    ).toEqual(['seat-1']);
  });

  it('does not infer a disconnected seat from another game connection', async () => {
    const gameA = await createGame();
    const gameB = await createGame();
    await upsertGameSeatConnection({
      connectionId: `socket:${gameA}:tab`,
      gameId: gameA,
      seatId: 'shared-seat-id',
      seenAt: 1_000,
    });

    expect(
      await areGameSeatsDisconnected({
        gameId: gameB,
        seatIds: ['shared-seat-id'],
        now: 100_000,
      }),
    ).toEqual([]);
  });
});
