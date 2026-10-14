import { and, eq, isNull } from 'drizzle-orm';
import { db } from './index';
import {
  gamePresenterPairings,
  gamePresenterSessions,
  insertGamePresenterPairingSchema,
  insertGamePresenterSessionSchema,
} from './schema';

export async function createPresenterPairing(input: {
  codeHash: string;
  gameId: string;
  expiresAt: number;
}): Promise<void> {
  const parsed = insertGamePresenterPairingSchema.parse({
    ...input,
    expiresAt: new Date(input.expiresAt),
  });
  await db.insert(gamePresenterPairings).values(parsed);
}

export async function claimPresenterPairing(input: {
  codeHash: string;
  gameId: string;
  tokenHash: string;
  sessionExpiresAt: number;
  now: number;
}): Promise<boolean> {
  const session = insertGamePresenterSessionSchema.parse({
    tokenHash: input.tokenHash,
    gameId: input.gameId,
    expiresAt: new Date(input.sessionExpiresAt),
  });
  return db.transaction(async (transaction) => {
    const [pairing] = await transaction
      .select()
      .from(gamePresenterPairings)
      .where(
        and(
          eq(gamePresenterPairings.codeHash, input.codeHash),
          eq(gamePresenterPairings.gameId, input.gameId),
        ),
      )
      .for('update')
      .limit(1);
    if (
      !pairing ||
      pairing.claimedAt !== null ||
      pairing.expiresAt.getTime() <= input.now
    )
      return false;

    await transaction
      .update(gamePresenterPairings)
      .set({ claimedAt: new Date(input.now) })
      .where(
        and(
          eq(gamePresenterPairings.codeHash, input.codeHash),
          isNull(gamePresenterPairings.claimedAt),
        ),
      );
    await transaction.insert(gamePresenterSessions).values(session);
    return true;
  });
}

export async function findPresenterSession(
  tokenHash: string,
  gameId: string,
): Promise<{
  gameId: string;
  expiresAt: number;
  revokedAt: number | null;
} | null> {
  const [row] = await db
    .select()
    .from(gamePresenterSessions)
    .where(
      and(
        eq(gamePresenterSessions.tokenHash, tokenHash),
        eq(gamePresenterSessions.gameId, gameId),
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
