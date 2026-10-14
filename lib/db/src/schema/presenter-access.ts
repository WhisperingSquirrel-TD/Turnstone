import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { games } from './game-runtime';

export const gamePresenterPairings = pgTable(
  'game_presenter_pairings',
  {
    codeHash: text('code_hash').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('game_presenter_pairings_by_game_idx').on(
      table.gameId,
      table.expiresAt,
    ),
  ],
);

export const gamePresenterSessions = pgTable(
  'game_presenter_sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('game_presenter_sessions_by_game_idx').on(table.gameId),
    index('game_presenter_sessions_expiry_idx').on(table.expiresAt),
  ],
);

export const insertGamePresenterPairingSchema = z.object({
  codeHash: z.string().regex(/^[a-f0-9]{64}$/),
  gameId: z.string().min(1).max(128),
  expiresAt: z.date(),
});

export const insertGamePresenterSessionSchema = z.object({
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  gameId: z.string().min(1).max(128),
  expiresAt: z.date(),
});

export type GamePresenterPairing = typeof gamePresenterPairings.$inferSelect;
export type GamePresenterSession = typeof gamePresenterSessions.$inferSelect;
