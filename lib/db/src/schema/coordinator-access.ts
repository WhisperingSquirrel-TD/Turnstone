import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { games } from './game-runtime';

export const gameCoordinatorCapabilities = pgTable(
  'game_coordinator_capabilities',
  {
    gameId: text('game_id')
      .primaryKey()
      .references(() => games.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    holderSeatId: text('holder_seat_id'),
    accountId: text('account_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('game_coordinator_capabilities_expiry_idx').on(table.expiresAt),
  ],
);

export const gameCoordinatorHandoffs = pgTable(
  'game_coordinator_handoffs',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    targetSeatId: text('target_seat_id').notNull(),
    codeHash: text('code_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('game_coordinator_handoffs_game_idx').on(table.gameId),
    index('game_coordinator_handoffs_expiry_idx').on(table.expiresAt),
  ],
);

export const insertGameCoordinatorCapabilitySchema = z.object({
  gameId: z.string().min(1).max(128),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.date(),
});

export const insertGameCoordinatorHandoffSchema = z.object({
  id: z.string().min(1).max(128),
  gameId: z.string().min(1).max(128),
  targetSeatId: z.string().min(1).max(128),
  codeHash: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.date(),
});

export type GameCoordinatorCapability =
  typeof gameCoordinatorCapabilities.$inferSelect;
