import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { games } from './game-runtime';

export const gameSeatConnections = pgTable(
  'game_seat_connections',
  {
    connectionId: text('connection_id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    seatId: text('seat_id').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('game_seat_connections_game_seat_seen_idx').on(
      table.gameId,
      table.seatId,
      table.lastSeenAt,
    ),
  ],
);
