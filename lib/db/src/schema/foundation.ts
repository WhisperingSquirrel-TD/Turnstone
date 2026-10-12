import { integer, pgTable } from 'drizzle-orm/pg-core';

// Infrastructure only. Game state and event schemas await the binding SPEC.
export const foundationMeta = pgTable('foundation_meta', {
  id: integer('id').primaryKey(),
  version: integer('version').notNull(),
});
