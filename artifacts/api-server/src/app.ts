import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
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
  coordinatorHandoffClaimRequestSchema,
  coordinatorHandoffClaimResponseSchema,
  coordinatorHandoffCreateRequestSchema,
  coordinatorHandoffResponseSchema,
  csrfTokenResponseSchema,
  eventSchema,
  entryFailureMessages,
  gameInviteResponseSchema,
  lateGameInviteRequestSchema,
  lateGameInviteResponseSchema,
  joinRequestCreatedResponseSchema,
  gameConfigSchema,
  guestJoinRequestSchema,
  gameViewResponseSchema,
  isReservedPracticeName,
  joinNameCheckRequestSchema,
  joinNameCheckResponseSchema,
  joinRequestDecisionSchema,
  joinRequestStatusResponseSchema,
  pendingJoinRequestsResponseSchema,
  privateViewRequestSchema,
  presenterPairRequestSchema,
  presenterPairResponseSchema,
  presenterPairingResponseSchema,
  recommended,
  rehearsalStartRequestSchema,
  seatPinResetRequestSchema,
  seatRecoveryRequestSchema,
  normalizeSeatName,
  shortCodeJoinRequestSchema,
} from '@workspace/shared';
import {
  decide,
  isCoordinatorCommand,
  joiningWindowOpen,
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
  cookieNameForCoordinatorGame,
  cookieNameForGame,
  cookieNameForJoinRequest,
  cookieNameForPresenterGame,
} from './session-auth';
import { security } from './middlewares/security';

