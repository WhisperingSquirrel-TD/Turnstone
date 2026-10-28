import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  db,
  gameCoordinatorCapabilities,
  gameCoordinatorDelegates,
  gameCoordinatorTakeovers,
  gameEvents,
  gameSnapshots,
  gameDeadlines,
  gameUndoWindows,
  games,
} from '@workspace/db';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { createApp } from '../artifacts/api-server/src/app';
import { fixture } from './support/engine';
import {
  deleteGameSeatConnection,
  upsertGameSeatConnection,
} from '@workspace/db/seat-presence-store';
import {
  claimAutomaticCoordinatorHandover,
  findCoordinatorSession,
  reserveAutomaticCoordinatorHandover,
} from '@workspace/db/coordinator-access-store';

const gameIds: string[] = [];

afterEach(async () => {
  for (const gameId of gameIds.splice(0))
    await db.delete(games).where(eq(games.id, gameId));
});

async function setupCapability(input: {
  holderSeatId: string;
  lastSeenAt: number;
}) {
  const gameId = randomUUID();
  const tokenHash = `token-hash-${randomUUID()}`;
  gameIds.push(gameId);
  await db.insert(games).values({
    id: gameId,
    config: {},
    version: 0,
    status: 'active',
    gameEndDate: '2099-12-31',
  });
  await db.insert(gameCoordinatorCapabilities).values({
    gameId,
    tokenHash,
    holderSeatId: input.holderSeatId,
    lastSeenAt: new Date(input.lastSeenAt),
    expiresAt: new Date(1_000_000),
  });
  return { gameId, tokenHash };
}

const handoverInput = (
  gameId: string,
  overrides: Record<string, unknown> = {},
) => ({
  id: randomUUID(),
  gameId,
  delegateSeatIds: [],
  livingSeatIds: ['seat-a', 'seat-b'],
  connectedSeatIds: ['seat-a', 'seat-b'],
  now: 100_000,
  inactiveRequestCutoff: 40_000,
  expiresAt: 300_000,
  actionNeeded: true,
  ...overrides,
});

const claimInput = (
  gameId: string,
  reservation: { id: string; targetSeatId: string },
) => ({
  requestId: reservation.id,
  gameId,
  seatId: reservation.targetSeatId,
  tokenHash: `new-token-hash-${randomUUID()}`,
  sessionExpiresAt: 500_000,
  now: 100_000,
  inactiveRequestCutoff: 40_000,
  livingSeatIds: ['seat-a', 'seat-b'],
  connectedSeatIds: ['seat-a', 'seat-b'],
  actionNeeded: true,
  expectedVersion: 0,
});

