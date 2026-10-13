import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import cors from 'cors';
import {
  HealthCheckResponse,
  ReadinessCheckResponse,
} from '@workspace/api-zod';
import {
  apiErrorResponseSchema,
  commandSchema,
  csrfTokenResponseSchema,
  gameViewResponseSchema,
} from '@workspace/shared';
import {
  decide,
  replay,
  replayFrom,
  viewFor,
  type Actor,
  type State,
  type Viewer,
} from '@workspace/engine';
import { gameRandom } from '@workspace/security/game-random';
import { security } from './middlewares/security';

type AppOptions = {
  resolveViewer?: (request: Request) => Viewer | Promise<Viewer>;
  publishGame?: (gameId: string) => Promise<void>;
  allowedOrigins?: readonly string[];
  maxActiveGames?: number;
  countActiveGames?: () => Promise<number>;
  secureCookies?: boolean;
  rateLimitSecret?: string;
  consumeRateLimit?: (
    bucketHash: string,
    limit: number,
    windowMs: number,
  ) => Promise<boolean>;
};

const csrfCookieName = 'turnstone-csrf';

function csrfCookie(request: Request): string | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== csrfCookieName)
      continue;
    return item.slice(separator + 1).trim();
  }
  return null;
}

function hasValidCsrf(request: Request): boolean {
  const cookie = csrfCookie(request);
  const header = request.get('X-CSRF-Token');
  if (!request.get('Origin') && !request.headers.cookie) return true;
  if (!cookie || !header || cookie.length !== header.length) return false;
  return timingSafeEqual(Buffer.from(cookie), Buffer.from(header));
}

function actorFor(viewer: Viewer): Actor | null {
  if (viewer.kind === 'coordinator' || viewer.kind === 'host')
    return { kind: 'coordinator' };
  if (viewer.kind === 'player' && viewer.seatId)
    return { kind: 'player', seatId: viewer.seatId };
  return null;
}

function actorId(actor: Actor): string {
  return actor.kind === 'player' ? `seat:${actor.seatId}` : 'coordinator';
}

function projectState(state: State, viewer: Viewer) {
  const view =
    viewer.kind === 'visitor'
      ? viewFor({ kind: 'visitor' }, state)
      : viewFor(viewer, state);
  return gameViewResponseSchema.parse({ version: state.version, view });
}

function requestHash(command: unknown): string {
  return createHash('sha256').update(JSON.stringify(command)).digest('hex');
}

async function loadGameState(gameId: string): Promise<State | null> {
  const { readGameEvents, readGameEventsAfter, readLatestGameSnapshot } =
    await import('@workspace/db/game-store');
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
  const events = await readGameEventsAfter(gameId, snapshot.seq);
  return replayFrom(snapshot.state as State, events);
}

function sendError(response: Response, status: number, error: string): void {
  response.status(status).json(apiErrorResponseSchema.parse({ error }));
}

