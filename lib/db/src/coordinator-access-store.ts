import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { db } from './index';
import {
  gameCoordinatorCapabilities,
  gameCoordinatorDelegates,
  gameCoordinatorHandoffs,
  gameCoordinatorTakeoverVotes,
  gameCoordinatorTakeovers,
  insertGameCoordinatorHandoffSchema,
} from './schema/coordinator-access';

export type CoordinatorSessionRecord = {
  gameId: string;
  expiresAt: number;
  revokedAt: number | null;
};

export type CoordinatorTakeoverRecord = {
  id: string;
  requesterSeatId: string;
  status: string;
  expiresAt: number;
  votes: Array<{ seatId: string; approved: boolean }>;
};

export async function touchCoordinatorPresence(input: {
  gameId: string;
  tokenHash: string;
  now: number;
  inactiveRequestCutoff: number;
}): Promise<boolean> {
  return db.transaction(async (transaction) => {
    const [updated] = await transaction
      .update(gameCoordinatorCapabilities)
      .set({ lastSeenAt: new Date(input.now) })
      .where(
        and(
          eq(gameCoordinatorCapabilities.gameId, input.gameId),
          eq(gameCoordinatorCapabilities.tokenHash, input.tokenHash),
          isNull(gameCoordinatorCapabilities.revokedAt),
          gt(gameCoordinatorCapabilities.expiresAt, new Date(input.now)),
        ),
      )
      .returning({ gameId: gameCoordinatorCapabilities.gameId });
    if (!updated) return false;
    await transaction
      .update(gameCoordinatorTakeovers)
      .set({ status: 'cancelled', resolvedAt: new Date(input.now) })
      .where(
        and(
          eq(gameCoordinatorTakeovers.gameId, input.gameId),
          inArray(gameCoordinatorTakeovers.status, ['pending', 'approved']),
          gt(gameCoordinatorTakeovers.expiresAt, new Date(input.now)),
        ),
      );
    return true;
  });
}

export async function listCoordinatorDelegates(
  gameId: string,
): Promise<string[]> {
  const rows = await db
    .select({ seatId: gameCoordinatorDelegates.seatId })
    .from(gameCoordinatorDelegates)
    .where(eq(gameCoordinatorDelegates.gameId, gameId));
  return rows.map((row) => row.seatId);
}

export async function replaceCoordinatorDelegates(input: {
  gameId: string;
  tokenHash: string;
  seatIds: string[];
  now: number;
}): Promise<boolean> {
  const uniqueSeatIds = [...new Set(input.seatIds)];
  if (uniqueSeatIds.length !== input.seatIds.length) return false;
  return db.transaction(async (transaction) => {
    const [capability] = await transaction
      .select({ gameId: gameCoordinatorCapabilities.gameId })
      .from(gameCoordinatorCapabilities)
      .where(
        and(
          eq(gameCoordinatorCapabilities.gameId, input.gameId),
          eq(gameCoordinatorCapabilities.tokenHash, input.tokenHash),
          isNull(gameCoordinatorCapabilities.revokedAt),
          gt(gameCoordinatorCapabilities.expiresAt, new Date(input.now)),
        ),
      )
      .for('update')
      .limit(1);
    if (!capability) return false;
    await transaction
      .delete(gameCoordinatorDelegates)
      .where(eq(gameCoordinatorDelegates.gameId, input.gameId));
    if (uniqueSeatIds.length > 0) {
      await transaction.insert(gameCoordinatorDelegates).values(
        uniqueSeatIds.map((seatId) => ({
          gameId: input.gameId,
          seatId,
        })),
      );
    }
    await transaction
      .update(gameCoordinatorTakeovers)
      .set({ status: 'cancelled', resolvedAt: new Date(input.now) })
      .where(
        and(
          eq(gameCoordinatorTakeovers.gameId, input.gameId),
          inArray(gameCoordinatorTakeovers.status, ['pending', 'approved']),
        ),
      );
    return true;
  });
}

