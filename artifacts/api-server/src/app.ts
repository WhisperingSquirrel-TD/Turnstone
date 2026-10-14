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
  gameInviteResponseSchema,
  guestJoinRequestSchema,
  gameViewResponseSchema,
  joinRequestDecisionSchema,
  joinRequestStatusResponseSchema,
  pendingJoinRequestsResponseSchema,
  presenterPairRequestSchema,
  presenterPairResponseSchema,
  presenterPairingResponseSchema,
  seatRecoveryRequestSchema,
  shortCodeJoinRequestSchema,
} from '@workspace/shared';
import {
  decide,
  replay,
  replayFrom,
  viewFor,
  type Actor,
  type Context,
  type State,
  type Viewer,
} from '@workspace/engine';
import { hashSeatPin, verifySeatPin } from '@workspace/security/seat-pin';
import { gameRandom } from '@workspace/security/game-random';
import {
  cookieNameForGame,
  cookieNameForJoinRequest,
  cookieNameForPresenterGame,
} from './session-auth';
import { security } from './middlewares/security';

export type AppOptions = {
  resolveViewer?: (request: Request) => Viewer | Promise<Viewer>;
  /** Test-only deterministic clock; the production server never supplies it. */
  testOnlyNow?: () => number;
  /** Test-only deterministic randomness; production always uses Web Crypto. */
  testOnlyRandom?: Context['random'];
  publishGame?: (gameId: string) => Promise<void>;
  allowedOrigins?: readonly string[];
  maxActiveGames?: number;
  countActiveGames?: () => Promise<number>;
  secureCookies?: boolean;
  rateLimitSecret?: string;
  publicBaseUrl?: string;
  consumeRateLimit?: (
    bucketHash: string,
    limit: number,
    windowMs: number,
  ) => Promise<boolean>;
};

const csrfCookieName = 'turnstone-csrf';
const seatSessionDurationMs = 30 * 24 * 60 * 60 * 1_000;
const joinRequestCookieDurationMs = 30 * 24 * 60 * 60 * 1_000;
const joinCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function createJoinCode(): string {
  return Array.from(randomBytes(6), (byte) => joinCodeAlphabet[byte & 31]).join(
    '',
  );
}

