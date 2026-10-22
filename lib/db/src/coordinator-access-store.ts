import { randomInt } from 'node:crypto';
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { eventSchema } from '@workspace/shared';
import { db } from './index';
import {
  gameDeadlines,
  gameEvents,
  gameUndoWindows,
  games,
} from './schema/game-runtime';
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
          inArray(gameCoordinatorTakeovers.status, [
            'pending',
            'approved',
            'automatic',
          ]),
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
    .select({
      seatId: gameCoordinatorDelegates.seatId,
      assignedAt: gameCoordinatorDelegates.assignedAt,
    })
    .from(gameCoordinatorDelegates)
    .where(eq(gameCoordinatorDelegates.gameId, gameId));
  rows.sort(
    (left, right) =>
      left.assignedAt.getTime() - right.assignedAt.getTime() ||
      left.seatId.localeCompare(right.seatId),
  );
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
          inArray(gameCoordinatorTakeovers.status, [
            'pending',
            'approved',
            'automatic',
          ]),
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
  holderSeatId: string | null;
  delegateSeatIds: string[];
  request: CoordinatorTakeoverRecord | null;
} | null> {
  const [capability] = await db
    .select({
      lastSeenAt: gameCoordinatorCapabilities.lastSeenAt,
      holderSeatId: gameCoordinatorCapabilities.holderSeatId,
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
        inArray(gameCoordinatorTakeovers.status, [
          'pending',
          'approved',
          'automatic',
        ]),
        gt(gameCoordinatorTakeovers.expiresAt, new Date(now)),
      ),
    )
    .orderBy(
      sql`case when ${gameCoordinatorTakeovers.status} = 'automatic' then 1 else 0 end`,
      desc(gameCoordinatorTakeovers.createdAt),
    )
    .limit(1);
  if (!request)
    return {
      lastSeenAt: capability.lastSeenAt.getTime(),
      holderSeatId: capability.holderSeatId,
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
    holderSeatId: capability.holderSeatId,
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

export async function reserveAutomaticCoordinatorHandover(input: {
  id: string;
  gameId: string;
  delegateSeatIds: string[];
  livingSeatIds: string[];
  connectedSeatIds: string[];
  now: number;
  inactiveRequestCutoff: number;
  expiresAt: number;
  actionNeeded: boolean;
}): Promise<{ id: string; targetSeatId: string } | null> {
  if (!input.actionNeeded) return null;
  const now = new Date(input.now);
  return db.transaction(async (transaction) => {
    const [capability] = await transaction
      .select({
        lastSeenAt: gameCoordinatorCapabilities.lastSeenAt,
        holderSeatId: gameCoordinatorCapabilities.holderSeatId,
      })
      .from(gameCoordinatorCapabilities)
      .where(
        and(
          eq(gameCoordinatorCapabilities.gameId, input.gameId),
          isNull(gameCoordinatorCapabilities.revokedAt),
          gt(gameCoordinatorCapabilities.expiresAt, now),
        ),
      )
      .for('update')
      .limit(1);
    if (
      !capability ||
      capability.lastSeenAt.getTime() > input.inactiveRequestCutoff
    )
      return null;

    // An explicit majority request owns this takeover until it resolves or
    // expires. Serialize this decision with request creation on the capability.
    const [manualRequest] = await transaction
      .select({ id: gameCoordinatorTakeovers.id })
      .from(gameCoordinatorTakeovers)
      .where(
        and(
          eq(gameCoordinatorTakeovers.gameId, input.gameId),
          inArray(gameCoordinatorTakeovers.status, ['pending', 'approved']),
          gt(gameCoordinatorTakeovers.expiresAt, now),
        ),
      )
      .limit(1);
    if (manualRequest) return null;

    const [existing] = await transaction
      .select({
        id: gameCoordinatorTakeovers.id,
        targetSeatId: gameCoordinatorTakeovers.requesterSeatId,
      })
      .from(gameCoordinatorTakeovers)
      .where(
        and(
          eq(gameCoordinatorTakeovers.gameId, input.gameId),
          eq(gameCoordinatorTakeovers.status, 'automatic'),
          gt(gameCoordinatorTakeovers.expiresAt, now),
        ),
      )
      .for('update')
      .limit(1);
    const connectedLivingSeats = [...new Set(input.connectedSeatIds)]
      .filter(
        (seatId) =>
          input.livingSeatIds.includes(seatId) &&
          seatId !== capability.holderSeatId,
      )
      .sort();
    if (existing && connectedLivingSeats.includes(existing.targetSeatId))
      return { id: existing.id, targetSeatId: existing.targetSeatId };

    const preferredDelegate = input.delegateSeatIds.find((seatId) =>
      connectedLivingSeats.includes(seatId),
    );
    const targetSeatId =
      preferredDelegate ??
      (connectedLivingSeats.length
        ? connectedLivingSeats[randomInt(connectedLivingSeats.length)]
        : undefined);
    await transaction
      .update(gameCoordinatorTakeovers)
      .set({ status: 'cancelled', resolvedAt: now })
      .where(
        and(
          eq(gameCoordinatorTakeovers.gameId, input.gameId),
          eq(gameCoordinatorTakeovers.status, 'automatic'),
        ),
      );
    if (!targetSeatId) return null;
    await transaction.insert(gameCoordinatorTakeovers).values({
      id: input.id,
      gameId: input.gameId,
      requesterSeatId: targetSeatId,
      status: 'automatic',
      expiresAt: new Date(input.expiresAt),
      createdAt: now,
    });
    return { id: input.id, targetSeatId };
  });
}

export async function claimAutomaticCoordinatorHandover(input: {
  requestId: string;
  gameId: string;
  seatId: string;
  tokenHash: string;
  sessionExpiresAt: number;
  now: number;
  inactiveRequestCutoff: number;
  livingSeatIds: string[];
  connectedSeatIds: string[];
  actionNeeded: boolean;
  expectedVersion: number;
}): Promise<boolean> {
  if (
    !input.actionNeeded ||
    !input.livingSeatIds.includes(input.seatId) ||
    !input.connectedSeatIds.includes(input.seatId)
  )
    return false;
  const now = new Date(input.now);
  return db.transaction(async (transaction) => {
    // Lock in the same order as game writes, then reservation/presence writes.
    const [game] = await transaction
      .select({ version: games.version })
      .from(games)
      .where(eq(games.id, input.gameId))
      .for('update')
      .limit(1);
    if (!game || game.version !== input.expectedVersion) return false;
    const [capability] = await transaction
      .select({
        lastSeenAt: gameCoordinatorCapabilities.lastSeenAt,
        holderSeatId: gameCoordinatorCapabilities.holderSeatId,
      })
      .from(gameCoordinatorCapabilities)
      .where(
        and(
          eq(gameCoordinatorCapabilities.gameId, input.gameId),
          isNull(gameCoordinatorCapabilities.revokedAt),
          gt(gameCoordinatorCapabilities.expiresAt, now),
        ),
      )
      .for('update')
      .limit(1);
    if (
      !capability ||
      capability.holderSeatId === input.seatId ||
      capability.lastSeenAt.getTime() > input.inactiveRequestCutoff
    )
      return false;
    const [manualRequest] = await transaction
      .select({ id: gameCoordinatorTakeovers.id })
      .from(gameCoordinatorTakeovers)
      .where(
        and(
          eq(gameCoordinatorTakeovers.gameId, input.gameId),
          inArray(gameCoordinatorTakeovers.status, ['pending', 'approved']),
          gt(gameCoordinatorTakeovers.expiresAt, now),
        ),
      )
      .limit(1);
    if (manualRequest) return false;
    const [request] = await transaction
      .select({ id: gameCoordinatorTakeovers.id })
      .from(gameCoordinatorTakeovers)
      .where(
        and(
          eq(gameCoordinatorTakeovers.id, input.requestId),
          eq(gameCoordinatorTakeovers.gameId, input.gameId),
          eq(gameCoordinatorTakeovers.requesterSeatId, input.seatId),
          eq(gameCoordinatorTakeovers.status, 'automatic'),
          gt(gameCoordinatorTakeovers.expiresAt, now),
        ),
      )
      .for('update')
      .limit(1);
    if (!request) return false;

    // The public event and capability rotation commit together. Any event write
    // failure rolls back the claim, leaving the old capability and reservation
    // intact for a retry. Never persist the capability in the public payload.
    const event = eventSchema.parse({
      schemaVersion: 1,
      seq: game.version + 1,
      at: input.now,
      type: 'CoordinatorRoleMoved',
    });
    await transaction.insert(gameEvents).values({
      gameId: input.gameId,
      seq: event.seq,
      type: event.type,
      payload: event,
      recordedAt: now,
    });
    await transaction
      .update(games)
      .set({ version: event.seq, updatedAt: now })
      .where(eq(games.id, input.gameId));
    await transaction
      .update(gameUndoWindows)
      .set({ invalidatedAt: now })
      .where(
        and(
          eq(gameUndoWindows.gameId, input.gameId),
          isNull(gameUndoWindows.invalidatedAt),
        ),
      );
    // Replace active timers like a normal game append. Updating only their
    // version would let an already-running stale worker complete the new timer.
    const deadlines = await transaction
      .update(gameDeadlines)
      .set({ completedAt: now, claimedUntil: null, claimToken: null })
      .where(
        and(
          eq(gameDeadlines.gameId, input.gameId),
          isNull(gameDeadlines.completedAt),
        ),
      )
      .returning({ kind: gameDeadlines.kind, dueAt: gameDeadlines.dueAt });
    if (deadlines.length > 0)
      await transaction.insert(gameDeadlines).values(
        deadlines.map((deadline) => ({
          gameId: input.gameId,
          kind: deadline.kind,
          dueAt: deadline.dueAt,
          version: event.seq,
        })),
      );
    const updated = await transaction
      .update(gameCoordinatorCapabilities)
      .set({
        tokenHash: input.tokenHash,
        holderSeatId: input.seatId,
        lastSeenAt: now,
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
    if (updated.length !== 1)
      throw new Error('Coordinator capability rotation failed');
    await transaction
      .update(gameCoordinatorTakeovers)
      .set({ status: 'completed', resolvedAt: now })
      .where(eq(gameCoordinatorTakeovers.id, input.requestId));
    await transaction
      .delete(gameCoordinatorDelegates)
      .where(eq(gameCoordinatorDelegates.gameId, input.gameId));
    return true;
  });
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
    // Explicit manual requests supersede an unclaimed automatic reservation.
    // The capability lock also prevents a concurrent automatic claim.
    await transaction
      .update(gameCoordinatorTakeovers)
      .set({ status: 'cancelled', resolvedAt: new Date(input.now) })
      .where(
        and(
          eq(gameCoordinatorTakeovers.gameId, input.gameId),
          eq(gameCoordinatorTakeovers.status, 'automatic'),
        ),
      );
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