export type AppOptions = {
  resolveViewer?: (request: Request) => Viewer | Promise<Viewer>;
  resolveCoordinatorViewer?: (request: Request) => Viewer | Promise<Viewer>;
  /** Test-only deterministic clock; the production server never supplies it. */
  testOnlyNow?: () => number;
  /** Test-only deterministic randomness; production always uses Web Crypto. */
  testOnlyRandom?: Context['random'];
  publishGame?: (gameId: string) => Promise<void>;
  processRehearsalGame?: (gameId: string) => Promise<void>;
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
const coordinatorHandoffDurationMs = 5 * 60 * 1_000;
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

async function projectState(state: State, viewer: Viewer) {
  const serverNow = Date.now();
  const maySeeLobbyCode =
    state.phase === 'LOBBY' &&
    (viewer.kind === 'presenter' ||
      (viewer.kind === 'player' && Boolean(viewer.seatId)));
  const lobbyCode = maySeeLobbyCode
    ? await import('@workspace/db/seat-access-store').then(
        ({ getOpenGameInviteCode }) =>
          getOpenGameInviteCode(state.id, Date.now()),
      )
    : null;
  const view =
    viewer.kind === 'visitor'
      ? viewFor({ kind: 'visitor' }, state)
      : viewFor(viewer, state, { lobbyCode });
  return gameViewResponseSchema.parse({
    serverNow,
    version: state.version,
    view,
  });
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
  async function publishGame(gameId: string): Promise<void> {
    await options.publishGame?.(gameId);
    await options.processRehearsalGame?.(gameId);
  }
  async function appendInternalCommand(
    state: State,
    rawCommand: unknown,
    actor: Actor,
  ): Promise<State> {
    const parsed = commandSchema.safeParse(rawCommand);
    if (!parsed.success || parsed.data.type === 'CreateGame')
      throw new Error('Invalid internal command');
    const now = options.testOnlyNow?.() ?? Date.now();
    const result = decide(state, parsed.data, {
      now,
      actor,
      random: options.testOnlyRandom ?? gameRandom,
    });
    if (!result.ok || result.events.length === 0)
      throw new Error('Internal game command was rejected');
    const nextState = replayFrom(state, result.events);
    const { appendGameEvents } = await import('@workspace/db/game-store');
    const stored = await appendGameEvents({
      gameId: state.id,
      actorId: actorId(actor),
      idempotencyKey: parsed.data.idempotencyKey,
      requestHash: requestHash(parsed.data),
      expectedVersion: state.version,
      events: result.events,
      ...(nextState.version % 20 === 0
        ? { snapshot: { seq: nextState.version, state: nextState } }
        : {}),
      deadline: {
        kind: nextState.phase,
        dueAt:
          nextState.phase === 'SHADOW'
            ? nextState.shadowEndAt
            : nextState.deadline,
      },
    });
    if (!stored.ok) throw new Error('Unable to store internal game command');
    return nextState;
  }
  async function appendServerEvent(
    state: State,
    event: ReturnType<typeof eventSchema.parse>,
    actor: string,
    sideEffects?: {
      seatPinUpdate?: {
        seatId: string;
        pinSalt: string;
        pinHash: string;
      };
      seatSessionReplacement?: {
        seatId: string;
        tokenHash: string;
        expiresAt: number;
        revokedAt: number;
      };
    },
  ): Promise<State | null> {
    const nextState = replayFrom(state, [event]);
    const { appendGameEvents } = await import('@workspace/db/game-store');
    const result = await appendGameEvents({
      gameId: state.id,
      actorId: actor,
      idempotencyKey: randomUUID(),
      requestHash: requestHash(event),
      expectedVersion: state.version,
      events: [event],
      snapshot: { seq: nextState.version, state: nextState },
      deadline: {
        kind: state.phase,
        dueAt: state.phase === 'SHADOW' ? state.shadowEndAt : state.deadline,
      },
      ...sideEffects,
    });
    if (!result.ok) {
      if (result.code === 'VERSION_CONFLICT') return null;
      throw new Error('Unable to append game event');
    }
    await publishGame(state.id);
    return nextState;
  }
  async function viewerForRequest(request: Request): Promise<Viewer> {
    return options.resolveViewer
      ? options.resolveViewer(request)
      : { kind: 'visitor' };
  }
  async function coordinatorViewerForRequest(
    request: Request,
  ): Promise<Viewer> {
    return options.resolveCoordinatorViewer
      ? options.resolveCoordinatorViewer(request)
      : viewerForRequest(request);
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
      if (
        !parsed.success ||
        parsed.data.type !== 'CreateGame' ||
        parsed.data.config.rehearsal.enabled
      ) {
        sendError(response, 400, 'Invalid request');
        return;
      }
      const viewer = await coordinatorViewerForRequest(request);
      const actor: Actor = { kind: 'coordinator' };
      if (!(await checkRateLimit(request, 'create-game', undefined, 5))) {
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
      const now = options.testOnlyNow?.() ?? Date.now();
      const coordinatorToken = randomBytes(32).toString('base64url');
      const coordinatorExpiresAt = now + seatSessionDurationMs;
      const result = decide(null, parsed.data, {
        now,
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
        coordinatorCapability: {
          tokenHash: createHash('sha256')
            .update(coordinatorToken)
            .digest('hex'),
          expiresAt: new Date(coordinatorExpiresAt),
        },
        deadline: {
          kind: initialState.phase,
          dueAt: initialState.deadline,
        },
      });
      if (!stored.ok) {
        sendError(response, 409, 'Command rejected');
        return;
      }
      if (stored.duplicate && actorFor(viewer)?.kind !== 'coordinator') {
        sendError(response, 409, 'Command rejected');
        return;
      }
      const state = await loadGameState(parsed.data.id);
      if (!state) {
        sendError(response, 404, 'Not found');
        return;
      }
      await publishGame(parsed.data.id);
      if (!stored.duplicate)
        response.cookie(
          cookieNameForCoordinatorGame(parsed.data.id),
          coordinatorToken,
          {
            httpOnly: true,
            secure: options.secureCookies ?? false,
            sameSite: 'lax',
            path: '/',
            maxAge: seatSessionDurationMs,
          },
        );
      response
        .status(stored.duplicate ? 200 : 201)
        .json(
          await projectState(
            state,
            stored.duplicate ? viewer : { kind: 'coordinator' },
          ),
        );
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.post('/api/rehearsals', async (request, response) => {
    try {
      if (!hasValidCsrf(request)) {
        sendError(response, 403, 'Invalid request');
        return;
      }
      const parsed = rehearsalStartRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, 'Invalid request');
        return;
      }
      if (!(await checkRateLimit(request, 'start-rehearsal', undefined, 3))) {
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

      const { gameId, idempotencyKey, name, playerCount, speed } = parsed.data;
      const idSecret = options.rateLimitSecret ?? 'turnstone-rehearsal-local';
      const deterministicSeatId = (label: string) =>
        createHmac('sha256', idSecret)
          .update(`turnstone-rehearsal\u0000${gameId}\u0000${label}`)
          .digest('hex')
          .slice(0, 32);
      const humanSeatId = deterministicSeatId('human');
      const existing = await loadGameState(gameId);
      if (existing) {
        const human = existing.seats.find(
          (seat) => seat.id === humanSeatId && seat.name === name,
        );
        const viewer = await viewerForRequest(request);
        if (
          !existing.config.rehearsal.enabled ||
          !human ||
          viewer.kind !== 'player' ||
          viewer.seatId !== humanSeatId
        ) {
          sendError(response, 401, 'Rehearsal could not be resumed');
          return;
        }
        const { createViewerSession } =
          await import('@workspace/db/seat-access-store');
        const token = randomBytes(32).toString('base64url');
        const now = options.testOnlyNow?.() ?? Date.now();
        await createViewerSession({
          tokenHash: createHash('sha256').update(token).digest('hex'),
          gameId,
          seatId: humanSeatId,
          expiresAt: now + seatSessionDurationMs,
        });
        response.cookie(cookieNameForGame(gameId), token, {
          httpOnly: true,
          secure: options.secureCookies ?? false,
          sameSite: 'lax',
          path: '/',
          maxAge: seatSessionDurationMs,
        });
        response.status(200).json(
          await projectState(existing, {
            kind: 'player',
            seatId: humanSeatId,
          }),
        );
        return;
      }

      const botSeatIds = Array.from({ length: playerCount - 1 }, (_, index) =>
        deterministicSeatId(`bot-${index + 1}`),
      );
      const gameRecommendation = recommended(playerCount);
      const config = gameConfigSchema.parse({
        basics: { coordinatorPlays: true, coCoordinators: 0 },
        players: {
          count: playerCount,
          pairedSeats: false,
          sharedDevices: false,
          lateJoining: 'never',
        },
        traitors: {
          number: gameRecommendation.traitors,
          sleeper: false,
          recruitment: 'off',
          murders: 2,
        },
        roundTable: {
          debateMinutes: speed === 'fast' ? 2 : 15,
          voteMinutes: speed === 'fast' ? 1 : 3,
          tieRule: 'revote-random',
          revealStyle: 'one-by-one',
          revealRole: 'always',
        },
        missions: { enabled: false, shields: 'off' },
        endgame: {
          trigger: 'alive',
          size: gameRecommendation.finalSize,
          parity: true,
        },
        schedule: {
          format: 'quick',
          advancement: 'scheduled',
          plannedCycles: speed === 'fast' ? 1 : 3,
        },
        privacy: { holdMs: 500, shieldSeconds: 3 },
        tasks: { enabled: false },
        rehearsal: { enabled: true, botSeatIds, speed },
      });
      const createCommand = commandSchema.parse({
        type: 'CreateGame',
        id: gameId,
        idempotencyKey,
        config,
      });
      const now = options.testOnlyNow?.() ?? Date.now();
      const creation = decide(null, createCommand, {
        now,
        actor: { kind: 'coordinator' },
        random: options.testOnlyRandom ?? gameRandom,
      });
      if (!creation.ok || creation.events.length !== 1) {
        sendError(response, 409, 'Rehearsal could not be started');
        return;
      }
      const initialState = replay(creation.events);
      const { createGameWithEvent } = await import('@workspace/db/game-store');
      const stored = await createGameWithEvent({
        event: creation.events[0]!,
        actorId: 'coordinator',
        idempotencyKey,
        requestHash: requestHash(createCommand),
        snapshot: { seq: initialState.version, state: initialState },
        deadline: { kind: initialState.phase, dueAt: initialState.deadline },
      });
      if (!stored.ok) {
        sendError(response, 409, 'Rehearsal could not be started');
        return;
      }

      let state = await appendInternalCommand(
        initialState,
        {
          type: 'AdvancePhase',
          expectedVersion: initialState.version,
          idempotencyKey: `${idempotencyKey}:lobby`,
        },
        { kind: 'coordinator' },
      );
      const names = new Set([name.toLocaleLowerCase('en-GB')]);
      const seats = [
        { id: humanSeatId, name },
        ...botSeatIds.map((id, index) => {
          let botName = `Practice player ${index + 1}`;
          while (names.has(botName.toLocaleLowerCase('en-GB')))
            botName = `Practice ${index + 1} player`;
          names.add(botName.toLocaleLowerCase('en-GB'));
          return { id, name: botName };
        }),
      ];
      for (const seat of seats) {
        state = await appendInternalCommand(
          state,
          {
            type: 'JoinGame',
            seatId: seat.id,
            name: seat.name,
            idempotencyKey: `${idempotencyKey}:join:${seat.id}`,
          },
          { kind: 'player', seatId: seat.id },
        );
      }
      state = await appendInternalCommand(
        state,
        {
          type: 'StartGame',
          expectedVersion: state.version,
          idempotencyKey: `${idempotencyKey}:start`,
        },
        { kind: 'coordinator' },
      );

      const { createSeatAccess, createViewerSession } =
        await import('@workspace/db/seat-access-store');
      const internalPin = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const internalPinHash = await hashSeatPin(internalPin);
      const accessCreated = await createSeatAccess({
        gameId,
        seatId: humanSeatId,
        pinSalt: internalPinHash.salt,
        pinHash: internalPinHash.hash,
      });
      if (!accessCreated) {
        sendError(response, 409, 'Rehearsal could not be started');
        return;
      }
      const token = randomBytes(32).toString('base64url');
      await createViewerSession({
        tokenHash: createHash('sha256').update(token).digest('hex'),
        gameId,
        seatId: humanSeatId,
        expiresAt: now + seatSessionDurationMs,
      });
      response.cookie(cookieNameForGame(gameId), token, {
        httpOnly: true,
        secure: options.secureCookies ?? false,
        sameSite: 'lax',
        path: '/',
        maxAge: seatSessionDurationMs,
      });
      await publishGame(gameId);
      const currentState = await loadGameState(gameId);
      response.status(201).json(
        await projectState(currentState ?? state, {
          kind: 'player',
          seatId: humanSeatId,
        }),
      );
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
      const viewer = await coordinatorViewerForRequest(request);
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
            displayCode: candidate,
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
  app.post('/api/games/:id/late-invites', async (request, response) => {
    try {
      if (!hasValidCsrf(request)) {
        sendError(response, 403, 'Invalid request');
        return;
      }
      const actor = actorFor(await coordinatorViewerForRequest(request));
      if (actor?.kind !== 'coordinator') {
        sendError(response, 401, 'Authentication required');
        return;
      }
      if (!lateGameInviteRequestSchema.safeParse(request.body ?? {}).success) {
        sendError(response, 400, 'Invalid request');
        return;
      }
      if (
        !(await checkRateLimit(
          request,
          'create-late-invite',
          actorId(actor),
          10,
        ))
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
      if (
        state.phase === 'LOBBY' ||
        state.paused ||
        !joiningWindowOpen(state) ||
        state.seats.length >= state.config.players.count
      ) {
        sendError(response, 409, 'Command rejected');
        return;
      }
      if (!options.publicBaseUrl) {
        sendError(response, 503, 'Service unavailable');
        return;
      }
      const { createGameInvite } =
        await import('@workspace/db/seat-access-store');
      const token = randomBytes(32).toString('base64url');
      await createGameInvite({
        gameId,
        linkTokenHash: createHash('sha256').update(token).digest('hex'),
        // This random hash has no corresponding human-readable lobby code.
        shortCodeHash: createHash('sha256')
          .update(randomBytes(32))
          .digest('hex'),
        displayCode: null,
        expiresAt: Date.now() + joinRequestCookieDurationMs,
      });
      const joinUrl = new URL(
        `/join/${encodeURIComponent(gameId)}#${token}`,
        options.publicBaseUrl,
      ).toString();
      response
        .status(201)
        .json(lateGameInviteResponseSchema.parse({ gameId, joinUrl }));
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });

  async function queueSeatApproval(
    gameId: string,
    data: { name: string; pin: string; idempotencyKey: string },
    response: Response,
  ): Promise<void> {
    const secret = options.rateLimitSecret;
    if (!secret) {
      sendError(response, 503, entryFailureMessages.serviceUnavailable);
      return;
    }
    const now = Date.now();
    const {
      createGameJoinRequest,
      createSeatAccess,
      findGameJoinRequestById,
      getSeatAccess,
    } = await import('@workspace/db/seat-access-store');
    const requestId = createHmac('sha256', secret)
      .update(`turnstone-request-id\u0000${gameId}\u0000${data.idempotencyKey}`)
      .digest('hex')
      .slice(0, 32);
    const seatId = createHmac('sha256', secret)
      .update(
        `turnstone-request-seat\u0000${gameId}\u0000${data.idempotencyKey}`,
      )
      .digest('hex')
      .slice(0, 32);
    const requestToken = createHmac('sha256', secret)
      .update(
        `turnstone-request-token\u0000${gameId}\u0000${data.idempotencyKey}`,
      )
      .digest('base64url');
    let access = await getSeatAccess(gameId, seatId);
    if (!access) {
      const hashedPin = await hashSeatPin(data.pin);
      await createSeatAccess({
        gameId,
        seatId,
        pinSalt: hashedPin.salt,
        pinHash: hashedPin.hash,
      });
      access = await getSeatAccess(gameId, seatId);
    }
    if (
      !access ||
      !(await verifySeatPin(data.pin, access.pinSalt, access.pinHash))
    ) {
      sendError(response, 401, entryFailureMessages.joinPinMismatch);
      return;
    }
    await createGameJoinRequest({
      id: requestId,
      gameId,
      seatId,
      requestTokenHash: createHash('sha256').update(requestToken).digest('hex'),
      name: data.name,
      expiresAt: now + joinRequestCookieDurationMs,
    });
    const joinRequest = await findGameJoinRequestById(gameId, requestId);
    if (
      !joinRequest ||
      joinRequest.name !== data.name ||
      joinRequest.expiresAt <= now ||
      joinRequest.status === 'rejected' ||
      joinRequest.status === 'expired'
    ) {
      sendError(response, 409, entryFailureMessages.joinRequestNotSaved);
      return;
    }
    response.cookie(cookieNameForJoinRequest(requestId), requestToken, {
      httpOnly: true,
      secure: options.secureCookies ?? false,
      sameSite: 'lax',
      path: `/api/join-requests/${requestId}`,
      maxAge: joinRequestCookieDurationMs,
    });
    await publishGame(gameId);
    response.status(202).json(
      joinRequestCreatedResponseSchema.parse({
        requestId,
        status: 'pending',
      }),
    );
  }

  app.post('/api/join', async (request, response) => {
    try {
      if (!hasValidCsrf(request)) {
        sendError(response, 403, entryFailureMessages.securityCheck);
        return;
      }
      const parsed = shortCodeJoinRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, entryFailureMessages.joinDetailsInvalid);
        return;
      }
      const secret = options.rateLimitSecret;
      if (!secret) {
        sendError(response, 503, entryFailureMessages.serviceUnavailable);
        return;
      }
      const shortCodeHash = hashJoinCode(parsed.data.shortCode, secret);
      if (
        !(await checkRateLimit(request, 'short-code-join', shortCodeHash, 5))
      ) {
        sendError(response, 429, entryFailureMessages.joinRateLimited);
        return;
      }
      const now = Date.now();
      const { findActiveGameInvite } =
        await import('@workspace/db/seat-access-store');
      const invite = await findActiveGameInvite({ shortCodeHash }, now);
      if (!invite) {
        sendError(response, 404, entryFailureMessages.gameCodeUnavailable);
        return;
      }
      const state = await loadGameState(invite.gameId);
      if (!state || (state.phase !== 'DRAFT' && state.phase !== 'LOBBY')) {
        sendError(response, 409, entryFailureMessages.gameNotAcceptingPlayers);
        return;
      }
      await queueSeatApproval(invite.gameId, parsed.data, response);
    } catch {
      sendError(response, 503, entryFailureMessages.serviceUnavailable);
    }
  });
  app.post('/api/join/name-check', async (request, response) => {
    try {
      if (!hasValidCsrf(request)) {
        sendError(response, 403, entryFailureMessages.securityCheck);
        return;
      }
      const parsed = joinNameCheckRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, entryFailureMessages.joinDetailsInvalid);
        return;
      }
      const secret = options.rateLimitSecret;
      if (!secret) {
        sendError(response, 503, entryFailureMessages.serviceUnavailable);
        return;
      }

      const now = Date.now();
      const { findActiveGameInvite } =
        await import('@workspace/db/seat-access-store');
      let gameId: string;
      if ('shortCode' in parsed.data) {
        const shortCodeHash = hashJoinCode(parsed.data.shortCode, secret);
        if (
          !(await checkRateLimit(
            request,
            'short-code-name-check',
            shortCodeHash,
            5,
          ))
        ) {
          sendError(response, 429, entryFailureMessages.joinRateLimited);
          return;
        }
        const invite = await findActiveGameInvite({ shortCodeHash }, now);
        if (!invite) {
          sendError(response, 404, entryFailureMessages.gameCodeUnavailable);
          return;
        }
        gameId = invite.gameId;
      } else {
        gameId = parsed.data.gameId;
        if (!(await checkRateLimit(request, 'guest-name-check', gameId, 10))) {
          sendError(response, 429, entryFailureMessages.joinRateLimited);
          return;
        }
        const inviteTokenHash = createHash('sha256')
          .update(parsed.data.inviteToken)
          .digest('hex');
        const invite = await findActiveGameInvite(
          { gameId, linkTokenHash: inviteTokenHash },
          now,
        );
        if (!invite) {
          sendError(response, 404, entryFailureMessages.gameCodeUnavailable);
          return;
        }
      }

      const state = await loadGameState(gameId);
      if (!state) {
        sendError(response, 404, entryFailureMessages.gameCodeUnavailable);
        return;
      }
      if (state.phase !== 'DRAFT' && state.phase !== 'LOBBY') {
        if (!joiningWindowOpen(state)) {
          sendError(
            response,
            409,
            entryFailureMessages.gameNotAcceptingPlayers,
          );
          return;
        }
        if ('shortCode' in parsed.data) {
          sendError(
            response,
            409,
            entryFailureMessages.gameNotAcceptingPlayers,
          );
          return;
        }
        if (
          !(await checkRateLimit(request, 'late-invite-name-check', gameId, 5))
        ) {
          sendError(response, 429, entryFailureMessages.joinRateLimited);
          return;
        }
      }

      const nameKey = normalizeSeatName(parsed.data.name);
      const status = isReservedPracticeName(parsed.data.name)
        ? 'reserved'
        : state.seats.some((seat) => normalizeSeatName(seat.name) === nameKey)
          ? 'duplicate'
          : 'available';
      response.json(joinNameCheckResponseSchema.parse({ status }));
    } catch {
      sendError(response, 503, entryFailureMessages.nameCheckFailed);
    }
  });
  app.get('/api/games/:id/join-requests', async (request, response) => {
    try {
      const viewer = await coordinatorViewerForRequest(request);
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
        const viewer = await coordinatorViewerForRequest(request);
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
          await publishGame(gameId);
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
        await publishGame(gameId);
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
      const game = await projectState(state, {
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
        sendError(response, 403, entryFailureMessages.securityCheck);
        return;
      }
      const parsed = seatRecoveryRequestSchema.safeParse(request.body);
      const secret = options.rateLimitSecret;
      if (!parsed.success) {
        sendError(response, 400, entryFailureMessages.recoveryFailed);
        return;
      }
      if (!secret) {
        sendError(response, 503, entryFailureMessages.recoveryUnavailable);
        return;
      }
      const recoveryKey =
        'shortCode' in parsed.data
          ? hashJoinCode(parsed.data.shortCode, secret)
          : createHash('sha256').update(parsed.data.inviteToken).digest('hex');
      if (!(await checkRateLimit(request, 'seat-recovery', recoveryKey, 10))) {
        sendError(response, 429, entryFailureMessages.recoveryRateLimited);
        return;
      }
      const now = Date.now();
      const {
        findActiveGameInvite,
        findGameForSeatRecovery,
        getSeatAccess,
        recordSeatPinFailure,
      } = await import('@workspace/db/seat-access-store');
      const invite =
        'shortCode' in parsed.data
          ? await findGameForSeatRecovery(recoveryKey)
          : await findActiveGameInvite(
              {
                gameId: parsed.data.gameId,
                linkTokenHash: recoveryKey,
              },
              now,
            );
      if (!invite) {
        sendError(response, 401, entryFailureMessages.recoveryFailed);
        return;
      }
      const state = await loadGameState(invite.gameId);
      if (!state) {
        sendError(response, 401, entryFailureMessages.recoveryFailed);
        return;
      }
      const normalizedName = normalizeSeatName(parsed.data.name);
      const matches = state.seats.filter(
        (seat) => normalizeSeatName(seat.name) === normalizedName,
      );
      if (matches.length !== 1) {
        sendError(response, 401, entryFailureMessages.recoveryFailed);
        return;
      }
      const seat = matches[0];
      const access = await getSeatAccess(invite.gameId, seat.id);
      if (!access) {
        sendError(response, 401, entryFailureMessages.recoveryFailed);
        return;
      }
      if (access.lockedUntil !== null && access.lockedUntil > now) {
        sendError(response, 429, entryFailureMessages.recoveryRateLimited);
        return;
      }
      if (
        !(await verifySeatPin(parsed.data.pin, access.pinSalt, access.pinHash))
      ) {
        const failure = await recordSeatPinFailure(invite.gameId, seat.id, now);
        if (failure?.failedPinAttempts === 5 && failure.lockedUntil !== null) {
          const latestState = await loadGameState(invite.gameId);
          if (!latestState) throw new Error('Game disappeared during lockout');
          const lockEvent = eventSchema.parse({
            seq: latestState.version + 1,
            at: now,
            schemaVersion: 1,
            type: 'SeatPinLocked',
            seatId: seat.id,
            lockedUntil: failure.lockedUntil,
          });
          const lockedState = await appendServerEvent(
            latestState,
            lockEvent,
            'system:seat-pin-lockout',
          );
          if (!lockedState) throw new Error('Could not record PIN lockout');
        }
        sendError(
          response,
          failure?.lockedUntil !== null && failure?.lockedUntil !== undefined
            ? 429
            : 401,
          failure?.lockedUntil !== null && failure?.lockedUntil !== undefined
            ? entryFailureMessages.recoveryRateLimited
            : entryFailureMessages.recoveryFailed,
        );
        return;
      }
      const sessionToken = randomBytes(32).toString('base64url');
      const recoveredEvent = eventSchema.parse({
        seq: state.version + 1,
        at: now,
        schemaVersion: 1,
        type: 'DeviceRecovered',
        seatId: seat.id,
      });
      const recoveredState = await appendServerEvent(
        state,
        recoveredEvent,
        'system:device-recovery',
        {
          seatSessionReplacement: {
            tokenHash: createHash('sha256').update(sessionToken).digest('hex'),
            seatId: seat.id,
            expiresAt: now + seatSessionDurationMs,
            revokedAt: now,
          },
        },
      );
      if (!recoveredState) {
        sendError(response, 409, entryFailureMessages.recoveryConflict);
        return;
      }
      response.cookie(cookieNameForGame(invite.gameId), sessionToken, {
        httpOnly: true,
        secure: options.secureCookies ?? false,
        sameSite: 'lax',
        path: '/',
        maxAge: seatSessionDurationMs,
      });
      response.json(
        await projectState(recoveredState, {
          kind: 'player',
          seatId: seat.id,
        }),
      );
    } catch {
      sendError(response, 503, entryFailureMessages.recoveryUnavailable);
    }
  });
  app.post('/api/games/:id/join', async (request, response) => {
    try {
      if (!hasValidCsrf(request)) {
        sendError(response, 403, entryFailureMessages.securityCheck);
        return;
      }
      const parsed = guestJoinRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, entryFailureMessages.joinDetailsInvalid);
        return;
      }
      if (!options.rateLimitSecret) {
        sendError(response, 503, entryFailureMessages.serviceUnavailable);
        return;
      }
      const gameId = request.params.id ?? '';
      if (!(await checkRateLimit(request, 'guest-join', gameId, 10))) {
        sendError(response, 429, entryFailureMessages.joinRateLimited);
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
        sendError(response, 404, entryFailureMessages.gameCodeUnavailable);
        return;
      }
      const state = await loadGameState(gameId);
      if (!state) {
        sendError(response, 404, entryFailureMessages.gameCodeUnavailable);
        return;
      }
      if (state.phase !== 'DRAFT' && state.phase !== 'LOBBY') {
        if (!joiningWindowOpen(state)) {
          sendError(
            response,
            409,
            entryFailureMessages.gameNotAcceptingPlayers,
          );
          return;
        }
        if (!(await checkRateLimit(request, 'late-invite-join', gameId, 5))) {
          sendError(response, 429, entryFailureMessages.joinRateLimited);
          return;
        }
        await queueSeatApproval(gameId, parsed.data, response);
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
        sendError(response, 409, entryFailureMessages.joinNotAccepted);
        return;
      }

      if (
        !previous &&
        state.seats.some(
          (seat) =>
            normalizeSeatName(seat.name) ===
            normalizeSeatName(parsed.data.name),
        )
      ) {
        sendError(response, 409, entryFailureMessages.joinNameTaken);
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
        sendError(response, 401, entryFailureMessages.joinPinMismatch);
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
          sendError(response, 409, entryFailureMessages.joinNotAccepted);
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
          sendError(response, 409, entryFailureMessages.joinRequestNotSaved);
          return;
        }
        await publishGame(gameId);
      }

      const current = await loadGameState(gameId);
      if (!current?.seats.some((seat) => seat.id === seatId)) {
        if (createdAccess) await deleteSeatAccess(gameId, seatId);
        sendError(response, 409, entryFailureMessages.joinRequestNotSaved);
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
        .json(await projectState(current, { kind: 'player', seatId }));
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.post('/api/games/:id/coordinator-handoffs', async (request, response) => {
    try {
      if (!hasValidCsrf(request)) {
        sendError(response, 403, 'Invalid request');
        return;
      }
      const parsed = coordinatorHandoffCreateRequestSchema.safeParse(
        request.body,
      );
      if (!parsed.success) {
        sendError(response, 400, 'Invalid request');
        return;
      }
      const viewer = await coordinatorViewerForRequest(request);
      const actor = actorFor(viewer);
      if (actor?.kind !== 'coordinator') {
        sendError(response, 401, 'Authentication required');
        return;
      }
      const gameId = request.params.id ?? '';
      if (
        !(await checkRateLimit(
          request,
          'coordinator-handoff-create',
          actorId(actor),
          5,
        ))
      ) {
        sendError(response, 429, 'Too many requests');
        return;
      }
      const state = await loadGameState(gameId);
      const target = state?.seats.find(
        (seat) =>
          seat.id === parsed.data.targetSeatId && seat.status === 'alive',
      );
      if (
        !state ||
        state.phase === 'ARCHIVED' ||
        state.config.basics.coCoordinators < 1 ||
        !target
      ) {
        sendError(response, 409, 'Transfer could not be completed');
        return;
      }
      const { getSeatAccess } = await import('@workspace/db/seat-access-store');
      if (!(await getSeatAccess(gameId, target.id))) {
        sendError(response, 409, 'Transfer could not be completed');
        return;
      }
      const code = randomBytes(32).toString('base64url');
      const now = Date.now();
      const { createCoordinatorHandoff } =
        await import('@workspace/db/coordinator-access-store');
      await createCoordinatorHandoff({
        id: randomUUID(),
        gameId,
        targetSeatId: target.id,
        codeHash: createHash('sha256').update(code).digest('hex'),
        expiresAt: new Date(now + coordinatorHandoffDurationMs),
      });
      response
        .status(201)
        .json(coordinatorHandoffResponseSchema.parse({ code }));
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.post('/api/coordinator-handoffs/claim', async (request, response) => {
    try {
      if (!hasValidCsrf(request)) {
        sendError(response, 403, 'Invalid request');
        return;
      }
      const parsed = coordinatorHandoffClaimRequestSchema.safeParse(
        request.body,
      );
      if (!parsed.success) {
        sendError(response, 400, 'Invalid request');
        return;
      }
      const viewer = await viewerForRequest(request);
      if (viewer.kind !== 'player' || !viewer.seatId) {
        sendError(response, 401, 'Transfer could not be completed');
        return;
      }
      if (
        !(await checkRateLimit(
          request,
          'coordinator-handoff-claim',
          actorId({ kind: 'player', seatId: viewer.seatId }),
          5,
        ))
      ) {
        sendError(response, 429, 'Too many requests');
        return;
      }
      const state = await loadGameState(parsed.data.gameId);
      const seat = state?.seats.find(
        (candidate) =>
          candidate.id === viewer.seatId && candidate.status === 'alive',
      );
      if (
        !state ||
        state.phase === 'ARCHIVED' ||
        state.config.basics.coCoordinators < 1 ||
        !seat
      ) {
        sendError(response, 401, 'Transfer could not be completed');
        return;
      }
      const now = Date.now();
      const token = randomBytes(32).toString('base64url');
      const { claimCoordinatorHandoff } =
        await import('@workspace/db/coordinator-access-store');
      const claimed = await claimCoordinatorHandoff({
        gameId: parsed.data.gameId,
        targetSeatId: viewer.seatId,
        codeHash: createHash('sha256').update(parsed.data.code).digest('hex'),
        tokenHash: createHash('sha256').update(token).digest('hex'),
        sessionExpiresAt: now + seatSessionDurationMs,
        now,
      });
      if (!claimed) {
        sendError(response, 401, 'Transfer could not be completed');
        return;
      }
      response.cookie(cookieNameForCoordinatorGame(parsed.data.gameId), token, {
        httpOnly: true,
        secure: options.secureCookies ?? false,
        sameSite: 'lax',
        path: '/',
        maxAge: seatSessionDurationMs,
      });
      response.status(200).json(
        coordinatorHandoffClaimResponseSchema.parse({
          status: 'transferred',
        }),
      );
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
      const viewer = await viewerForRequest(request);
      response.json(await projectState(state, viewer));
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.post('/api/games/:id/private-view', async (request, response) => {
    try {
      if (!hasValidCsrf(request)) {
        sendError(response, 403, 'Invalid request');
        return;
      }
      const parsedRequest = privateViewRequestSchema.safeParse(
        request.body ?? {},
      );
      if (!parsedRequest.success) {
        sendError(response, 400, 'Invalid request');
        return;
      }
      const gameId = request.params.id ?? '';
      const state = await loadGameState(gameId);
      if (!state) {
        sendError(response, 404, 'Not found');
        return;
      }
      const viewer = await viewerForRequest(request);
      if (viewer.kind !== 'player' || !viewer.seatId) {
        sendError(response, 401, 'Authentication required');
        return;
      }
      const privatePhases = new Set([
        'DEAL',
        'SHADOW',
        'VOTE',
        'FINAL_VOTE',
        'FINAL_BANISH',
      ]);
      const seat = state.seats.find(
        (candidate) => candidate.id === viewer.seatId,
      );
      if (
        !seat ||
        seat.status !== 'alive' ||
        (parsedRequest.data.purpose === 'phase' &&
          (!privatePhases.has(state.phase) || !state.acks.includes(seat.id)))
      ) {
        sendError(response, 409, 'Private view unavailable');
        return;
      }
      response.json(
        await projectState(state, {
          kind: 'player',
          seatId: seat.id,
          reveal: true,
        }),
      );
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
      const viewer = await coordinatorViewerForRequest(request);
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
      if (
        !state ||
        state.phase === 'ARCHIVED' ||
        !state.config.presenter.enabled
      ) {
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
      if (
        !state ||
        state.phase === 'ARCHIVED' ||
        !state.config.presenter.enabled
      ) {
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
          game: await projectState(state, { kind: 'presenter' }),
        }),
      );
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.post(
    '/api/games/:id/seats/:seatId/pin/reset',
    async (request, response) => {
      try {
        if (!hasValidCsrf(request)) {
          sendError(response, 403, 'Invalid request');
          return;
        }
        const parsed = seatPinResetRequestSchema.safeParse(request.body);
        if (!parsed.success) {
          sendError(response, 400, 'Invalid request');
          return;
        }
        const viewer = await coordinatorViewerForRequest(request);
        if (viewer.kind !== 'coordinator') {
          sendError(response, 401, 'Authentication required');
          return;
        }
        if (
          !(await checkRateLimit(request, 'seat-pin-reset', 'coordinator', 10))
        ) {
          sendError(response, 429, 'Too many requests');
          return;
        }
        const gameId = request.params.id ?? '';
        const seatId = request.params.seatId ?? '';
        const state = await loadGameState(gameId);
        if (
          !state ||
          state.phase === 'ARCHIVED' ||
          !state.seats.some(
            (seat) => seat.id === seatId && seat.status !== 'departed',
          )
        ) {
          sendError(response, 404, 'Not found');
          return;
        }
        if (state.version !== parsed.data.expectedVersion) {
          sendError(response, 409, 'Command rejected');
          return;
        }
        const pin = await hashSeatPin(parsed.data.newPin);
        const now = Date.now();
        const event = eventSchema.parse({
          seq: state.version + 1,
          at: now,
          schemaVersion: 1,
          type: 'SeatPinReset',
          seatId,
        });
        const nextState = await appendServerEvent(state, event, 'coordinator', {
          seatPinUpdate: {
            seatId,
            pinSalt: pin.salt,
            pinHash: pin.hash,
          },
        });
        if (!nextState) {
          sendError(response, 409, 'Command rejected');
          return;
        }
        response.json(await projectState(nextState, viewer));
      } catch {
        sendError(response, 503, 'Service unavailable');
      }
    },
  );
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
      let viewer = isCoordinatorCommand(parsed.data.type)
        ? await coordinatorViewerForRequest(request)
        : await viewerForRequest(request);
      let actor = actorFor(viewer);
      const gameId = request.params.id ?? '';
      let state: State | null = null;
      let rehearsalSeatId: string | undefined;

      if (parsed.data.type === 'AdvancePhase' && !actor) {
        const playerViewer = await viewerForRequest(request);
        const playerActor = actorFor(playerViewer);
        if (playerActor?.kind === 'player' && playerActor.seatId) {
          viewer = playerViewer;
          actor = playerActor;
        } else if (playerViewer.kind === 'ghost' && playerViewer.seatId) {
          viewer = playerViewer;
          actor = { kind: 'player', seatId: playerViewer.seatId };
        }
      }

      if (
        parsed.data.type === 'AdvancePhase' &&
        actor?.kind === 'player' &&
        actor.seatId
      ) {
        state = await loadGameState(gameId);
        if (!state) {
          sendError(response, 404, 'Not found');
          return;
        }
        if (
          !state.config.rehearsal.enabled ||
          state.config.rehearsal.botSeatIds.includes(actor.seatId)
        ) {
          sendError(response, 401, 'Authentication required');
          return;
        }
        rehearsalSeatId = actor.seatId;
        actor = { kind: 'coordinator' };
      }

      if (!actor) {
        sendError(response, 401, 'Authentication required');
        return;
      }
      const commandActorId = rehearsalSeatId
        ? `seat:${rehearsalSeatId}`
        : actorId(actor);
      const commandLimit = parsed.data.type === 'PostTraitorMessage' ? 30 : 60;
      if (
        !(await checkRateLimit(
          request,
          `command-${parsed.data.type}`,
          commandActorId,
          commandLimit,
        ))
      ) {
        sendError(response, 429, 'Too many requests');
        return;
      }

      const idempotency = {
        gameId,
        actorId: commandActorId,
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

      state ??= await loadGameState(gameId);
      if (!state) {
        sendError(response, 404, 'Not found');
        return;
      }
      if (!previous) {
        const attempts = parsed.data.type === 'AcknowledgePrivate' ? 4 : 1;
        let committed = false;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          const result = decide(state, parsed.data, {
            now: options.testOnlyNow?.() ?? Date.now(),
            actor,
            random: options.testOnlyRandom ?? gameRandom,
          });
          if (!result.ok) {
            sendError(response, 409, 'Command rejected');
            return;
          }
          if (result.events.length === 0) {
            committed = true;
            break;
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
          if (stored.ok) {
            await publishGame(gameId);
            committed = true;
            break;
          }
          if (
            parsed.data.type !== 'AcknowledgePrivate' ||
            attempt + 1 === attempts
          ) {
            sendError(response, 409, 'Command rejected');
            return;
          }
          // Rehearsal bots can write concurrently with this acknowledgement.
          // Re-evaluate against the latest state rather than losing the tap to
          // an optimistic-version conflict.
          state = await loadGameState(gameId);
          if (!state) {
            sendError(response, 404, 'Not found');
            return;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, 10 * (attempt + 1)),
          );
        }
        if (!committed) {
          sendError(response, 409, 'Command rejected');
          return;
        }
      }

      const current = await loadGameState(gameId);
      if (!current) {
        sendError(response, 404, 'Not found');
        return;
      }
      response.json(await projectState(current, viewer));
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
