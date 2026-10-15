import { and, asc, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { db } from './index';
import {
  gameInvites,
  gameJoinRequests,
  gameSeatAccess,
  gameViewerSessions,
  insertGameInviteSchema,
  insertGameJoinRequestSchema,
  insertGameSeatAccessSchema,
  insertGameViewerSessionSchema,
} from './schema';

const pinLockoutMs = 15 * 60_000;

export type SeatPinAccess = {
  pinSalt: string;
  pinHash: string;
  failedPinAttempts: number;
  lockedUntil: number | null;
};

export async function createSeatAccess(input: {
  gameId: string;
  seatId: string;
  pinSalt: string;
  pinHash: string;
}): Promise<boolean> {
  const parsed = insertGameSeatAccessSchema.parse(input);
  const inserted = await db
    .insert(gameSeatAccess)
    .values(parsed)
    .onConflictDoNothing()
    .returning({ seatId: gameSeatAccess.seatId });
  return inserted.length === 1;
}

export async function deleteSeatAccess(
  gameId: string,
  seatId: string,
): Promise<void> {
  await db
    .delete(gameSeatAccess)
    .where(
      and(eq(gameSeatAccess.gameId, gameId), eq(gameSeatAccess.seatId, seatId)),
    );
}

export async function getSeatAccess(
  gameId: string,
  seatId: string,
): Promise<SeatPinAccess | null> {
  const [row] = await db
    .select()
    .from(gameSeatAccess)
    .where(
      and(eq(gameSeatAccess.gameId, gameId), eq(gameSeatAccess.seatId, seatId)),
    )
    .limit(1);
  if (!row) return null;
  return {
    pinSalt: row.pinSalt,
    pinHash: row.pinHash,
    failedPinAttempts: row.failedPinAttempts,
    lockedUntil: row.lockedUntil?.getTime() ?? null,
  };
}

export async function createViewerSession(input: {
  tokenHash: string;
  gameId: string;
  seatId: string;
  expiresAt: number;
}): Promise<void> {
  const parsed = insertGameViewerSessionSchema.parse({
    ...input,
    expiresAt: new Date(input.expiresAt),
  });
  await db.insert(gameViewerSessions).values(parsed);
}

export async function replaceSeatViewerSession(input: {
  tokenHash: string;
  gameId: string;
  seatId: string;
  expiresAt: number;
  revokedAt: number;
}): Promise<void> {
  const parsed = insertGameViewerSessionSchema.parse({
    tokenHash: input.tokenHash,
    gameId: input.gameId,
    seatId: input.seatId,
    expiresAt: new Date(input.expiresAt),
  });
  await db.transaction(async (transaction) => {
    await transaction
      .update(gameViewerSessions)
      .set({ revokedAt: new Date(input.revokedAt) })
      .where(
        and(
          eq(gameViewerSessions.gameId, input.gameId),
          eq(gameViewerSessions.seatId, input.seatId),
          isNull(gameViewerSessions.revokedAt),
        ),
      );
    await transaction.insert(gameViewerSessions).values(parsed);
  });
}

export async function findViewerSession(
  tokenHash: string,
  gameId: string,
): Promise<{
  gameId: string;
  seatId: string;
  expiresAt: number;
  revokedAt: number | null;
} | null> {
  const [row] = await db
    .select()
    .from(gameViewerSessions)
    .where(
      and(
        eq(gameViewerSessions.tokenHash, tokenHash),
        eq(gameViewerSessions.gameId, gameId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    gameId: row.gameId,
    seatId: row.seatId,
    expiresAt: row.expiresAt.getTime(),
    revokedAt: row.revokedAt?.getTime() ?? null,
  };
}

export async function recordSeatPinFailure(
  gameId: string,
  seatId: string,
  now: number,
): Promise<{ failedPinAttempts: number; lockedUntil: number | null } | null> {
  return db.transaction(async (transaction) => {
    const [row] = await transaction
      .select()
      .from(gameSeatAccess)
      .where(
        and(
          eq(gameSeatAccess.gameId, gameId),
          eq(gameSeatAccess.seatId, seatId),
        ),
      )
      .for('update')
      .limit(1);
    if (!row) return null;

    const existingLock = row.lockedUntil?.getTime() ?? null;
    if (existingLock !== null && existingLock > now) {
      return {
        failedPinAttempts: row.failedPinAttempts,
        lockedUntil: existingLock,
      };
    }
    const priorFailures =
      existingLock !== null && existingLock <= now ? 0 : row.failedPinAttempts;
    const failedPinAttempts = Math.min(5, priorFailures + 1);
    const lockedUntil = failedPinAttempts === 5 ? now + pinLockoutMs : null;
    await transaction
      .update(gameSeatAccess)
      .set({
        failedPinAttempts,
        lockedUntil: lockedUntil === null ? null : new Date(lockedUntil),
      })
      .where(
        and(
          eq(gameSeatAccess.gameId, gameId),
          eq(gameSeatAccess.seatId, seatId),
        ),
      );
    return { failedPinAttempts, lockedUntil };
  });
}

export async function clearSeatPinFailures(
  gameId: string,
  seatId: string,
): Promise<void> {
  await db
    .update(gameSeatAccess)
    .set({ failedPinAttempts: 0, lockedUntil: null })
    .where(
      and(eq(gameSeatAccess.gameId, gameId), eq(gameSeatAccess.seatId, seatId)),
    );
}

export async function revokeSeatViewerSessions(
  gameId: string,
  seatId: string,
  revokedAt: number,
): Promise<void> {
  await db
    .update(gameViewerSessions)
    .set({ revokedAt: new Date(revokedAt) })
    .where(
      and(
        eq(gameViewerSessions.gameId, gameId),
        eq(gameViewerSessions.seatId, seatId),
        isNull(gameViewerSessions.revokedAt),
      ),
    );
}

export async function expireViewerSessions(now: number): Promise<number> {
  const expired = await db
    .update(gameViewerSessions)
    .set({ revokedAt: new Date(now) })
    .where(
      and(
        lt(gameViewerSessions.expiresAt, new Date(now)),
        isNull(gameViewerSessions.revokedAt),
      ),
    )
    .returning({ tokenHash: gameViewerSessions.tokenHash });
  return expired.length;
}

export async function createGameInvite(input: {
  gameId: string;
  linkTokenHash: string;
  shortCodeHash: string;
  displayCode: string | null;
  expiresAt?: number | null;
}): Promise<void> {
  const parsed = insertGameInviteSchema.parse({
    ...input,
    expiresAt:
      input.expiresAt === undefined || input.expiresAt === null
        ? input.expiresAt
        : new Date(input.expiresAt),
  });
  await db
    .insert(gameInvites)
    .values({
      ...parsed,
      recoveryCodeHash:
        parsed.displayCode === null ? null : parsed.shortCodeHash,
    })
    .onConflictDoUpdate({
      target: gameInvites.gameId,
      set: {
        linkTokenHash: parsed.linkTokenHash,
        shortCodeHash: parsed.shortCodeHash,
        displayCode: parsed.displayCode,
        expiresAt: parsed.expiresAt ?? null,
        revokedAt: null,
        createdAt: new Date(),
        ...(parsed.displayCode === null
          ? {}
          : { recoveryCodeHash: parsed.shortCodeHash }),
      },
    });
}

/** Recovery still requires the name and PIN; closing or rotating a join link must not orphan a seat. */
export async function findGameForSeatRecovery(
  recoveryCodeHash: string,
): Promise<{ gameId: string } | null> {
  const [game] = await db
    .select({ gameId: gameInvites.gameId })
    .from(gameInvites)
    .where(eq(gameInvites.recoveryCodeHash, recoveryCodeHash))
    .limit(1);
  return game ?? null;
}

export async function findActiveGameInvite(
  lookup: { gameId: string; linkTokenHash: string } | { shortCodeHash: string },
  now: number,
): Promise<{ gameId: string } | null> {
  const identityCondition =
    'linkTokenHash' in lookup
      ? and(
          eq(gameInvites.gameId, lookup.gameId),
          eq(gameInvites.linkTokenHash, lookup.linkTokenHash),
        )
      : eq(gameInvites.shortCodeHash, lookup.shortCodeHash);
  const conditions = [
    identityCondition,
    isNull(gameInvites.revokedAt),
    or(isNull(gameInvites.expiresAt), gt(gameInvites.expiresAt, new Date(now))),
  ];
  const [invite] = await db
    .select({ gameId: gameInvites.gameId })
    .from(gameInvites)
    .where(and(...conditions))
    .limit(1);
  return invite ?? null;
}

export async function getOpenGameInviteCode(
  gameId: string,
  now: number,
): Promise<string | null> {
  const [invite] = await db
    .select({
      displayCode: gameInvites.displayCode,
      expiresAt: gameInvites.expiresAt,
      revokedAt: gameInvites.revokedAt,
    })
    .from(gameInvites)
    .where(eq(gameInvites.gameId, gameId))
    .limit(1);
  if (!invite || invite.revokedAt) return null;
  if (invite.expiresAt && invite.expiresAt.getTime() <= now) {
    await revokeGameInvite(gameId, now);
    return null;
  }
  return invite.displayCode;
}

export async function revokeGameInvite(
  gameId: string,
  revokedAt: number,
): Promise<void> {
  await db
    .update(gameInvites)
    .set({ revokedAt: new Date(revokedAt), displayCode: null })
    .where(and(eq(gameInvites.gameId, gameId), isNull(gameInvites.revokedAt)));
}

export async function createGameJoinRequest(input: {
  id: string;
  gameId: string;
  seatId: string;
  requestTokenHash: string;
  name: string;
  expiresAt: number;
}): Promise<boolean> {
  const parsed = insertGameJoinRequestSchema.parse({
    ...input,
    expiresAt: new Date(input.expiresAt),
  });
  const inserted = await db
    .insert(gameJoinRequests)
    .values(parsed)
    .onConflictDoNothing()
    .returning({ id: gameJoinRequests.id });
  return inserted.length === 1;
}

export async function findGameJoinRequestById(
  gameId: string,
  requestId: string,
): Promise<{
  id: string;
  gameId: string;
  seatId: string;
  name: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  expiresAt: number;
} | null> {
  const [request] = await db
    .select({
      id: gameJoinRequests.id,
      gameId: gameJoinRequests.gameId,
      seatId: gameJoinRequests.seatId,
      name: gameJoinRequests.name,
      status: gameJoinRequests.status,
      expiresAt: gameJoinRequests.expiresAt,
    })
    .from(gameJoinRequests)
    .where(
      and(
        eq(gameJoinRequests.gameId, gameId),
        eq(gameJoinRequests.id, requestId),
      ),
    )
    .limit(1);
  if (!request) return null;
  if (
    request.status !== 'pending' &&
    request.status !== 'approved' &&
    request.status !== 'rejected' &&
    request.status !== 'expired'
  )
    return null;
  return {
    id: request.id,
    gameId: request.gameId,
    seatId: request.seatId,
    name: request.name,
    status: request.status,
    expiresAt: request.expiresAt.getTime(),
  };
}

export async function findGameJoinRequestByToken(
  requestTokenHash: string,
  now: number,
): Promise<{
  id: string;
  gameId: string;
  seatId: string;
  name: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
} | null> {
  const [request] = await db
    .select({
      id: gameJoinRequests.id,
      gameId: gameJoinRequests.gameId,
      seatId: gameJoinRequests.seatId,
      name: gameJoinRequests.name,
      status: gameJoinRequests.status,
      expiresAt: gameJoinRequests.expiresAt,
    })
    .from(gameJoinRequests)
    .where(eq(gameJoinRequests.requestTokenHash, requestTokenHash))
    .limit(1);
  if (!request || request.expiresAt.getTime() <= now) return null;
  if (
    request.status !== 'pending' &&
    request.status !== 'approved' &&
    request.status !== 'rejected' &&
    request.status !== 'expired'
  )
    return null;
  return {
    id: request.id,
    gameId: request.gameId,
    seatId: request.seatId,
    name: request.name,
    status: request.status,
  };
}

export async function listPendingGameJoinRequests(
  gameId: string,
  now = Date.now(),
): Promise<
  Array<{ id: string; seatId: string; name: string; createdAt: number }>
> {
  const rows = await db
    .select({
      id: gameJoinRequests.id,
      seatId: gameJoinRequests.seatId,
      name: gameJoinRequests.name,
      createdAt: gameJoinRequests.createdAt,
    })
    .from(gameJoinRequests)
    .where(
      and(
        eq(gameJoinRequests.gameId, gameId),
        eq(gameJoinRequests.status, 'pending'),
        gt(gameJoinRequests.expiresAt, new Date(now)),
      ),
    )
    .orderBy(asc(gameJoinRequests.createdAt));
  return rows.map((row) => ({
    id: row.id,
    seatId: row.seatId,
    name: row.name,
    createdAt: row.createdAt.getTime(),
  }));
}

export async function resolveGameJoinRequest(
  gameId: string,
  requestId: string,
  status: 'approved' | 'rejected',
  resolvedAt: number,
): Promise<boolean> {
  const rows = await db
    .update(gameJoinRequests)
    .set({ status, resolvedAt: new Date(resolvedAt) })
    .where(
      and(
        eq(gameJoinRequests.id, requestId),
        eq(gameJoinRequests.gameId, gameId),
        eq(gameJoinRequests.status, 'pending'),
        gt(gameJoinRequests.expiresAt, new Date(resolvedAt)),
      ),
    )
    .returning({ id: gameJoinRequests.id });
  return rows.length === 1;
}
