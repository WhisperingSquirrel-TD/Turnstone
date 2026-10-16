import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { eventSchema, type Event } from '@workspace/shared';
import { db } from './index';
import {
  gameDeadlines,
  gameEvents,
  gameIdempotency,
  gameSnapshots,
  games,
} from './schema/game-runtime';
import {
  gameCoordinatorCapabilities,
  insertGameCoordinatorCapabilitySchema,
} from './schema/coordinator-access';
import {
  gameInvites,
  gameSeatAccess,
  gameViewerSessions,
  insertGameViewerSessionSchema,
} from './schema';

export type GameStoreResult =
  | { ok: true; version: number; duplicate: boolean }
  | {
      ok: false;
      code:
        | 'GAME_EXISTS'
        | 'GAME_NOT_FOUND'
        | 'IDEMPOTENCY_CONFLICT'
        | 'VERSION_CONFLICT'
        | 'SEAT_ACCESS_NOT_FOUND';
      currentVersion?: number;
    };

type IdempotencyInput = {
  gameId: string;
  actorId: string;
  idempotencyKey: string;
  requestHash: string;
};

type SnapshotInput = { seq: number; state: unknown };
type DeadlineInput = { kind: string; dueAt: number | null };

export type DeadlineClaim = {
  id: number;
  gameId: string;
  kind: string;
  version: number;
  dueAt: number;
  claimToken: string;
  attempts: number;
};

type CreateGameInput = Omit<IdempotencyInput, 'gameId'> & {
  event: Event;
  snapshot?: SnapshotInput;
  deadline?: DeadlineInput;
  coordinatorCapability?: {
    tokenHash: string;
    expiresAt: Date;
  };
};

type AppendEventsInput = IdempotencyInput & {
  expectedVersion: number;
  events: Event[];
  snapshot?: SnapshotInput;
  deadline?: DeadlineInput;
  seatPinUpdate?: {
    seatId: string;
    pinSalt: string;
    pinHash: string;
    pinPepperVersion: number;
  };
  seatSessionReplacement?: {
    seatId: string;
    tokenHash: string;
    expiresAt: number;
    revokedAt: number;
  };
};

async function findIdempotency(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: IdempotencyInput,
) {
  const [record] = await transaction
    .select()
    .from(gameIdempotency)
    .where(
      and(
        eq(gameIdempotency.gameId, input.gameId),
        eq(gameIdempotency.actorId, input.actorId),
        eq(gameIdempotency.key, input.idempotencyKey),
      ),
    )
    .limit(1);
  return record;
}

function duplicateResult(
  record: Awaited<ReturnType<typeof findIdempotency>>,
  input: IdempotencyInput,
): GameStoreResult | null {
  if (!record) return null;
  if (record.requestHash !== input.requestHash)
    return { ok: false, code: 'IDEMPOTENCY_CONFLICT' };
  const response = record.response as { ok: true; version: number };
  return { ...response, duplicate: true };
}

async function recordSuccess(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: IdempotencyInput,
  version: number,
) {
  const response = { ok: true as const, version, duplicate: false };
  await transaction.insert(gameIdempotency).values({
    gameId: input.gameId,
    actorId: input.actorId,
    key: input.idempotencyKey,
    requestHash: input.requestHash,
    response,
    resultingVersion: version,
  });
  return response;
}

function validateEvents(events: Event[]): Event[] {
  return eventSchema.array().parse(events);
}

function validateSnapshot(snapshot: SnapshotInput | undefined, seq: number) {
  if (!snapshot) return;
  if (
    snapshot.seq !== seq ||
    !snapshot.state ||
    typeof snapshot.state !== 'object' ||
    !('version' in snapshot.state) ||
    snapshot.state.version !== seq
  ) {
    throw new Error('Snapshot sequence must match its game state version');
  }
}

async function insertSnapshot(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  gameId: string,
  snapshot: SnapshotInput | undefined,
) {
  if (!snapshot) return;
  await transaction
    .insert(gameSnapshots)
    .values({ gameId, seq: snapshot.seq, state: snapshot.state })
    .onConflictDoNothing();
}

