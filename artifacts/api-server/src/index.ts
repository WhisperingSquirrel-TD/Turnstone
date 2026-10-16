import { createServer } from 'node:http';
import { createApp } from './app';
import { parseEnvironment } from './config/env';
import { logger } from './lib/logger';
import { createServerAppOptions } from './server-options';

// Validate before importing the database or opening a listening socket.
const environment = parseEnvironment(process.env);
const { db, pool } = await import('@workspace/db');
const { countActiveGames } = await import('@workspace/db/game-store');
const { findViewerSession } = await import('@workspace/db/seat-access-store');
const { findPresenterSession } =
  await import('@workspace/db/presenter-access-store');
const { findCoordinatorSession } =
  await import('@workspace/db/coordinator-access-store');
const { sql } = await import('drizzle-orm');
const { createCoordinatorViewerResolver, createSeatViewerResolver } =
  await import('./session-auth');
const resolveSeatViewer = createSeatViewerResolver({
  findSession: findViewerSession,
  findPresenterSession,
  findCoordinatorSession,
});
const resolveCoordinatorViewer = createCoordinatorViewerResolver({
  findSession: findCoordinatorSession,
});

let publishGame: (gameId: string) => Promise<void> = async () => {};
const { createRehearsalBotRunner } = await import('./rehearsal-bots');
const rehearsalBots = createRehearsalBotRunner({
  publishGame: (gameId) => publishGame(gameId),
  testOnlyForceHumanTargetAfterFirstNight:
    environment.NODE_ENV === 'test' &&
    process.argv.includes('--test-only-force-human-removal'),
});
const serverOptions = createServerAppOptions({
  environment,
  resolveViewer: (request) => {
    const gameId =
      request.params.id ??
      (typeof request.body?.gameId === 'string'
        ? request.body.gameId
        : undefined);
    if (typeof gameId !== 'string') return { kind: 'visitor' };
    return resolveSeatViewer({
      gameId,
      cookieHeader: request.headers.cookie,
    });
  },
  resolveCoordinatorViewer: (request) => {
    const gameId = request.params.id;
    if (typeof gameId !== 'string') return { kind: 'visitor' };
    return resolveCoordinatorViewer({
      gameId,
      cookieHeader: request.headers.cookie,
    });
  },
  publishGame: (gameId) => publishGame(gameId),
  countActiveGames,
});
const app = createApp(
  async () => {
    const result = await db.execute(
      sql`select version from foundation_meta where id = 1`,
    );
    if (result.rows[0]?.version !== 1)
      throw new Error('Database schema not ready');
  },
  {
    ...serverOptions,
    processRehearsalGame: (gameId) => rehearsalBots.processGame(gameId),
  },
);
const server = createServer(app);
const { attachRealtime } = await import('./realtime');
const { createDeadlineScheduler } = await import('./deadline-scheduler');
const realtime = await attachRealtime(server, {
  allowedOrigins: serverOptions.allowedOrigins ?? [],
  resolveViewer: (headers, gameId) =>
    gameId
      ? resolveSeatViewer({ gameId, cookieHeader: headers.cookie })
      : { kind: 'visitor' },
});
publishGame = realtime.publishGame;
const scheduler = createDeadlineScheduler({
  publishGame,
  processRehearsalGame: (gameId) => rehearsalBots.processGame(gameId),
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
