import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
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
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
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

export const gameCoordinatorDelegates = pgTable(
  'game_coordinator_delegates',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    seatId: text('seat_id').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.gameId, table.seatId] }),
    index('game_coordinator_delegates_seat_idx').on(table.seatId),
  ],
);

export const gameCoordinatorTakeovers = pgTable(
  'game_coordinator_takeovers',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    requesterSeatId: text('requester_seat_id').notNull(),
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    index('game_coordinator_takeovers_game_idx').on(table.gameId),
    index('game_coordinator_takeovers_expiry_idx').on(table.expiresAt),
  ],
);

export const gameCoordinatorTakeoverVotes = pgTable(
  'game_coordinator_takeover_votes',
  {
    requestId: text('request_id')
      .notNull()
      .references(() => gameCoordinatorTakeovers.id, { onDelete: 'cascade' }),
    seatId: text('seat_id').notNull(),
    approved: boolean('approved').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.requestId, table.seatId] }),
    index('game_coordinator_takeover_votes_seat_idx').on(table.seatId),
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