async function replaceDeadline(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  gameId: string,
  version: number,
  deadline: DeadlineInput | undefined,
) {
  if (!deadline) return;
  const now = new Date();
  await transaction
    .update(gameDeadlines)
    .set({ completedAt: now, claimedUntil: null, claimToken: null })
    .where(
      and(eq(gameDeadlines.gameId, gameId), isNull(gameDeadlines.completedAt)),
    );
  if (deadline.dueAt === null) return;
  const dueAt = new Date(deadline.dueAt);
  if (
    !Number.isFinite(deadline.dueAt) ||
    Number.isNaN(dueAt.getTime()) ||
    deadline.kind.length === 0 ||
    deadline.kind.length > 32
  ) {
    throw new Error('Invalid game deadline');
  }
  await transaction.insert(gameDeadlines).values({
    gameId,
    kind: deadline.kind,
    version,
    dueAt,
  });
}

export async function createGameWithEvent(
  input: CreateGameInput,
): Promise<GameStoreResult> {
  const [event] = validateEvents([input.event]);
  if (!event || event.type !== 'GameCreated' || event.seq !== 1)
    throw new Error('Initial game event must be GameCreated at sequence 1');
  validateSnapshot(input.snapshot, event.seq);
  const coordinatorCapability = input.coordinatorCapability
    ? insertGameCoordinatorCapabilitySchema.parse({
        gameId: event.id,
        ...input.coordinatorCapability,
      })
    : null;
  const idempotencyInput = { ...input, gameId: event.id };

  return db.transaction(async (transaction) => {
    const duplicate = duplicateResult(
      await findIdempotency(transaction, idempotencyInput),
      idempotencyInput,
    );
    if (duplicate) return duplicate;

    const [created] = await transaction
      .insert(games)
      .values({
        id: event.id,
        config: event.config,
        version: 1,
        status: 'active',
        createdAt: new Date(event.at),
        updatedAt: new Date(event.at),
      })
      .onConflictDoNothing()
      .returning({ id: games.id });

    if (!created) {
      const duplicateAfterConflict = duplicateResult(
        await findIdempotency(transaction, idempotencyInput),
        idempotencyInput,
      );
      return duplicateAfterConflict ?? { ok: false, code: 'GAME_EXISTS' };
    }

    if (coordinatorCapability)
      await transaction
        .insert(gameCoordinatorCapabilities)
        .values(coordinatorCapability);
    await transaction.insert(gameEvents).values({
      gameId: event.id,
      seq: event.seq,
      type: event.type,
      payload: event,
      recordedAt: new Date(event.at),
    });
    await insertSnapshot(transaction, event.id, input.snapshot);
    await replaceDeadline(transaction, event.id, event.seq, input.deadline);
    return recordSuccess(transaction, idempotencyInput, event.seq);
  });
}

