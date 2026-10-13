import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const apiRateLimits = pgTable('api_rate_limits', {
  bucketHash: text('bucket_hash').primaryKey(),
  windowStartedAt: timestamp('window_started_at', {
    withTimezone: true,
  }).notNull(),
  hitCount: integer('hit_count').notNull(),
});
