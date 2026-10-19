import { isAllowedSocketOrigin } from './socket-origin';
import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders, Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { pool, type PoolClient } from '@workspace/db';
import {
  gameChangedNotificationSchema,
  gameWatchSchema,
  gameViewResponseSchema,
} from '@workspace/shared';
import {
  replay,
  replayFrom,
  viewFor,
  type State,
  type Viewer,
} from '@workspace/engine';
import {
  readGameEvents,
  readGameEventsAfter,
  readLatestGameSnapshot,
} from '@workspace/db/game-store';
import { getOpenGameInviteCode } from '@workspace/db/seat-access-store';

export type RealtimeOptions = {
  allowedOrigins: readonly string[];
  now?: () => number;
  resolveViewer: (
    headers: IncomingHttpHeaders,
    gameId?: string,
  ) => Viewer | Promise<Viewer>;
  authoriseGame?: (
    viewer: Viewer,
    gameId: string,
  ) => boolean | Promise<boolean>;
  onError?: () => void;
};

function projectViewer(viewer: Viewer, state: State, lobbyCode: string | null) {
  return viewer.kind === 'visitor'
    ? viewFor({ kind: 'visitor' }, state)
    : viewFor(viewer, state, { lobbyCode });
}

function encodedGameRoom(gameId: string): string {
  return `watch:${Buffer.from(gameId).toString('base64url')}`;
}

async function loadGameState(gameId: string): Promise<State | null> {
  const snapshot = await readLatestGameSnapshot(gameId);
  if (!snapshot) {
    const events = await readGameEvents(gameId);
    return events.length > 0 ? replay(events) : null;
  }
  if (
    !snapshot.state ||
    typeof snapshot.state !== 'object' ||
    !('version' in snapshot.state) ||
    snapshot.state.version !== snapshot.seq
  ) {
    throw new Error('Stored snapshot is invalid');
  }
  return replayFrom(
    snapshot.state as State,
    await readGameEventsAfter(gameId, snapshot.seq),
  );
}