export async function appendGameEvents(
  input: AppendEventsInput,
): Promise<GameStoreResult> {
  const events = validateEvents(input.events);
  if (events.length === 0) throw new Error('At least one event is required');
  const version = events.at(-1)!.seq;
  validateSnapshot(input.snapshot, version);

  return db.transaction(async (transaction) => {
    const duplicate = duplicateResult(
      await findIdempotency(transaction, input),
      input,
    );
    if (duplicate) return duplicate;

    const [game] = await transaction
      .select({ version: games.version })
      .from(games)
      .where(eq(games.id, input.gameId))
      .for('update')
      .limit(1);
    if (!game) return { ok: false, code: 'GAME_NOT_FOUND' };
    if (game.version !== input.expectedVersion)
      return {
        ok: false,
        code: 'VERSION_CONFLICT',
        currentVersion: game.version,
      };
    if (input.seatPinUpdate) {
      const [seatAccess] = await transaction
        .select({ seatId: gameSeatAccess.seatId })
        .from(gameSeatAccess)
        .where(
          and(
            eq(gameSeatAccess.gameId, input.gameId),
            eq(gameSeatAccess.seatId, input.seatPinUpdate.seatId),
          ),
        )
        .for('update')
        .limit(1);
      if (!seatAccess) return { ok: false, code: 'SEAT_ACCESS_NOT_FOUND' };
    }

    for (const [index, event] of events.entries()) {
      if (event.seq !== input.expectedVersion + index + 1)
        throw new Error('Game events must continue the stored sequence');
      if (event.type === 'GameCreated')
        throw new Error('Appended event does not belong to this game');
    }

    await transaction.insert(gameEvents).values(
      events.map((event) => ({
        gameId: input.gameId,
        seq: event.seq,
        type: event.type,
        payload: event,
        recordedAt: new Date(event.at),
      })),
    );
    const inviteClosingEvent = events.find(
      (event) =>
        event.type === 'GameFinished' ||
        (event.type === 'PhaseChanged' &&
          ['DEAL', 'FINISHED', 'ARCHIVED'].includes(event.phase)),
    );
    if (inviteClosingEvent) {
      await transaction
        .update(gameInvites)
        .set({
          revokedAt: new Date(inviteClosingEvent.at),
          displayCode: null,
        })
        .where(
          and(
            eq(gameInvites.gameId, input.gameId),
            isNull(gameInvites.revokedAt),
          ),
        );
    }
    if (input.seatPinUpdate) {
      await transaction
        .update(gameSeatAccess)
        .set({
          pinSalt: input.seatPinUpdate.pinSalt,
          pinHash: input.seatPinUpdate.pinHash,
          pinPepperVersion: input.seatPinUpdate.pinPepperVersion,
          failedPinAttempts: 0,
          lockedUntil: null,
        })
        .where(
          and(
            eq(gameSeatAccess.gameId, input.gameId),
            eq(gameSeatAccess.seatId, input.seatPinUpdate.seatId),
          ),
        );
    }
    if (input.seatSessionReplacement) {
      const session = insertGameViewerSessionSchema.parse({
        tokenHash: input.seatSessionReplacement.tokenHash,
        gameId: input.gameId,
        seatId: input.seatSessionReplacement.seatId,
        expiresAt: new Date(input.seatSessionReplacement.expiresAt),
      });
      await transaction
        .update(gameSeatAccess)
        .set({ failedPinAttempts: 0, lockedUntil: null })
        .where(
          and(
            eq(gameSeatAccess.gameId, input.gameId),
            eq(gameSeatAccess.seatId, input.seatSessionReplacement.seatId),
          ),
        );
      await transaction
        .update(gameViewerSessions)
        .set({ revokedAt: new Date(input.seatSessionReplacement.revokedAt) })
        .where(
          and(
            eq(gameViewerSessions.gameId, input.gameId),
            eq(gameViewerSessions.seatId, input.seatSessionReplacement.seatId),
            isNull(gameViewerSessions.revokedAt),
          ),
        );
      await transaction.insert(gameViewerSessions).values(session);
    }
    await transaction
      .update(games)
      .set({
        version,
        updatedAt: new Date(events.at(-1)!.at),
        ...(events.some((event) => event.type === 'GameFinished')
          ? { status: 'finished' }
          : {}),
      })
      .where(eq(games.id, input.gameId));
    await insertSnapshot(transaction, input.gameId, input.snapshot);
    await replaceDeadline(transaction, input.gameId, version, input.deadline);
    return recordSuccess(transaction, input, version);
  });
}

export async function readGameEvents(gameId: string): Promise<Event[]> {
  const rows = await db
    .select({ payload: gameEvents.payload })
    .from(gameEvents)
    .where(eq(gameEvents.gameId, gameId))
    .orderBy(asc(gameEvents.seq));
  return eventSchema.array().parse(rows.map(({ payload }) => payload));
}

export async function readGameCommandResult(
  input: IdempotencyInput,
): Promise<GameStoreResult | null> {
  const [record] = await db
    .select()
    .from(gameIdempotency)
    .where(
      and(
        eq(gameIdempotency.gameId, input.gameId),
        eq(gameIdempotency.actorId, input.actorId),
        eq(gameIdempotency.key, input.idempotencyKey),
      ),
    )
    .limit(1);
  return record ? duplicateResult(record, input) : null;
}

