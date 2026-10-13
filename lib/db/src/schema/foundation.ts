import { integer, pgTable } from 'drizzle-orm/pg-core';

// Foundation metadata identifies the committed database schema version.
export const foundationMeta = pgTable('foundation_meta', {
  id: integer('id').primaryKey(),
  version: integer('version').notNull(),
});