export async function getCoordinatorTakeoverRecord(
  gameId: string,
  now: number,
): Promise<{
  lastSeenAt: number | null;
  delegateSeatIds: string[];
  request: CoordinatorTakeoverRecord | null;
} | null> {
  const [capability] = await db
    .select({
      lastSeenAt: gameCoordinatorCapabilities.lastSeenAt,
    })
    .from(gameCoordinatorCapabilities)
    .where(
      and(
        eq(gameCoordinatorCapabilities.gameId, gameId),
        isNull(gameCoordinatorCapabilities.revokedAt),
        gt(gameCoordinatorCapabilities.expiresAt, new Date(now)),
      ),
    )
    .limit(1);
  if (!capability) return null;
  const delegateSeatIds = await listCoordinatorDelegates(gameId);
  const [request] = await db
    .select()
    .from(gameCoordinatorTakeovers)
    .where(
      and(
        eq(gameCoordinatorTakeovers.gameId, gameId),
        inArray(gameCoordinatorTakeovers.status, ['pending', 'approved']),
        gt(gameCoordinatorTakeovers.expiresAt, new Date(now)),
      ),
    )
    .orderBy(desc(gameCoordinatorTakeovers.createdAt))
    .limit(1);
  if (!request)
    return {
      lastSeenAt: capability.lastSeenAt.getTime(),
      delegateSeatIds,
      request: null,
    };
  const votes = await db
    .select({
      seatId: gameCoordinatorTakeoverVotes.seatId,
      approved: gameCoordinatorTakeoverVotes.approved,
    })
    .from(gameCoordinatorTakeoverVotes)
    .where(eq(gameCoordinatorTakeoverVotes.requestId, request.id));
  return {
    lastSeenAt: capability.lastSeenAt.getTime(),
    delegateSeatIds,
    request: {
      id: request.id,
      requesterSeatId: request.requesterSeatId,
      status: request.status,
      expiresAt: request.expiresAt.getTime(),
      votes,
    },
  };
}

export async function createCoordinatorTakeoverRequest(input: {
  id: string;
  gameId: string;
  requesterSeatId: string;
  expiresAt: number;
  now: number;
  inactiveRequestCutoff: number;
  actionNeeded: boolean;
}): Promise<boolean> {
  if (!input.actionNeeded) return false;
  return db.transaction(async (transaction) => {
    const [capability] = await transaction
      .select({ lastSeenAt: gameCoordinatorCapabilities.lastSeenAt })
      .from(gameCoordinatorCapabilities)
      .where(
        and(
          eq(gameCoordinatorCapabilities.gameId, input.gameId),
          isNull(gameCoordinatorCapabilities.revokedAt),
          gt(gameCoordinatorCapabilities.expiresAt, new Date(input.now)),
        ),
      )
      .for('update')
      .limit(1);
    if (
      !capability ||
      capability.lastSeenAt.getTime() > input.inactiveRequestCutoff
    )
      return false;
    const delegates = await transaction
      .select({ seatId: gameCoordinatorDelegates.seatId })
      .from(gameCoordinatorDelegates)
      .where(eq(gameCoordinatorDelegates.gameId, input.gameId));
    if (delegates.length > 0) return false;
    const [existing] = await transaction
      .select({ id: gameCoordinatorTakeovers.id })
      .from(gameCoordinatorTakeovers)
      .where(
        and(
          eq(gameCoordinatorTakeovers.gameId, input.gameId),
          inArray(gameCoordinatorTakeovers.status, ['pending', 'approved']),
          gt(gameCoordinatorTakeovers.expiresAt, new Date(input.now)),
        ),
      )
      .limit(1);
    if (existing) return false;
    await transaction.insert(gameCoordinatorTakeovers).values({
      id: input.id,
      gameId: input.gameId,
      requesterSeatId: input.requesterSeatId,
      status: 'pending',
      expiresAt: new Date(input.expiresAt),
    });
    await transaction.insert(gameCoordinatorTakeoverVotes).values({
      requestId: input.id,
      seatId: input.requesterSeatId,
      approved: true,
    });
    return true;
  });
}