export async function readGameEventsAfter(
  gameId: string,
  seq: number,
): Promise<Event[]> {
  const rows = await db
    .select({ payload: gameEvents.payload })
    .from(gameEvents)
    .where(and(eq(gameEvents.gameId, gameId), gt(gameEvents.seq, seq)))
    .orderBy(asc(gameEvents.seq));
  return eventSchema.array().parse(rows.map(({ payload }) => payload));
}

export async function readLatestGameSnapshot(
  gameId: string,
): Promise<SnapshotInput | null> {
  const [snapshot] = await db
    .select({ seq: gameSnapshots.seq, state: gameSnapshots.state })
    .from(gameSnapshots)
    .where(eq(gameSnapshots.gameId, gameId))
    .orderBy(desc(gameSnapshots.seq))
    .limit(1);
  return snapshot ?? null;
}

export async function claimDueGameDeadlines(input: {
  now: number;
  limit: number;
  leaseMs: number;
}): Promise<DeadlineClaim[]> {
  if (
    !Number.isSafeInteger(input.now) ||
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 100 ||
    !Number.isInteger(input.leaseMs) ||
    input.leaseMs < 1_000
  ) {
    throw new Error('Invalid deadline claim options');
  }
  const now = new Date(input.now);
  const claimedUntil = new Date(input.now + input.leaseMs);
  return db.transaction(async (transaction) => {
    const dueRows = await transaction
      .select()
      .from(gameDeadlines)
      .where(
        and(
          isNull(gameDeadlines.completedAt),
          lte(gameDeadlines.dueAt, now),
          or(
            isNull(gameDeadlines.claimedUntil),
            lte(gameDeadlines.claimedUntil, now),
          ),
        ),
      )
      .orderBy(asc(gameDeadlines.dueAt), asc(gameDeadlines.id))
      .limit(input.limit)
      .for('update', { skipLocked: true });

    const claims: DeadlineClaim[] = [];
    for (const row of dueRows) {
      const claimToken = randomBytes(24).toString('base64url');
      const attempts = row.attempts + 1;
      await transaction
        .update(gameDeadlines)
        .set({ claimedUntil, claimToken, attempts })
        .where(eq(gameDeadlines.id, row.id));
      claims.push({
        id: row.id,
        gameId: row.gameId,
        kind: row.kind,
        version: row.version,
        dueAt: row.dueAt.getTime(),
        claimToken,
        attempts,
      });
    }
    return claims;
  });
}

export async function completeGameDeadline(
  id: number,
  claimToken: string,
): Promise<boolean> {
  const rows = await db
    .update(gameDeadlines)
    .set({ completedAt: new Date(), claimedUntil: null, claimToken: null })
    .where(
      and(
        eq(gameDeadlines.id, id),
        eq(gameDeadlines.claimToken, claimToken),
        isNull(gameDeadlines.completedAt),
      ),
    )
    .returning({ id: gameDeadlines.id });
  return rows.length === 1;
}

export async function releaseGameDeadline(
  id: number,
  claimToken: string,
): Promise<boolean> {
  const rows = await db
    .update(gameDeadlines)
    .set({ claimedUntil: null, claimToken: null })
    .where(
      and(
        eq(gameDeadlines.id, id),
        eq(gameDeadlines.claimToken, claimToken),
        isNull(gameDeadlines.completedAt),
      ),
    )
    .returning({ id: gameDeadlines.id });
  return rows.length === 1;
}

export async function countActiveGames(): Promise<number> {
  const result = await db.execute(
    sql`select count(*)::int as count from games where status = 'active'`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function listActiveRehearsalGameIds(
  limit = 25,
): Promise<string[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500)
    throw new Error('Invalid rehearsal game limit');
  const result = await db.execute(
    sql`select id from games
        where status = 'active'
          and config #>> '{rehearsal,enabled}' = 'true'
        order by updated_at asc
        limit ${limit}`,
  );
  return result.rows.flatMap((row) =>
    typeof row.id === 'string' ? [row.id] : [],
  );
}
