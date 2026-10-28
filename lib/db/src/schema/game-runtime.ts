import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const games = pgTable(
  'games',
  {
    id: text('id').primaryKey(),
    config: jsonb('config').notNull(),
    version: integer('version').notNull().default(0),
    status: text('status').notNull().default('active'),
    // Last UK calendar day of a real game; it is deleted the day after
    // (D117). Practice games have none.
    gameEndDate: date('game_end_date', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'games_end_date_required_check',
      sql`${table.gameEndDate} is not null or coalesce(${table.config} #>> '{rehearsal,enabled}', 'false') = 'true'`,
    ),
    index('games_end_date_idx').on(table.gameEndDate),
  ],
);

/** What remains of a cleared game: no names, codes or game content (D117). */
export const gameTombstones = pgTable(
  'game_tombstones',
  {
    gameId: text('game_id').primaryKey(),
    deletedOn: date('deleted_on', { mode: 'string' }).notNull(),
    reason: text('reason').notNull(),
  },
  (table) => [
    check(
      'game_tombstones_reason_check',
      sql`${table.reason} in ('end_date_passed', 'practice_inactive')`,
    ),
  ],
);

export const gameUndoWindows = pgTable('game_undo_windows', {
  gameId: text('game_id')
    .primaryKey()
    .references(() => games.id, { onDelete: 'cascade' }),
  actionVersion: integer('action_version').notNull(),
  state: jsonb('state').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  invalidatedAt: timestamp('invalidated_at', { withTimezone: true }),
});

export const gameEvents = pgTable(
  'game_events',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.gameId, table.seq] })],
);

export const gameSnapshots = pgTable(
  'game_snapshots',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    state: jsonb('state').notNull(),
    savedAt: timestamp('saved_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.gameId, table.seq] })],
);

export const gameIdempotency = pgTable(
  'game_idempotency',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    response: jsonb('response').notNull(),
    resultingVersion: integer('resulting_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.gameId, table.actorId, table.key],
    }),
  ],
);

export const gameDeadlines = pgTable(
  'game_deadlines',
  {
    id: serial('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    version: integer('version').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    claimedUntil: timestamp('claimed_until', { withTimezone: true }),
    claimToken: text('claim_token'),
    attempts: integer('attempts').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('game_deadlines_due_idx').on(
      table.completedAt,
      table.dueAt,
      table.claimedUntil,
    ),
  ],
);
