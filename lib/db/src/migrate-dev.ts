import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index';

// Explicit development operation only, never a production startup/build hook.
if (
  process.env.NODE_ENV === 'production' ||
  process.env.REPLIT_DEPLOYMENT === '1'
) {
  throw new Error('Development migrations cannot run in production');
}
try {
  await migrate(db, {
    migrationsFolder: path.resolve(import.meta.dirname, '../migrations'),
  });
} finally {
  await pool.end();
}
