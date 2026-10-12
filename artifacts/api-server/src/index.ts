import { createApp } from './app';
import { parseEnvironment } from './config/env';
import { logger } from './lib/logger';

// Validate before importing the database or opening a listening socket.
const environment = parseEnvironment(process.env);
const { db, pool } = await import('@workspace/db');
const { sql } = await import('drizzle-orm');

const app = createApp(async () => {
  const result = await db.execute(
    sql`select version from foundation_meta where id = 1`,
  );
  if (result.rows[0]?.version !== 1)
    throw new Error('Database schema not ready');
});
const server = app.listen(environment.PORT, '0.0.0.0', () => {
  logger.info({ port: environment.PORT }, 'Server listening');
});
server.on('error', () => {
  logger.error('Server failed to listen');
  process.exitCode = 1;
});
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    server.close(() => {
      void pool.end().then(() => {
        process.exitCode = 0;
      });
    });
  });
}