export async function voteCoordinatorTakeover(input: {
  requestId: string;
  gameId: string;
  seatId: string;
  approved: boolean;
  livingSeatIds: string[];
  now: number;
  inactiveRequestCutoff: number;
}): Promise<'pending' | 'approved' | 'declined' | null> {
  const living = new Set(input.livingSeatIds);
  if (!living.has(input.seatId) || living.size === 0) return null;
  return db.transaction(async (transaction) => {
    const [capability] = await transaction
      .select({ lastSeenAt: gameCoordinatorCapabilities.lastSeenAt })
      .from(gameCoordinatorCapabilities)
      .where(
        and(
          eq(gameCoordinatorCapabilities.gameId, input.gameId),
          isNull(gameCoordinatorCapabilities.revokedAt),
          gt(gameCoordinatorCapabilities.expiresAt, new Date(input.now)),
        ),
      )
      .for('update')
      .limit(1);
    if (
      !capability ||
      capability.lastSeenAt.getTime() > input.inactiveRequestCutoff
    )
      return null;
    const delegates = await transaction
      .select({ seatId: gameCoordinatorDelegates.seatId })
      .from(gameCoordinatorDelegates)
      .where(eq(gameCoordinatorDelegates.gameId, input.gameId));
    if (delegates.length > 0) return null;
    const [request] = await transaction
      .select()
      .from(gameCoordinatorTakeovers)
      .where(
        and(
          eq(gameCoordinatorTakeovers.id, input.requestId),
          eq(gameCoordinatorTakeovers.gameId, input.gameId),
          eq(gameCoordinatorTakeovers.status, 'pending'),
          gt(gameCoordinatorTakeovers.expiresAt, new Date(input.now)),
        ),
      )
      .for('update')
      .limit(1);
    if (!request) return null;
    await transaction
      .insert(gameCoordinatorTakeoverVotes)
      .values({
        requestId: input.requestId,
        seatId: input.seatId,
        approved: input.approved,
        updatedAt: new Date(input.now),
      })
      .onConflictDoUpdate({
        target: [
          gameCoordinatorTakeoverVotes.requestId,
          gameCoordinatorTakeoverVotes.seatId,
        ],
        set: { approved: input.approved, updatedAt: new Date(input.now) },
      });
    const votes = await transaction
      .select()
      .from(gameCoordinatorTakeoverVotes)
      .where(eq(gameCoordinatorTakeoverVotes.requestId, input.requestId));
    const required = Math.floor(living.size / 2) + 1;
    const livingVotes = votes.filter((vote) => living.has(vote.seatId));
    const approvals = new Set(
      livingVotes.filter((vote) => vote.approved).map((vote) => vote.seatId),
    ).size;
    const declines = new Set(
      livingVotes.filter((vote) => !vote.approved).map((vote) => vote.seatId),
    ).size;
    const status =
      approvals >= required
        ? 'approved'
        : declines >= required
          ? 'declined'
          : 'pending';
    if (status !== 'pending')
      await transaction
        .update(gameCoordinatorTakeovers)
        .set({ status, resolvedAt: new Date(input.now) })
        .where(eq(gameCoordinatorTakeovers.id, input.requestId));
    return status;
  });
}

