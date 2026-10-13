import { createServer } from 'node:http';
import { createApp } from './app';
import { parseEnvironment } from './config/env';
import { logger } from './lib/logger';

// Validate before importing the database or opening a listening socket.
const environment = parseEnvironment(process.env);
const { db, pool } = await import('@workspace/db');
const { countActiveGames } = await import('@workspace/db/game-store');
const { sql } = await import('drizzle-orm');

const allowedOrigins = environment.APP_BASE_URL
  ? [new URL(environment.APP_BASE_URL).origin]
  : [];
let publishGame: (gameId: string) => Promise<void> = async () => {};
const app = createApp(
  async () => {
    const result = await db.execute(
      sql`select version from foundation_meta where id = 1`,
    );
    if (result.rows[0]?.version !== 1)
      throw new Error('Database schema not ready');
  },
  {
    resolveViewer: () => ({ kind: 'visitor' }),
    publishGame: (gameId) => publishGame(gameId),
    allowedOrigins,
    maxActiveGames: environment.MAX_ACTIVE_GAMES,
    countActiveGames,
    secureCookies: environment.NODE_ENV === 'production',
    rateLimitSecret: environment.SESSION_SECRET,
  },
);
const server = createServer(app);
const { attachRealtime } = await import('./realtime');
const { createDeadlineScheduler } = await import('./deadline-scheduler');
const realtime = await attachRealtime(server, {
  allowedOrigins,
  resolveViewer: () => ({ kind: 'visitor' }),
});
publishGame = realtime.publishGame;
const scheduler = createDeadlineScheduler({
  publishGame,
  onError: () => logger.error('Deadline scheduler iteration failed'),
});
server.listen(environment.PORT, '0.0.0.0', () => {
  logger.info({ port: environment.PORT }, 'Server listening');
});
server.on('error', () => {
  logger.error('Server failed to listen');
  process.exitCode = 1;
});
scheduler.start();
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      await scheduler.stop();
      await realtime.close();
      await pool.end();
      process.exitCode = 0;
    })().catch(() => {
      logger.error('Server shutdown failed');
      void pool.end().finally(() => {
        process.exitCode = 1;
      });
    });
  });
}