export function createApp(
  probeDatabase: () => Promise<void>,
  options: AppOptions = {},
): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(security);
  app.use(
    cors({
      origin(origin, callback) {
        callback(
          null,
          Boolean(origin && options.allowedOrigins?.includes(origin)),
        );
      },
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Idempotency-Key'],
    }),
  );
  app.use(express.json({ limit: '32kb', strict: true }));
  async function checkRateLimit(
    request: Request,
    scope: string,
    actor?: string,
    limit = 60,
  ): Promise<boolean> {
    if (!options.rateLimitSecret) return true;
    const subjects = [
      `ip:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`,
      ...(actor ? [`actor:${actor}`] : []),
    ];
    const { consumeRateLimit } = options.consumeRateLimit
      ? { consumeRateLimit: options.consumeRateLimit }
      : await import('@workspace/db/rate-limit');
    for (const subject of subjects) {
      const bucketHash = createHmac('sha256', options.rateLimitSecret)
        .update(`${scope}\u0000${subject}`)
        .digest('hex');
      if (!(await consumeRateLimit(bucketHash, limit, 60_000))) return false;
    }
    return true;
  }
  app.get(['/api/healthz', '/healthz'], (_req, res) => {
    res.json(HealthCheckResponse.parse({ status: 'ok' }));
  });
  app.get(['/api/readyz', '/readyz'], async (_req, res) => {
    try {
      await probeDatabase();
      res.json(ReadinessCheckResponse.parse({ status: 'ready' }));
    } catch {
      res
        .status(503)
        .json(ReadinessCheckResponse.parse({ status: 'unavailable' }));
    }
  });
  app.get('/api/csrf', (request, response) => {
    const existing = csrfCookie(request);
    const token =
      existing && /^[A-Za-z0-9_-]{43}$/.test(existing)
        ? existing
        : randomBytes(32).toString('base64url');
    const parsed = csrfTokenResponseSchema.parse({ csrfToken: token });
    response.cookie(csrfCookieName, token, {
      httpOnly: true,
      secure: options.secureCookies ?? false,
      sameSite: 'strict',
      path: '/',
      maxAge: 8 * 60 * 60 * 1_000,
    });
    response.status(200).json(parsed);
  });
  app.post('/api/games', async (request, response) => {
    try {
      if (!hasValidCsrf(request)) {
        sendError(response, 403, 'Invalid request');
        return;
      }
      const parsed = commandSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.type !== 'CreateGame') {
        sendError(response, 400, 'Invalid request');
        return;
      }
      const viewer = options.resolveViewer
        ? await options.resolveViewer(request)
        : { kind: 'visitor' as const };
      const actor = actorFor(viewer);
      if (actor?.kind !== 'coordinator') {
        sendError(response, 401, 'Authentication required');
        return;
      }
      if (!(await checkRateLimit(request, 'create-game', actorId(actor), 5))) {
        sendError(response, 429, 'Too many requests');
        return;
      }
      if (options.maxActiveGames !== undefined) {
        const activeGames = options.countActiveGames
          ? await options.countActiveGames()
          : await (await import('@workspace/db/game-store')).countActiveGames();
        if (activeGames > options.maxActiveGames * 0.8) {
          sendError(
            response,
            503,
            'Busy right now, try again in a few minutes',
          );
          return;
        }
      }
      const result = decide(null, parsed.data, {
        now: Date.now(),
        actor,
        random: gameRandom,
      });
      if (!result.ok || result.events.length !== 1) {
        sendError(response, 409, 'Command rejected');
        return;
      }

      const { createGameWithEvent } = await import('@workspace/db/game-store');
      const initialState = replay(result.events);
      const stored = await createGameWithEvent({
        event: result.events[0]!,
        actorId: actorId(actor),
        idempotencyKey: parsed.data.idempotencyKey,
        requestHash: requestHash(parsed.data),
        snapshot: { seq: initialState.version, state: initialState },
        deadline: {
          kind: initialState.phase,
          dueAt: initialState.deadline,
        },
      });
      if (!stored.ok) {
        sendError(response, 409, 'Command rejected');
        return;
      }
      const state = await loadGameState(parsed.data.id);
      if (!state) {
        sendError(response, 404, 'Not found');
        return;
      }
      await options.publishGame?.(parsed.data.id);
      response
        .status(stored.duplicate ? 200 : 201)
        .json(projectState(state, viewer));
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.get('/api/games/:id/view', async (request, response) => {
    try {
      const state = await loadGameState(request.params.id ?? '');
      if (!state) {
        sendError(response, 404, 'Not found');
        return;
      }
      const viewer = options.resolveViewer
        ? await options.resolveViewer(request)
        : { kind: 'visitor' as const };
      response.json(projectState(state, viewer));
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.post('/api/games/:id/commands', async (request, response) => {
    try {
      if (!hasValidCsrf(request)) {
        sendError(response, 403, 'Invalid request');
        return;
      }
      const parsed = commandSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.type === 'CreateGame') {
        sendError(response, 400, 'Invalid request');
        return;
      }
      const viewer = options.resolveViewer
        ? await options.resolveViewer(request)
        : { kind: 'visitor' as const };
      const actor = actorFor(viewer);
      if (!actor) {
        sendError(response, 401, 'Authentication required');
        return;
      }
      const commandLimit = parsed.data.type === 'PostTraitorMessage' ? 30 : 60;
      if (
        !(await checkRateLimit(
          request,
          `command-${parsed.data.type}`,
          actorId(actor),
          commandLimit,
        ))
      ) {
        sendError(response, 429, 'Too many requests');
        return;
      }

      const gameId = request.params.id ?? '';
      const idempotency = {
        gameId,
        actorId: actorId(actor),
        idempotencyKey: parsed.data.idempotencyKey,
        requestHash: requestHash(parsed.data),
      };
      const { appendGameEvents, readGameCommandResult } =
        await import('@workspace/db/game-store');
      const previous = await readGameCommandResult(idempotency);
      if (previous && !previous.ok) {
        sendError(response, 409, 'Command rejected');
        return;
      }

      const state = await loadGameState(gameId);
      if (!state) {
        sendError(response, 404, 'Not found');
        return;
      }
      if (!previous) {
        const result = decide(state, parsed.data, {
          now: Date.now(),
          actor,
          random: gameRandom,
        });
        if (!result.ok) {
          sendError(response, 409, 'Command rejected');
          return;
        }
        if (result.events.length > 0) {
          const nextState = replayFrom(state, result.events);
          const stored = await appendGameEvents({
            ...idempotency,
            expectedVersion: state.version,
            events: result.events,
            ...(nextState.version % 20 === 0
              ? { snapshot: { seq: nextState.version, state: nextState } }
              : {}),
            deadline: {
              kind: nextState.phase,
              dueAt: nextState.deadline,
            },
          });
          if (!stored.ok) {
            sendError(response, 409, 'Command rejected');
            return;
          }
          await options.publishGame?.(gameId);
        }
      }

      const current = await loadGameState(gameId);
      if (!current) {
        sendError(response, 404, 'Not found');
        return;
      }
      response.json(projectState(current, viewer));
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.use(
    (
      _error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      void _next;
      if (!response.headersSent) sendError(response, 400, 'Invalid request');
    },
  );
  app.use((_req, res) => {
    sendError(res, 404, 'Not found');
  });
  return app;
}
