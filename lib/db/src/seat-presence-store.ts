import { and, eq, gt, inArray, notLike, sql } from 'drizzle-orm';
import { db } from './index';
import { games, gameSeatConnections } from './schema';

export const seatDisconnectGraceMs = 60_000;

export async function upsertGameSeatConnection(input: {
  connectionId: string;
  gameId: string;
  seatId: string;
  seenAt: number;
}): Promise<void> {
  await db
    .insert(gameSeatConnections)
    .values({
      connectionId: input.connectionId,
      gameId: input.gameId,
      seatId: input.seatId,
      lastSeenAt: new Date(input.seenAt),
    })
    .onConflictDoUpdate({
      target: gameSeatConnections.connectionId,
      set: {
        gameId: input.gameId,
        seatId: input.seatId,
        lastSeenAt: new Date(input.seenAt),
      },
    });
}

export async function deleteGameSeatConnection(connectionId: string) {
  await db
    .delete(gameSeatConnections)
    .where(eq(gameSeatConnections.connectionId, connectionId));
}

export async function disconnectGameSeatConnection(
  connectionId: string,
  disconnectedAt: number,
) {
  // Retain evidence of when this connection ended. Deleting it would expose an
  // older initial/other-tab heartbeat and could bypass the disconnect grace.
  // Keep one marker per seat, not one row per historical socket/watch.
  await db.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({ gameId: gameSeatConnections.gameId })
      .from(gameSeatConnections)
      .where(eq(gameSeatConnections.connectionId, connectionId));
    if (!existing) return;
    // Match cascade deletion's parent-before-child lock order. Otherwise a
    // concurrent game deletion can hold the game while waiting for our deleted
    // connection, as our disconnect marker waits for its game foreign key.
    const [game] = await transaction
      .select({ id: games.id })
      .from(games)
      .where(eq(games.id, existing.gameId))
      .for('key share');
    if (!game) return;
    const [connection] = await transaction
      .delete(gameSeatConnections)
      .where(eq(gameSeatConnections.connectionId, connectionId))
      .returning();
    if (!connection) return;
    const lastSeenAt = new Date(
      Math.max(disconnectedAt, connection.lastSeenAt.getTime()),
    );
    await transaction
      .insert(gameSeatConnections)
      .values({
        connectionId: `disconnected:${JSON.stringify([connection.gameId, connection.seatId])}`,
        gameId: connection.gameId,
        seatId: connection.seatId,
        lastSeenAt,
      })
      .onConflictDoUpdate({
        target: gameSeatConnections.connectionId,
        set: {
          lastSeenAt: sql`greatest(${gameSeatConnections.lastSeenAt}, ${lastSeenAt})`,
        },
      });
  });
}

export async function touchGameSeatConnection(
  connectionId: string,
  seenAt: number,
) {
  await db
    .update(gameSeatConnections)
    .set({
      lastSeenAt: sql`greatest(${gameSeatConnections.lastSeenAt}, ${new Date(seenAt)})`,
    })
    .where(eq(gameSeatConnections.connectionId, connectionId));
}

export async function listConnectedSeatIds(input: {
  gameId: string;
  now: number;
  graceMs?: number;
  seatIds?: string[];
}): Promise<string[]> {
  const since = new Date(input.now - (input.graceMs ?? seatDisconnectGraceMs));
  const conditions = [
    eq(gameSeatConnections.gameId, input.gameId),
    notLike(gameSeatConnections.connectionId, 'disconnected:%'),
    gt(gameSeatConnections.lastSeenAt, since),
  ];
  if (input.seatIds)
    conditions.push(inArray(gameSeatConnections.seatId, input.seatIds));
  const rows = await db
    .selectDistinct({ seatId: gameSeatConnections.seatId })
    .from(gameSeatConnections)
    .where(and(...conditions));
  return rows.map((row) => row.seatId);
}

export async function areGameSeatsDisconnected(input: {
  gameId: string;
  seatIds: string[];
  now: number;
  graceMs?: number;
}): Promise<string[]> {
  if (input.seatIds.length === 0) return [];
  const rows = await db
    .select({
      seatId: gameSeatConnections.seatId,
      lastSeenAt: gameSeatConnections.lastSeenAt,
    })
    .from(gameSeatConnections)
    .where(
      and(
        eq(gameSeatConnections.gameId, input.gameId),
        inArray(gameSeatConnections.seatId, input.seatIds),
      ),
    );
  const latestSeenAt = new Map<string, number>();
  for (const row of rows) {
    const seenAt = row.lastSeenAt.getTime();
    latestSeenAt.set(
      row.seatId,
      Math.max(latestSeenAt.get(row.seatId) ?? 0, seenAt),
    );
  }
  const threshold = input.now - (input.graceMs ?? seatDisconnectGraceMs);
  return input.seatIds.filter((seatId) => {
    const lastSeenAt = latestSeenAt.get(seatId);
    return lastSeenAt !== undefined && lastSeenAt <= threshold;
  });
}