export async function attachRealtime(
  httpServer: HttpServer,
  options: RealtimeOptions,
) {
  const notificationChannel = 'oathstone_game_changed';
  const instanceId = randomUUID();
  let notificationClient: PoolClient | null = null;
  let notificationErrorHandler: (() => void) | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  const io = new Server(httpServer, {
    cors: {
      origin: [...options.allowedOrigins],
      credentials: true,
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 32_768,
    pingInterval: 25_000,
  });

  async function publishLocal(gameId: string): Promise<void> {
    const state = await loadGameState(gameId);
    if (!state) return;
    const serverNow = options.now?.() ?? Date.now();
    const room = encodedGameRoom(gameId);
    const sockets = await io.in(room).fetchSockets();
    const lobbyCode =
      state.phase === 'LOBBY' && sockets.length > 0
        ? await getOpenGameInviteCode(state.id, serverNow)
        : null;
    for (const socket of sockets) {
      if (socket.data.gameId !== gameId) continue;
      if (
        socket.data.authenticatedGameId &&
        socket.data.authenticatedGameId !== gameId
      ) {
        await socket.leave(room);
        socket.disconnect(true);
        continue;
      }
      const viewer = await options.resolveViewer(
        socket.handshake.headers,
        gameId,
      );
      const seatAuthorised =
        (viewer.kind === 'player' || viewer.kind === 'ghost') &&
        Boolean(
          viewer.seatId &&
          state.seats.some((seat) => seat.id === viewer.seatId),
        );
      const gameAuthorised =
        viewer.kind === 'coordinator' ||
        viewer.kind === 'presenter' ||
        (options.authoriseGame &&
          (await options.authoriseGame(viewer, gameId)));
      if (viewer.kind === 'visitor' || (!seatAuthorised && !gameAuthorised)) {
        await socket.leave(room);
        socket.disconnect(true);
        continue;
      }
      socket.data.viewer = viewer;
      const response = gameViewResponseSchema.parse({
        serverNow,
        version: state.version,
        view: projectViewer(viewer, state, lobbyCode),
      });
      socket.emit('game:view', response);
    }
  }

  function onNotification(message: {
    channel?: string;
    payload?: string;
  }): void {
    if (message.channel !== notificationChannel || !message.payload) return;
    try {
      const parsed = gameChangedNotificationSchema.safeParse(
        JSON.parse(message.payload),
      );
      if (!parsed.success || parsed.data.source === instanceId) return;
      void publishLocal(parsed.data.gameId).catch(() => options.onError?.());
    } catch {
      options.onError?.();
    }
  }

  async function connectNotificationClient(): Promise<void> {
    if (closed) return;
    let client: PoolClient | null = null;
    try {
      client = await pool.connect();
      await client.query(`LISTEN ${notificationChannel}`);
      notificationClient = client;
      client.on('notification', onNotification);
      const onError = () => {
        if (notificationClient !== client) return;
        notificationClient = null;
        client?.removeListener('notification', onNotification);
        client?.removeListener('error', onError);
        notificationErrorHandler = null;
        client?.release(new Error('PostgreSQL notification connection failed'));
        options.onError?.();
        if (!closed) {
          reconnectTimer = setTimeout(() => {
            void connectNotificationClient().catch(() => options.onError?.());
          }, 1_000);
        }
      };
      notificationErrorHandler = onError;
      client.on('error', onError);
    } catch {
      client?.release(new Error('PostgreSQL notification setup failed'));
      options.onError?.();
      throw new Error('Unable to start PostgreSQL realtime notifications');
    }
  }

  await connectNotificationClient();

  io.use((socket, next) => {
    if (
      !isAllowedSocketOrigin(socket.handshake.headers, options.allowedOrigins)
    ) {
      next(new Error('Unauthorized'));
      return;
    }
    const rawGameId = socket.handshake.auth?.gameId as unknown;
    if (
      rawGameId !== undefined &&
      (typeof rawGameId !== 'string' ||
        rawGameId.length === 0 ||
        rawGameId.length > 128)
    ) {
      next(new Error('Unauthorized'));
      return;
    }
    const gameId = typeof rawGameId === 'string' ? rawGameId : undefined;
    void Promise.resolve(options.resolveViewer(socket.request.headers, gameId))
      .then((viewer) => {
        if (
          viewer.kind === 'visitor' ||
          (viewer.kind === 'player' && !gameId)
        ) {
          next(new Error('Unauthorized'));
          return;
        }
        socket.data.viewer = viewer;
        socket.data.authenticatedGameId = gameId;
        next();
      })
      .catch(() => next(new Error('Unauthorized')));
  });

  io.on('connection', (socket) => {
    socket.on(
      'game:watch',
      async (input: unknown, acknowledgement?: (response: unknown) => void) => {
        try {
          const parsed = gameWatchSchema.safeParse(input);
          if (!parsed.success) {
            acknowledgement?.({ error: 'Invalid request' });
            return;
          }
          const gameId = parsed.data.gameId;
          const authenticatedGameId = socket.data.authenticatedGameId as
            string | undefined;
          if (authenticatedGameId && authenticatedGameId !== gameId) {
            acknowledgement?.({ error: 'Not found' });
            return;
          }
          const viewer = await options.resolveViewer(
            socket.handshake.headers,
            gameId,
          );
          if (viewer.kind === 'visitor') {
            acknowledgement?.({ error: 'Not found' });
            socket.disconnect(true);
            return;
          }
          const state = await loadGameState(gameId);
          const seatId =
            viewer.kind === 'player' || viewer.kind === 'ghost'
              ? viewer.seatId
              : undefined;
          const seatAuthorised = Boolean(
            seatId && state?.seats.some((seat) => seat.id === seatId),
          );
          const gameAuthorised =
            viewer.kind === 'presenter' ||
            viewer.kind === 'coordinator' ||
            (options.authoriseGame &&
              (await options.authoriseGame(viewer, gameId)));
          if (!state || (!seatAuthorised && !gameAuthorised)) {
            acknowledgement?.({ error: 'Not found' });
            return;
          }
          const serverNow = options.now?.() ?? Date.now();
          const previousRoom = socket.data.gameRoom as string | undefined;
          if (previousRoom) await socket.leave(previousRoom);
          const room = encodedGameRoom(gameId);
          socket.data.gameId = gameId;
          socket.data.gameRoom = room;
          await socket.join(room);
          const lobbyCode =
            state.phase === 'LOBBY' &&
            (viewer.kind === 'player' || viewer.kind === 'presenter')
              ? await getOpenGameInviteCode(state.id, serverNow)
              : null;
          const response = gameViewResponseSchema.parse({
            serverNow,
            version: state.version,
            view: projectViewer(viewer, state, lobbyCode),
          });
          socket.emit('game:view', response);
          acknowledgement?.({ ok: true });
        } catch {
          acknowledgement?.({ error: 'Service unavailable' });
        }
      },
    );
  });

  return {
    async publishGame(gameId: string): Promise<void> {
      await publishLocal(gameId);
      await pool.query('select pg_notify($1, $2)', [
        notificationChannel,
        JSON.stringify({ gameId, source: instanceId }),
      ]);
    },
    close(): Promise<void> {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (notificationClient) {
        notificationClient.removeListener('notification', onNotification);
        if (notificationErrorHandler)
          notificationClient.removeListener('error', notificationErrorHandler);
        notificationErrorHandler = null;
        notificationClient.release();
      }
      notificationClient = null;
      return new Promise((resolve) => io.close(() => resolve()));
    },
  };
}
