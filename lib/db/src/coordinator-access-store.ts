import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from './index';
import {
  gameCoordinatorCapabilities,
  gameCoordinatorHandoffs,
  insertGameCoordinatorHandoffSchema,
} from './schema/coordinator-access';

export type CoordinatorSessionRecord = {
  gameId: string;
  expiresAt: number;
  revokedAt: number | null;
};

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