export async function claimCoordinatorTakeover(input: {
  gameId: string;
  requestId: string;
  requesterSeatId: string;
  tokenHash: string;
  sessionExpiresAt: number;
  inactiveRequestCutoff: number;
  livingSeatIds: string[];
  now: number;
  actionNeeded: boolean;
}): Promise<boolean> {
  if (!input.actionNeeded) return false;
  const living = new Set(input.livingSeatIds);
  if (!living.has(input.requesterSeatId)) return false;
  return db.transaction(async (transaction) => {
    const [capability] = await transaction
      .select({ lastSeenAt: gameCoordinatorCapabilities.lastSeenAt })
      .from(gameCoordinatorCapabilities)
      .where(
        and(
          eq(gameCoordinatorCapabilities.gameId, input.gameId),
          isNull(gameCoordinatorCapabilities.revokedAt),
          gt(gameCoordinatorCapabilities.expiresAt, new Date(input.now)),
        ),
      )
      .for('update')
      .limit(1);
    if (
      !capability ||
      capability.lastSeenAt.getTime() > input.inactiveRequestCutoff
    )
      return false;
    const [request] = await transaction
      .select()
      .from(gameCoordinatorTakeovers)
      .where(
        and(
          eq(gameCoordinatorTakeovers.id, input.requestId),
          eq(gameCoordinatorTakeovers.gameId, input.gameId),
          eq(gameCoordinatorTakeovers.requesterSeatId, input.requesterSeatId),
          eq(gameCoordinatorTakeovers.status, 'approved'),
          gt(gameCoordinatorTakeovers.expiresAt, new Date(input.now)),
        ),
      )
      .for('update')
      .limit(1);
    if (!request) return false;
    const votes = await transaction
      .select()
      .from(gameCoordinatorTakeoverVotes)
      .where(eq(gameCoordinatorTakeoverVotes.requestId, request.id));
    const approvals = new Set(
      votes
        .filter((vote) => living.has(vote.seatId) && vote.approved)
        .map((vote) => vote.seatId),
    ).size;
    if (approvals < Math.floor(living.size / 2) + 1) {
      await transaction
        .update(gameCoordinatorTakeovers)
        .set({ status: 'pending', resolvedAt: null })
        .where(eq(gameCoordinatorTakeovers.id, request.id));
      return false;
    }
    const rotated = await transaction
      .update(gameCoordinatorCapabilities)
      .set({
        tokenHash: input.tokenHash,
        holderSeatId: input.requesterSeatId,
        lastSeenAt: new Date(input.now),
        expiresAt: new Date(input.sessionExpiresAt),
      })
      .where(
        and(
          eq(gameCoordinatorCapabilities.gameId, input.gameId),
          isNull(gameCoordinatorCapabilities.revokedAt),
          gt(gameCoordinatorCapabilities.expiresAt, new Date(input.now)),
        ),
      )
      .returning({ gameId: gameCoordinatorCapabilities.gameId });
    if (rotated.length !== 1) return false;
    await transaction
      .delete(gameCoordinatorDelegates)
      .where(eq(gameCoordinatorDelegates.gameId, input.gameId));
    await transaction
      .update(gameCoordinatorTakeovers)
      .set({ status: 'claimed', resolvedAt: new Date(input.now) })
      .where(eq(gameCoordinatorTakeovers.id, request.id));
    return true;
  });
}

export async function claimCoordinatorAsDelegate(input: {
  gameId: string;
  seatId: string;
  tokenHash: string;
  sessionExpiresAt: number;
  inactiveRequestCutoff: number;
  now: number;
  actionNeeded: boolean;
}): Promise<boolean> {
  if (!input.actionNeeded) return false;
  return db.transaction(async (transaction) => {
    const [capability] = await transaction
      .select({ lastSeenAt: gameCoordinatorCapabilities.lastSeenAt })
      .from(gameCoordinatorCapabilities)
      .where(
        and(
          eq(gameCoordinatorCapabilities.gameId, input.gameId),
          isNull(gameCoordinatorCapabilities.revokedAt),
          gt(gameCoordinatorCapabilities.expiresAt, new Date(input.now)),
        ),
      )
      .for('update')
      .limit(1);
    if (
      !capability ||
      capability.lastSeenAt.getTime() > input.inactiveRequestCutoff
    )
      return false;
    const [delegate] = await transaction
      .select({ seatId: gameCoordinatorDelegates.seatId })
      .from(gameCoordinatorDelegates)
      .where(
        and(
          eq(gameCoordinatorDelegates.gameId, input.gameId),
          eq(gameCoordinatorDelegates.seatId, input.seatId),
        ),
      )
      .limit(1);
    if (!delegate) return false;
    const rotated = await transaction
      .update(gameCoordinatorCapabilities)
      .set({
        tokenHash: input.tokenHash,
        holderSeatId: input.seatId,
        lastSeenAt: new Date(input.now),
        expiresAt: new Date(input.sessionExpiresAt),
      })
      .where(
        and(
          eq(gameCoordinatorCapabilities.gameId, input.gameId),
          isNull(gameCoordinatorCapabilities.revokedAt),
          gt(gameCoordinatorCapabilities.expiresAt, new Date(input.now)),
        ),
      )
      .returning({ gameId: gameCoordinatorCapabilities.gameId });
    if (rotated.length !== 1) return false;
    await transaction
      .delete(gameCoordinatorDelegates)
      .where(eq(gameCoordinatorDelegates.gameId, input.gameId));
    return true;
  });
}