describe('automatic coordinator handover', () => {
  it('commits one event for competing claims and safely replaces active deadline leases', async () => {
    const { gameId } = await setupCapability({
      holderSeatId: 'former-organiser',
      lastSeenAt: 10_000,
    });
    const reservation = await reserveAutomaticCoordinatorHandover(
      handoverInput(gameId),
    );
    const [oldDeadline] = await db
      .insert(gameDeadlines)
      .values({
        gameId,
        kind: 'LOBBY',
        version: 0,
        dueAt: new Date(200_000),
        claimedUntil: new Date(150_000),
        claimToken: randomUUID(),
      })
      .returning();
    await db.insert(gameUndoWindows).values({
      gameId,
      actionVersion: 0,
      state: {},
      expiresAt: new Date(300_000),
    });
    const outcomes = await Promise.all([
      claimAutomaticCoordinatorHandover(claimInput(gameId, reservation!)),
      claimAutomaticCoordinatorHandover(claimInput(gameId, reservation!)),
    ]);
    expect(outcomes.sort()).toEqual([false, true]);
    const events = await db
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.gameId, gameId));
    expect(events).toHaveLength(1);
    const deadlines = await db
      .select()
      .from(gameDeadlines)
      .where(eq(gameDeadlines.gameId, gameId));
    expect(deadlines).toHaveLength(2);
    expect(
      deadlines.find((deadline) => deadline.id === oldDeadline.id),
    ).toMatchObject({ completedAt: new Date(100_000), claimToken: null });
    expect(
      deadlines.find((deadline) => deadline.id !== oldDeadline.id),
    ).toMatchObject({
      version: 1,
      dueAt: new Date(200_000),
      kind: 'LOBBY',
      completedAt: null,
      claimToken: null,
    });
    const [undo] = await db
      .select()
      .from(gameUndoWindows)
      .where(eq(gameUndoWindows.gameId, gameId));
    expect(undo.invalidatedAt).toEqual(new Date(100_000));
  });

  it.each([false, true])(
    'does not let an unselected delegate bypass automatic selection (existing reservation: %s)',
    async (existingReservation) => {
      const now = 1_800_000_120_000;
      const { gameId, tokenHash } = await setupCapability({
        holderSeatId: 'former-organiser',
        lastSeenAt: now - 120_000,
      });
      const game = fixture(5);
      await db
        .update(games)
        .set({ version: game.state.version })
        .where(eq(games.id, gameId));
      await db.insert(gameSnapshots).values({
        gameId,
        seq: game.state.version,
        state: { ...game.state, id: gameId },
      });
      await db
        .update(gameCoordinatorCapabilities)
        .set({ expiresAt: new Date(now + 500_000) })
        .where(eq(gameCoordinatorCapabilities.gameId, gameId));
      await db.insert(gameCoordinatorDelegates).values([
        { gameId, seatId: 's0' },
        { gameId, seatId: 's1' },
      ]);
      const selectedConnectionId = randomUUID();
      for (const seatId of ['s0', 's1'])
        await upsertGameSeatConnection({
          connectionId: seatId === 's0' ? selectedConnectionId : randomUUID(),
          gameId,
          seatId,
          seenAt: now,
        });
      if (existingReservation)
        await reserveAutomaticCoordinatorHandover(
          handoverInput(gameId, {
            livingSeatIds: game.state.seats.map((seat) => seat.id),
            connectedSeatIds: ['s0', 's1'],
            delegateSeatIds: ['s0', 's1'],
            now,
            inactiveRequestCutoff: now - 60_000,
            expiresAt: now + 300_000,
          }),
        );
      let viewerSeatId = 's1';
      const app = createApp(async () => {}, {
        resolveViewer: () => ({ kind: 'player', seatId: viewerSeatId }),
        testOnlyNow: () => now,
        consumeRateLimit: async () => true,
      });
      const claim = () =>
        request(app)
          .post(`/api/games/${gameId}/takeover/claim`)
          .set('Cookie', 'oathstone-csrf=handover-test-csrf')
          .set('X-CSRF-Token', 'handover-test-csrf')
          .send({});
      const denied = await claim();
      expect(denied.status).toBe(409);
      expect(denied.headers['set-cookie']).toBeUndefined();
      const [unchanged] = await db
        .select()
        .from(gameCoordinatorCapabilities)
        .where(eq(gameCoordinatorCapabilities.gameId, gameId));
      expect(unchanged.tokenHash).toBe(tokenHash);
      if (existingReservation) {
        // Claim rechecks and replaces the now-disconnected selected delegate.
        await deleteGameSeatConnection(selectedConnectionId);
      } else {
        viewerSeatId = 's0';
      }
      const accepted = await claim();
      expect(accepted.status).toBe(200);
      expect(accepted.headers['set-cookie']).toBeDefined();
      expect(
        await db.select().from(gameEvents).where(eq(gameEvents.gameId, gameId)),
      ).toMatchObject([
        { type: 'CoordinatorRoleMoved', seq: game.state.version + 1 },
      ]);
    },
  );

  it('does not rotate or log against a stale game version', async () => {
    const { gameId, tokenHash } = await setupCapability({
      holderSeatId: 'former-organiser',
      lastSeenAt: 10_000,
    });
    const reservation = await reserveAutomaticCoordinatorHandover(
      handoverInput(gameId),
    );
    expect(
      await claimAutomaticCoordinatorHandover({
        ...claimInput(gameId, reservation!),
        expectedVersion: 1,
      }),
    ).toBe(false);
    const [capability] = await db
      .select()
      .from(gameCoordinatorCapabilities)
      .where(eq(gameCoordinatorCapabilities.gameId, gameId));
    expect(capability.tokenHash).toBe(tokenHash);
    expect(
      await db.select().from(gameEvents).where(eq(gameEvents.gameId, gameId)),
    ).toEqual([]);
  });

  it.each(['disconnected', 'dead'])(
    'reselects a %s reserved recipient',
    async (reason) => {
      const { gameId } = await setupCapability({
        holderSeatId: 'former-organiser',
        lastSeenAt: 10_000,
      });
      const first = await reserveAutomaticCoordinatorHandover(
        handoverInput(gameId, { delegateSeatIds: ['seat-b'] }),
      );
      expect(first?.targetSeatId).toBe('seat-b');
      const second = await reserveAutomaticCoordinatorHandover(
        handoverInput(gameId, {
          delegateSeatIds: ['seat-b'],
          ...(reason === 'disconnected'
            ? { connectedSeatIds: ['seat-a'] }
            : { livingSeatIds: ['seat-a'] }),
        }),
      );
      expect(second?.targetSeatId).toBe('seat-a');
      expect(second?.id).not.toBe(first?.id);
      const [stale] = await db
        .select()
        .from(gameCoordinatorTakeovers)
        .where(eq(gameCoordinatorTakeovers.id, first!.id));
      expect(stale.status).toBe('cancelled');
    },
  );

  it('cancels an ineligible reservation even when nobody can replace it', async () => {
    const { gameId } = await setupCapability({
      holderSeatId: 'former-organiser',
      lastSeenAt: 10_000,
    });
    const first = await reserveAutomaticCoordinatorHandover(
      handoverInput(gameId),
    );
    expect(
      await reserveAutomaticCoordinatorHandover(
        handoverInput(gameId, { connectedSeatIds: [] }),
      ),
    ).toBeNull();
    const [stale] = await db
      .select()
      .from(gameCoordinatorTakeovers)
      .where(eq(gameCoordinatorTakeovers.id, first!.id));
    expect(stale.status).toBe('cancelled');
  });

  it.each(['disconnected', 'dead', 'no-action'])(
    'rejects a selected recipient who is now %s at claim',
    async (reason) => {
      const { gameId, tokenHash } = await setupCapability({
        holderSeatId: 'former-organiser',
        lastSeenAt: 10_000,
      });
      const reservation = await reserveAutomaticCoordinatorHandover(
        handoverInput(gameId),
      );
      expect(
        await claimAutomaticCoordinatorHandover({
          ...claimInput(gameId, reservation!),
          ...(reason === 'disconnected'
            ? { connectedSeatIds: [] }
            : reason === 'dead'
              ? { livingSeatIds: [] }
              : { actionNeeded: false }),
        }),
      ).toBe(false);
      const [capability] = await db
        .select()
        .from(gameCoordinatorCapabilities)
        .where(eq(gameCoordinatorCapabilities.gameId, gameId));
      expect(capability.tokenHash).toBe(tokenHash);
      expect(
        await db.select().from(gameEvents).where(eq(gameEvents.gameId, gameId)),
      ).toEqual([]);
    },
  );

  it('keeps the old capability and reservation retryable when recording the event fails', async () => {
    const { gameId, tokenHash } = await setupCapability({
      holderSeatId: 'former-organiser',
      lastSeenAt: 10_000,
    });
    const reservation = await reserveAutomaticCoordinatorHandover(
      handoverInput(gameId),
    );
    // A conflicting event row forces a real insert failure after eligibility checks.
    await db.insert(gameEvents).values({
      gameId,
      seq: 1,
      type: 'CoordinatorRoleMoved',
      payload: {
        schemaVersion: 1,
        seq: 1,
        at: 100_000,
        type: 'CoordinatorRoleMoved',
      },
    });
    await expect(
      claimAutomaticCoordinatorHandover(claimInput(gameId, reservation!)),
    ).rejects.toThrow();
    const [capability] = await db
      .select()
      .from(gameCoordinatorCapabilities)
      .where(eq(gameCoordinatorCapabilities.gameId, gameId));
    expect(capability.tokenHash).toBe(tokenHash);
    const [pending] = await db
      .select()
      .from(gameCoordinatorTakeovers)
      .where(eq(gameCoordinatorTakeovers.id, reservation!.id));
    expect(pending.status).toBe('automatic');
    await db.delete(gameEvents).where(eq(gameEvents.gameId, gameId));
    expect(
      await claimAutomaticCoordinatorHandover(claimInput(gameId, reservation!)),
    ).toBe(true);
    expect(
      await db.select().from(gameEvents).where(eq(gameEvents.gameId, gameId)),
    ).toMatchObject([{ type: 'CoordinatorRoleMoved', seq: 1 }]);
  });

  it('selects the configured connected co-coordinator first and persists the target', async () => {
    const { gameId } = await setupCapability({
      holderSeatId: 'former-organiser',
      lastSeenAt: 10_000,
    });
    await db.insert(gameCoordinatorDelegates).values({
      gameId,
      seatId: 'seat-b',
    });

    const first = await reserveAutomaticCoordinatorHandover(
      handoverInput(gameId, { delegateSeatIds: ['seat-b'] }),
    );
    const second = await reserveAutomaticCoordinatorHandover(
      handoverInput(gameId, { delegateSeatIds: ['seat-b'] }),
    );
    expect(first).toMatchObject({ targetSeatId: 'seat-b' });
    expect(second).toEqual(first);
  });

  it('chooses only a living connected seat when no co-coordinator is set', async () => {
    const { gameId } = await setupCapability({
      holderSeatId: 'former-organiser',
      lastSeenAt: 10_000,
    });
    const reserved = await reserveAutomaticCoordinatorHandover(
      handoverInput(gameId, {
        livingSeatIds: ['seat-a', 'seat-b'],
        connectedSeatIds: [
          'seat-a',
          'seat-b',
          'out-of-game',
          'former-organiser',
        ],
      }),
    );
    expect(['seat-a', 'seat-b']).toContain(reserved?.targetSeatId);
  });

  it('can hand over to the only connected living player who is waiting', async () => {
    const { gameId } = await setupCapability({
      holderSeatId: 'former-organiser',
      lastSeenAt: 10_000,
    });
    const reserved = await reserveAutomaticCoordinatorHandover(
      handoverInput(gameId, {
        livingSeatIds: ['seat-a', 'seat-b'],
        connectedSeatIds: ['seat-b'],
      }),
    );
    expect(reserved?.targetSeatId).toBe('seat-b');
  });

  it('rotates the capability only for the selected seat and records completion', async () => {
    const { gameId, tokenHash: oldTokenHash } = await setupCapability({
      holderSeatId: 'former-organiser',
      lastSeenAt: 10_000,
    });
    const reservation = await reserveAutomaticCoordinatorHandover(
      handoverInput(gameId),
    );
    expect(reservation).not.toBeNull();
    const tokenHash = `new-token-hash-${randomUUID()}`;
    expect(
      await claimAutomaticCoordinatorHandover({
        ...claimInput(gameId, reservation!),
        requestId: reservation!.id,
        gameId,
        seatId: 'wrong-seat',
        tokenHash,
        sessionExpiresAt: 500_000,
        now: 100_000,
        inactiveRequestCutoff: 40_000,
      }),
    ).toBe(false);
    expect(
      await claimAutomaticCoordinatorHandover({
        ...claimInput(gameId, reservation!),
        requestId: reservation!.id,
        gameId,
        seatId: reservation!.targetSeatId,
        tokenHash,
        sessionExpiresAt: 500_000,
        now: 100_000,
        inactiveRequestCutoff: 40_000,
      }),
    ).toBe(true);
    const [capability] = await db
      .select()
      .from(gameCoordinatorCapabilities)
      .where(eq(gameCoordinatorCapabilities.gameId, gameId));
    expect(capability).toMatchObject({
      holderSeatId: reservation!.targetSeatId,
      tokenHash,
    });
    expect(await findCoordinatorSession(oldTokenHash, gameId)).toBeNull();
    expect(
      await db
        .select()
        .from(gameCoordinatorTakeovers)
        .where(eq(gameCoordinatorTakeovers.id, reservation!.id)),
    ).toMatchObject([{ status: 'completed' }]);
    const events = await db
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.gameId, gameId));
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({
      schemaVersion: 1,
      seq: 1,
      at: 100_000,
      type: 'CoordinatorRoleMoved',
    });
    expect(JSON.stringify(events)).not.toContain(tokenHash);
    expect(
      await claimAutomaticCoordinatorHandover(claimInput(gameId, reservation!)),
    ).toBe(false);
  });
});
