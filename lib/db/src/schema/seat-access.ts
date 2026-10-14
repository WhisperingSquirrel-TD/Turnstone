import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { games } from './game-runtime';

export const gameSeatAccess = pgTable(
  'game_seat_access',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    seatId: text('seat_id').notNull(),
    pinSalt: text('pin_salt').notNull(),
    pinHash: text('pin_hash').notNull(),
    failedPinAttempts: integer('failed_pin_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.gameId, table.seatId] }),
    check(
      'game_seat_access_failed_pin_attempts_check',
      sql`${table.failedPinAttempts} between 0 and 5`,
    ),
  ],
);

export const gameViewerSessions = pgTable(
  'game_viewer_sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    gameId: text('game_id').notNull(),
    seatId: text('seat_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.gameId, table.seatId],
      foreignColumns: [gameSeatAccess.gameId, gameSeatAccess.seatId],
      name: 'game_viewer_sessions_seat_fk',
    }).onDelete('cascade'),
    index('game_viewer_sessions_by_seat_idx').on(table.gameId, table.seatId),
    index('game_viewer_sessions_expiry_idx').on(table.expiresAt),
  ],
);

export const gameInvites = pgTable(
  'game_invites',
  {
    gameId: text('game_id')
      .primaryKey()
      .references(() => games.id, { onDelete: 'cascade' }),
    linkTokenHash: text('link_token_hash').notNull().unique(),
    shortCodeHash: text('short_code_hash').notNull().unique(),
    displayCode: text('display_code'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('game_invites_expiry_idx').on(table.expiresAt)],
);

export const gameJoinRequests = pgTable(
  'game_join_requests',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id').notNull(),
    seatId: text('seat_id').notNull(),
    requestTokenHash: text('request_token_hash').notNull().unique(),
    name: text('name').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.gameId, table.seatId],
      foreignColumns: [gameSeatAccess.gameId, gameSeatAccess.seatId],
      name: 'game_join_requests_seat_fk',
    }).onDelete('cascade'),
    check(
      'game_join_requests_status_check',
      sql`${table.status} in ('pending', 'approved', 'rejected', 'expired')`,
    ),
    index('game_join_requests_by_game_idx').on(table.gameId, table.status),
    index('game_join_requests_expiry_idx').on(table.expiresAt),
  ],
);

export const insertGameSeatAccessSchema = z.object({
  gameId: z.string().min(1).max(128),
  seatId: z.string().min(1).max(128),
  pinSalt: z.string().regex(/^[a-f0-9]{32}$/),
  pinHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const insertGameViewerSessionSchema = z.object({
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  gameId: z.string().min(1).max(128),
  seatId: z.string().min(1).max(128),
  expiresAt: z.date(),
});

export const insertGameInviteSchema = z.object({
  gameId: z.string().min(1).max(128),
  linkTokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  shortCodeHash: z.string().regex(/^[a-f0-9]{64}$/),
  displayCode: z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/),
  expiresAt: z.date().nullable().optional(),
});

export const insertGameJoinRequestSchema = z.object({
  id: z.string().min(1).max(128),
  gameId: z.string().min(1).max(128),
  seatId: z.string().min(1).max(128),
  requestTokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  name: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .refine((v) => !/\p{Cc}/u.test(v)),
  expiresAt: z.date(),
});

export type InsertGameSeatAccess = z.infer<typeof insertGameSeatAccessSchema>;
export type InsertGameViewerSession = z.infer<
  typeof insertGameViewerSessionSchema
>;
export type GameSeatAccess = typeof gameSeatAccess.$inferSelect;
export type GameViewerSession = typeof gameViewerSessions.$inferSelect;
export type GameInvite = typeof gameInvites.$inferSelect;
export type GameJoinRequest = typeof gameJoinRequests.$inferSelect;