function hashJoinCode(code: string, secret: string): string {
  return createHmac('sha256', secret).update(code.toUpperCase()).digest('hex');
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

function csrfCookie(request: Request): string | null {
  return namedCookie(request, csrfCookieName);
}

function namedCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
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
        now: options.testOnlyNow?.() ?? Date.now(),
        actor,
        random: options.testOnlyRandom ?? gameRandom,
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
  app.post('/api/games/:id/invites', async (request, response) => {
    try {
      if (!hasValidCsrf(request)) {
        sendError(response, 403, 'Invalid request');
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
      if (
        !(await checkRateLimit(request, 'create-invite', actorId(actor), 10))
      ) {
        sendError(response, 429, 'Too many requests');
        return;
      }
      const gameId = request.params.id ?? '';
      const state = await loadGameState(gameId);
      if (!state) {
        sendError(response, 404, 'Not found');
        return;
      }
      if (state.phase !== 'DRAFT' && state.phase !== 'LOBBY') {
        sendError(response, 409, 'Command rejected');
        return;
      }
      if (!options.rateLimitSecret || !options.publicBaseUrl) {
        sendError(response, 503, 'Service unavailable');
        return;
      }
      const { createGameInvite } =
        await import('@workspace/db/seat-access-store');
      const inviteToken = randomBytes(32).toString('base64url');
      const linkTokenHash = createHash('sha256')
        .update(inviteToken)
        .digest('hex');
      const now = Date.now();
      let shortCode: string | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = createJoinCode();
        try {
          await createGameInvite({
            gameId,
            linkTokenHash,
            shortCodeHash: hashJoinCode(candidate, options.rateLimitSecret),
            expiresAt: now + seatSessionDurationMs,
          });
          shortCode = candidate;
          break;
        } catch (error) {
          if (!isUniqueViolation(error) || attempt === 4) throw error;
        }
      }
      if (!shortCode) {
        sendError(response, 503, 'Service unavailable');
        return;
      }
      const joinUrl = new URL(
        `/join/${encodeURIComponent(gameId)}#${inviteToken}`,
        options.publicBaseUrl,
      ).toString();
      response
        .status(201)
        .json(gameInviteResponseSchema.parse({ gameId, joinUrl, shortCode }));
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.post('/api/join', async (request, response) => {
    try {
      if (!hasValidCsrf(request)) {
        sendError(response, 403, 'Invalid request');
        return;
      }
      const parsed = shortCodeJoinRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, 'Invalid request');
        return;
      }
      const secret = options.rateLimitSecret;
      if (!secret) {
        sendError(response, 503, 'Service unavailable');
        return;
      }
      const shortCodeHash = hashJoinCode(parsed.data.shortCode, secret);
      if (
        !(await checkRateLimit(request, 'short-code-join', shortCodeHash, 5))
      ) {
        sendError(response, 429, 'Too many requests');
        return;
      }
      const now = Date.now();
      const {
        createGameJoinRequest,
        createSeatAccess,
        findActiveGameInvite,
        findGameJoinRequestById,
        getSeatAccess,
      } = await import('@workspace/db/seat-access-store');
      const invite = await findActiveGameInvite({ shortCodeHash }, now);
      if (!invite) {
        sendError(response, 404, 'Not found');
        return;
      }
      const state = await loadGameState(invite.gameId);
      if (!state || (state.phase !== 'DRAFT' && state.phase !== 'LOBBY')) {
        sendError(response, 404, 'Not found');
        return;
      }
      const idempotencyKey = parsed.data.idempotencyKey;
      const requestId = createHmac('sha256', secret)
        .update(
          `turnstone-request-id\u0000${invite.gameId}\u0000${idempotencyKey}`,
        )
        .digest('hex')
        .slice(0, 32);
      const seatId = createHmac('sha256', secret)
        .update(
          `turnstone-request-seat\u0000${invite.gameId}\u0000${idempotencyKey}`,
        )
        .digest('hex')
        .slice(0, 32);
      const requestToken = createHmac('sha256', secret)
        .update(
          `turnstone-request-token\u0000${invite.gameId}\u0000${idempotencyKey}`,
        )
        .digest('base64url');
      let access = await getSeatAccess(invite.gameId, seatId);
      if (!access) {
        const hashedPin = await hashSeatPin(parsed.data.pin);
        await createSeatAccess({
          gameId: invite.gameId,
          seatId,
          pinSalt: hashedPin.salt,
          pinHash: hashedPin.hash,
        });
        access = await getSeatAccess(invite.gameId, seatId);
      }
      if (
        !access ||
        !(await verifySeatPin(parsed.data.pin, access.pinSalt, access.pinHash))
      ) {
        sendError(response, 409, 'Join could not be completed');
        return;
      }
      await createGameJoinRequest({
        id: requestId,
        gameId: invite.gameId,
        seatId,
        requestTokenHash: createHash('sha256')
          .update(requestToken)
          .digest('hex'),
        name: parsed.data.name,
        expiresAt: now + joinRequestCookieDurationMs,
      });
      const joinRequest = await findGameJoinRequestById(
        invite.gameId,
        requestId,
      );
      if (
        !joinRequest ||
        joinRequest.name !== parsed.data.name ||
        joinRequest.expiresAt <= now ||
        joinRequest.status === 'rejected' ||
        joinRequest.status === 'expired'
      ) {
        sendError(response, 409, 'Join could not be completed');
        return;
      }
      response.cookie(cookieNameForJoinRequest(requestId), requestToken, {
        httpOnly: true,
        secure: options.secureCookies ?? false,
        sameSite: 'lax',
        path: `/api/join-requests/${requestId}`,
        maxAge: joinRequestCookieDurationMs,
      });
      response.status(202).json({ requestId, status: 'pending' });
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.get('/api/games/:id/join-requests', async (request, response) => {
    try {
      const viewer = options.resolveViewer
        ? await options.resolveViewer(request)
        : { kind: 'visitor' as const };
      const actor = actorFor(viewer);
      if (actor?.kind !== 'coordinator') {
        sendError(response, 401, 'Authentication required');
        return;
      }
      const gameId = request.params.id ?? '';
      if (
        !(await checkRateLimit(request, 'list-join-requests', actorId(actor)))
      ) {
        sendError(response, 429, 'Too many requests');
        return;
      }
      if (!(await loadGameState(gameId))) {
        sendError(response, 404, 'Not found');
        return;
      }
      const { listPendingGameJoinRequests } =
        await import('@workspace/db/seat-access-store');
      const requests = await listPendingGameJoinRequests(gameId);
      response.json(pendingJoinRequestsResponseSchema.parse({ requests }));
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.post(
    '/api/games/:id/join-requests/:requestId/decision',
    async (request, response) => {
      try {
        if (!hasValidCsrf(request)) {
          sendError(response, 403, 'Invalid request');
          return;
        }
        const parsed = joinRequestDecisionSchema.safeParse(request.body);
        if (!parsed.success) {
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
        const secret = options.rateLimitSecret;
        if (!secret) {
          sendError(response, 503, 'Service unavailable');
          return;
        }
        const gameId = request.params.id ?? '';
        const requestId = request.params.requestId ?? '';
        if (
          !(await checkRateLimit(
            request,
            'resolve-join-request',
            actorId(actor),
          ))
        ) {
          sendError(response, 429, 'Too many requests');
          return;
        }
        const state = await loadGameState(gameId);
        if (!state || state.version !== parsed.data.expectedVersion) {
          sendError(response, 409, 'Command rejected');
          return;
        }
        const { findGameJoinRequestById, resolveGameJoinRequest } =
          await import('@workspace/db/seat-access-store');
        const joinRequest = await findGameJoinRequestById(gameId, requestId);
        const now = Date.now();
        if (
          !joinRequest ||
          joinRequest.status !== 'pending' ||
          joinRequest.expiresAt <= now
        ) {
          sendError(response, 404, 'Not found');
          return;
        }
        if (parsed.data.decision === 'reject') {
          const resolved = await resolveGameJoinRequest(
            gameId,
            requestId,
            'rejected',
            now,
          );
          if (!resolved) {
            sendError(response, 409, 'Command rejected');
            return;
          }
          response.json({ status: 'rejected', seatId: joinRequest.seatId });
          return;
        }
        const joinCommand = commandSchema.parse({
          type: 'JoinGame',
          idempotencyKey: `short-code-approval:${requestId}`,
          seatId: joinRequest.seatId,
          name: joinRequest.name,
        });
        const idempotency = {
          gameId,
          actorId: actorId(actor),
          idempotencyKey: joinCommand.idempotencyKey,
          requestHash: requestHash(joinCommand),
        };
        const { appendGameEvents, readGameCommandResult } =
          await import('@workspace/db/game-store');
        const previous = await readGameCommandResult(idempotency);
        if (previous && !previous.ok) {
          sendError(response, 409, 'Command rejected');
          return;
        }
        if (!previous) {
          const result = decide(state, joinCommand, {
            now,
            actor: { kind: 'player', seatId: joinRequest.seatId },
            random: gameRandom,
          });
          if (!result.ok) {
            sendError(response, 409, 'Command rejected');
            return;
          }
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
        const resolved = await resolveGameJoinRequest(
          gameId,
          requestId,
          'approved',
          now,
        );
        if (!resolved) {
          sendError(response, 409, 'Command rejected');
          return;
        }
        response.json({ status: 'approved', seatId: joinRequest.seatId });
      } catch {
        sendError(response, 503, 'Service unavailable');
      }
    },
  );
  app.get('/api/join-requests/:requestId', async (request, response) => {
    try {
      if (!options.rateLimitSecret) {
        sendError(response, 503, 'Service unavailable');
        return;
      }
      const requestId = request.params.requestId ?? '';
      if (
        !/^[a-f0-9]{32}$/.test(requestId) ||
        !(await checkRateLimit(request, 'join-request-status', requestId, 30))
      ) {
        sendError(response, 404, 'Not found');
        return;
      }
      const requestToken = namedCookie(
        request,
        cookieNameForJoinRequest(requestId),
      );
      if (!requestToken || !/^[A-Za-z0-9_-]{43}$/.test(requestToken)) {
        sendError(response, 404, 'Not found');
        return;
      }
      const { createViewerSession, findGameJoinRequestByToken } =
        await import('@workspace/db/seat-access-store');
      const now = Date.now();
      const joinRequest = await findGameJoinRequestByToken(
        createHash('sha256').update(requestToken).digest('hex'),
        now,
      );
      if (!joinRequest || joinRequest.id !== requestId) {
        sendError(response, 404, 'Not found');
        return;
      }
      if (joinRequest.status === 'pending') {
        response.json(
          joinRequestStatusResponseSchema.parse({ status: 'pending' }),
        );
        return;
      }
      if (
        joinRequest.status === 'rejected' ||
        joinRequest.status === 'expired'
      ) {
        response.clearCookie(cookieNameForJoinRequest(requestId), {
          httpOnly: true,
          secure: options.secureCookies ?? false,
          sameSite: 'lax',
          path: `/api/join-requests/${requestId}`,
        });
        response.json(
          joinRequestStatusResponseSchema.parse({ status: 'rejected' }),
        );
        return;
      }
      const state = await loadGameState(joinRequest.gameId);
      if (!state?.seats.some((seat) => seat.id === joinRequest.seatId)) {
        sendError(response, 503, 'Service unavailable');
        return;
      }
      const sessionToken = randomBytes(32).toString('base64url');
      await createViewerSession({
        tokenHash: createHash('sha256').update(sessionToken).digest('hex'),
        gameId: joinRequest.gameId,
        seatId: joinRequest.seatId,
        expiresAt: now + seatSessionDurationMs,
      });
      response.cookie(cookieNameForGame(joinRequest.gameId), sessionToken, {
        httpOnly: true,
        secure: options.secureCookies ?? false,
        sameSite: 'lax',
        path: '/',
        maxAge: seatSessionDurationMs,
      });
      response.clearCookie(cookieNameForJoinRequest(requestId), {
        httpOnly: true,
        secure: options.secureCookies ?? false,
        sameSite: 'lax',
        path: `/api/join-requests/${requestId}`,
      });
      const game = projectState(state, {
        kind: 'player',
        seatId: joinRequest.seatId,
      });
      const status = joinRequestStatusResponseSchema.parse({
        status: 'approved',
        game,
      });
      response.json(status);
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.post('/api/recover', async (request, response) => {
    try {
      if (!hasValidCsrf(request)) {
        sendError(response, 403, 'Invalid request');
        return;
      }
      const parsed = seatRecoveryRequestSchema.safeParse(request.body);
      const secret = options.rateLimitSecret;
      if (!parsed.success || !secret) {
        sendError(response, 400, 'Invalid request');
        return;
      }
      const codeHash = hashJoinCode(parsed.data.shortCode, secret);
      if (!(await checkRateLimit(request, 'seat-recovery', codeHash, 10))) {
        sendError(response, 429, 'Recovery could not be completed');
        return;
      }
      const now = Date.now();
      const {
        clearSeatPinFailures,
        findActiveGameInvite,
        getSeatAccess,
        recordSeatPinFailure,
        replaceSeatViewerSession,
      } = await import('@workspace/db/seat-access-store');
      const invite = await findActiveGameInvite(
        { shortCodeHash: codeHash },
        now,
      );
      if (!invite) {
        sendError(response, 401, 'Recovery could not be completed');
        return;
      }
      const state = await loadGameState(invite.gameId);
      if (!state) {
        sendError(response, 401, 'Recovery could not be completed');
        return;
      }
      const normalizedName = parsed.data.name.trim().toLowerCase();
      const matches = state.seats.filter(
        (seat) => seat.name.trim().toLowerCase() === normalizedName,
      );
      if (matches.length !== 1) {
        sendError(response, 401, 'Recovery could not be completed');
        return;
      }
      const seat = matches[0];
      const access = await getSeatAccess(invite.gameId, seat.id);
      if (!access) {
        sendError(response, 401, 'Recovery could not be completed');
        return;
      }
      if (access.lockedUntil !== null && access.lockedUntil > now) {
        sendError(response, 429, 'Recovery could not be completed');
        return;
      }
      if (
        !(await verifySeatPin(parsed.data.pin, access.pinSalt, access.pinHash))
      ) {
        const failure = await recordSeatPinFailure(invite.gameId, seat.id, now);
        sendError(
          response,
          failure?.lockedUntil !== null && failure?.lockedUntil !== undefined
            ? 429
            : 401,
          'Recovery could not be completed',
        );
        return;
      }
      await clearSeatPinFailures(invite.gameId, seat.id);
      const sessionToken = randomBytes(32).toString('base64url');
      await replaceSeatViewerSession({
        tokenHash: createHash('sha256').update(sessionToken).digest('hex'),
        gameId: invite.gameId,
        seatId: seat.id,
        expiresAt: now + seatSessionDurationMs,
        revokedAt: now,
      });
      response.cookie(cookieNameForGame(invite.gameId), sessionToken, {
        httpOnly: true,
        secure: options.secureCookies ?? false,
        sameSite: 'lax',
        path: '/',
        maxAge: seatSessionDurationMs,
      });
      await options.publishGame?.(invite.gameId);
      response.json(projectState(state, { kind: 'player', seatId: seat.id }));
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.post('/api/games/:id/join', async (request, response) => {
    try {
      if (!hasValidCsrf(request)) {
        sendError(response, 403, 'Invalid request');
        return;
      }
      const parsed = guestJoinRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, 'Invalid request');
        return;
      }
      if (!options.rateLimitSecret) {
        sendError(response, 503, 'Service unavailable');
        return;
      }
      const gameId = request.params.id ?? '';
      if (!(await checkRateLimit(request, 'guest-join', gameId, 10))) {
        sendError(response, 429, 'Too many requests');
        return;
      }
      const now = Date.now();
      const {
        createSeatAccess,
        createViewerSession,
        deleteSeatAccess,
        findActiveGameInvite,
        getSeatAccess,
      } = await import('@workspace/db/seat-access-store');
      const inviteTokenHash = createHash('sha256')
        .update(parsed.data.inviteToken)
        .digest('hex');
      const invite = await findActiveGameInvite(
        { gameId, linkTokenHash: inviteTokenHash },
        now,
      );
      if (!invite) {
        sendError(response, 404, 'Not found');
        return;
      }
      const state = await loadGameState(gameId);
      if (!state) {
        sendError(response, 404, 'Not found');
        return;
      }
      const seatId = createHmac('sha256', options.rateLimitSecret)
        .update(
          `turnstone-seat\u0000${gameId}\u0000${parsed.data.idempotencyKey}`,
        )
        .digest('hex')
        .slice(0, 32);
      const joinCommand = commandSchema.parse({
        type: 'JoinGame',
        idempotencyKey: parsed.data.idempotencyKey,
        seatId,
        name: parsed.data.name,
      });
      const idempotency = {
        gameId,
        actorId: `seat:${seatId}`,
        idempotencyKey: joinCommand.idempotencyKey,
        requestHash: requestHash(joinCommand),
      };
      const { appendGameEvents, readGameCommandResult } =
        await import('@workspace/db/game-store');
      const previous = await readGameCommandResult(idempotency);
      if (previous && !previous.ok) {
        sendError(response, 409, 'Command rejected');
        return;
      }

      let access = await getSeatAccess(gameId, seatId);
      let createdAccess = false;
      if (!access) {
        const hashedPin = await hashSeatPin(parsed.data.pin);
        createdAccess = await createSeatAccess({
          gameId,
          seatId,
          pinSalt: hashedPin.salt,
          pinHash: hashedPin.hash,
        });
        access = await getSeatAccess(gameId, seatId);
      }
      if (
        !access ||
        !(await verifySeatPin(parsed.data.pin, access.pinSalt, access.pinHash))
      ) {
        if (createdAccess) await deleteSeatAccess(gameId, seatId);
        sendError(response, 401, 'Join could not be completed');
        return;
      }

      if (!previous) {
        const result = decide(state, joinCommand, {
          now,
          actor: { kind: 'player', seatId },
          random: gameRandom,
        });
        if (!result.ok) {
          if (createdAccess) await deleteSeatAccess(gameId, seatId);
          sendError(response, 409, 'Command rejected');
          return;
        }
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
          if (createdAccess) await deleteSeatAccess(gameId, seatId);
          sendError(response, 409, 'Command rejected');
          return;
        }
        await options.publishGame?.(gameId);
      }

      const current = await loadGameState(gameId);
      if (!current?.seats.some((seat) => seat.id === seatId)) {
        if (createdAccess) await deleteSeatAccess(gameId, seatId);
        sendError(response, 409, 'Command rejected');
        return;
      }
      const sessionToken = randomBytes(32).toString('base64url');
      await createViewerSession({
        tokenHash: createHash('sha256').update(sessionToken).digest('hex'),
        gameId,
        seatId,
        expiresAt: now + seatSessionDurationMs,
      });
      response.cookie(cookieNameForGame(gameId), sessionToken, {
        httpOnly: true,
        secure: options.secureCookies ?? false,
        sameSite: 'lax',
        path: '/',
        maxAge: seatSessionDurationMs,
      });
      response
        .status(previous?.duplicate ? 200 : 201)
        .json(projectState(current, { kind: 'player', seatId }));
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
  app.post('/api/games/:id/presenter-pairings', async (request, response) => {
    try {
      if (!hasValidCsrf(request)) {
        sendError(response, 403, 'Invalid request');
        return;
      }
      const viewer = options.resolveViewer
        ? await options.resolveViewer(request)
        : { kind: 'visitor' as const };
      if (viewer.kind !== 'coordinator' && viewer.kind !== 'host') {
        sendError(response, 401, 'Authentication required');
        return;
      }
      const gameId = request.params.id ?? '';
      if (
        !(await checkRateLimit(request, 'presenter-pairing-create', gameId, 5))
      ) {
        sendError(response, 429, 'Too many requests');
        return;
      }
      const state = await loadGameState(gameId);
      if (!state || state.phase === 'ARCHIVED') {
        sendError(response, 404, 'Not found');
        return;
      }
      const now = Date.now();
      const code = randomBytes(32).toString('base64url');
      const expiresAt = now + 5 * 60_000;
      const { createPresenterPairing } =
        await import('@workspace/db/presenter-access-store');
      await createPresenterPairing({
        codeHash: createHash('sha256').update(code).digest('hex'),
        gameId,
        expiresAt,
      });
      response
        .status(201)
        .json(presenterPairingResponseSchema.parse({ code, expiresAt }));
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.post('/api/presenter/pair', async (request, response) => {
    try {
      if (!hasValidCsrf(request)) {
        sendError(response, 403, 'Invalid request');
        return;
      }
      const parsed = presenterPairRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, 'Invalid request');
        return;
      }
      if (
        !(await checkRateLimit(
          request,
          'presenter-pair',
          parsed.data.gameId,
          10,
        ))
      ) {
        sendError(response, 429, 'Pairing could not be completed');
        return;
      }
      const state = await loadGameState(parsed.data.gameId);
      if (!state || state.phase === 'ARCHIVED') {
        sendError(response, 401, 'Pairing could not be completed');
        return;
      }
      const now = Date.now();
      const token = randomBytes(32).toString('base64url');
      const sessionDurationMs = 30 * 24 * 60 * 60 * 1_000;
      const { claimPresenterPairing } =
        await import('@workspace/db/presenter-access-store');
      const claimed = await claimPresenterPairing({
        codeHash: createHash('sha256').update(parsed.data.code).digest('hex'),
        gameId: parsed.data.gameId,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        sessionExpiresAt: now + sessionDurationMs,
        now,
      });
      if (!claimed) {
        sendError(response, 401, 'Pairing could not be completed');
        return;
      }
      response.cookie(cookieNameForPresenterGame(parsed.data.gameId), token, {
        httpOnly: true,
        secure: options.secureCookies ?? false,
        sameSite: 'lax',
        path: '/',
        maxAge: sessionDurationMs,
      });
      response.json(
        presenterPairResponseSchema.parse({
          game: projectState(state, { kind: 'presenter' }),
        }),
      );
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
          now: options.testOnlyNow?.() ?? Date.now(),
          actor,
          random: options.testOnlyRandom ?? gameRandom,
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