export async function findCoordinatorSession(
  tokenHash: string,
  gameId: string,
): Promise<CoordinatorSessionRecord | null> {
  const [row] = await db
    .select()
    .from(gameCoordinatorCapabilities)
    .where(
      and(
        eq(gameCoordinatorCapabilities.tokenHash, tokenHash),
        eq(gameCoordinatorCapabilities.gameId, gameId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    gameId: row.gameId,
    expiresAt: row.expiresAt.getTime(),
    revokedAt: row.revokedAt?.getTime() ?? null,
  };
}

export async function createCoordinatorHandoff(input: {
  id: string;
  gameId: string;
  targetSeatId: string;
  codeHash: string;
  expiresAt: Date;
}): Promise<void> {
  const handoff = insertGameCoordinatorHandoffSchema.parse(input);
  await db.transaction(async (transaction) => {
    await transaction
      .update(gameCoordinatorHandoffs)
      .set({ claimedAt: new Date() })
      .where(
        and(
          eq(gameCoordinatorHandoffs.gameId, handoff.gameId),
          isNull(gameCoordinatorHandoffs.claimedAt),
        ),
      );
    await transaction.insert(gameCoordinatorHandoffs).values(handoff);
  });
}

export async function claimCoordinatorHandoff(input: {
  gameId: string;
  targetSeatId: string;
  codeHash: string;
  tokenHash: string;
  sessionExpiresAt: number;
  now: number;
}): Promise<boolean> {
  const now = new Date(input.now);
  const [claimed] = await db.transaction(async (transaction) => {
    const [handoff] = await transaction
      .select()
      .from(gameCoordinatorHandoffs)
      .where(
        and(
          eq(gameCoordinatorHandoffs.gameId, input.gameId),
          eq(gameCoordinatorHandoffs.codeHash, input.codeHash),
          isNull(gameCoordinatorHandoffs.claimedAt),
          gt(gameCoordinatorHandoffs.expiresAt, now),
        ),
      )
      .for('update')
      .limit(1);
    if (!handoff || handoff.targetSeatId !== input.targetSeatId) return [false];
    const rotated = await transaction
      .update(gameCoordinatorCapabilities)
      .set({
        tokenHash: input.tokenHash,
        holderSeatId: input.targetSeatId,
        expiresAt: new Date(input.sessionExpiresAt),
      })
      .where(
        and(
          eq(gameCoordinatorCapabilities.gameId, input.gameId),
          isNull(gameCoordinatorCapabilities.revokedAt),
          gt(gameCoordinatorCapabilities.expiresAt, now),
        ),
      )
      .returning({ gameId: gameCoordinatorCapabilities.gameId });
    if (rotated.length !== 1) return [false];
    await transaction
      .update(gameCoordinatorHandoffs)
      .set({ claimedAt: now })
      .where(eq(gameCoordinatorHandoffs.id, handoff.id));
    return [true];
  });
  return claimed ?? false;
}
