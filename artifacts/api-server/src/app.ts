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
  ClaimCoordinatorTakeoverBody,
  ClaimCoordinatorTakeoverResponse,
  GetCoordinatorDelegatesResponse,
  GetCoordinatorViewResponse,
  GetCoordinatorTakeoverStatusResponse,
  HeartbeatCoordinatorPresenceResponse,
  HealthCheckResponse,
  ReadinessCheckResponse,
  RequestCoordinatorTakeoverResponse,
  SetCoordinatorDelegatesBody,
  SetCoordinatorDelegatesResponse,
  VoteCoordinatorTakeoverBody,
  VoteCoordinatorTakeoverResponse,
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
import {
  hashSeatPin,
  verifySeatPinWithRotation,
  type PinPepperConfig,
} from '@workspace/security/seat-pin';
import { gameRandom } from '@workspace/security/game-random';
import {
  deploymentMode,
  type DeploymentMode,
} from '@workspace/security/deployment';
import {
  cookieNameForCoordinatorGame,
  cookieNameForGame,
  cookieNameForJoinRequest,
  cookieNameForPresenterGame,
} from './session-auth';
import { security } from './middlewares/security';
import { staticClient } from './static-client';
import { canOrganiserActOnDisconnectedSeat } from './disconnected-seat-policy';
import { gameplayCommandRateLimits } from './gameplay-command-limits';
import {
  coordinatorInactivityWindowMs,
  isCoordinatorUnavailableForAction,
} from './coordinator-takeover-policy';

type RateLimitRejectionDiagnostic = Readonly<{
  scope: string;
  bucketFingerprint: string;
  subjectKind: 'ip' | 'actor';
  limit: number;
  commandType: string;
  actorSeatId?: string;
}>;

export type AppOptions = {
  clientDirectory?: string;
  resolveViewer?: (request: Request) => Viewer | Promise<Viewer>;
  resolveCoordinatorViewer?: (request: Request) => Viewer | Promise<Viewer>;
  /** Test-only deterministic clock; the production server never supplies it. */
  testOnlyNow?: () => number;
  /** Test-only deterministic randomness; production always uses Web Crypto. */
  testOnlyRandom?: Context['random'];
  /** Test-only phase timer used by the real-server browser harness. */
  testOnlyPhaseDurationMs?: Context['testOnlyPhaseDurationMs'];
  publishGame?: (gameId: string) => Promise<void>;
  processRehearsalGame?: (gameId: string) => Promise<void>;
  allowedOrigins?: readonly string[];
  maxActiveGames?: number;
  countActiveGames?: () => Promise<number>;
  secureCookies?: boolean;
  rateLimitSecret?: string;
  pinPepperConfig?: PinPepperConfig;
  publicBaseUrl?: string;
  consumeRateLimit?: (
    bucketHash: string,
    limit: number,
    windowMs: number,
  ) => Promise<boolean>;
  /** Test-only opt-in for diagnostic response headers; never enabled in production. */
  testOnlyRateLimitDiagnostics?: boolean;
  onRateLimitRejected?: (diagnostic: RateLimitRejectionDiagnostic) => void;
  deploymentMode?: DeploymentMode;
};

const csrfCookieName = 'oathstone-csrf';
const seatSessionDurationMs = 30 * 24 * 60 * 60 * 1_000;
const coordinatorHandoffDurationMs = 5 * 60 * 1_000;
const coordinatorTakeoverRequestDurationMs = 5 * 60_000;
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

function requestCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
    return item.slice(separator + 1).trim();
  }
  return null;
}

function coordinatorActionNeeded(
  state: State,
  now: number,
  hasPendingJoinRequest: boolean,
): boolean {
  if (
    state.paused ||
    state.config.rehearsal.enabled ||
    state.phase === 'FINISHED' ||
    state.phase === 'ARCHIVED'
  )
    return false;
  if (state.phase === 'DRAFT')
    return (
      hasPendingJoinRequest ||
      state.seats.filter((seat) => seat.status === 'alive').length >= 5
    );
  if (state.phase === 'LOBBY')
    return (
      hasPendingJoinRequest ||
      viewFor({ kind: 'coordinator' }, state).canAdvancePhase ||
      state.seats.filter((seat) => seat.status === 'alive').length >= 5
    );
  if (viewFor({ kind: 'coordinator' }, state).canAdvancePhase) return true;
  const deadline =
    state.phase === 'SHADOW' ? state.shadowEndAt : state.deadline;
  return deadline !== null && deadline <= now;
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
  const disconnectedSeatIds =
    viewer.kind === 'coordinator' ||
    (viewer.kind === 'host' && !state.config.basics.coordinatorPlays)
      ? await import('@workspace/db/seat-presence-store').then(
          ({ areGameSeatsDisconnected }) =>
            areGameSeatsDisconnected({
              gameId: state.id,
              seatIds: state.seats
                .filter((seat) => seat.status === 'alive')
                .map((seat) => seat.id),
              now: serverNow,
            }),
        )
      : [];
  const connectedSeatIds =
    viewer.kind === 'player'
      ? await import('@workspace/db/seat-presence-store').then(
          ({ listConnectedSeatIds }) =>
            listConnectedSeatIds({
              gameId: state.id,
              seatIds: state.seats.map((seat) => seat.id),
              now: serverNow,
            }),
        )
      : undefined;
  const view =
    viewer.kind === 'visitor'
      ? viewFor({ kind: 'visitor' }, state)
      : viewFor(viewer, state, {
          lobbyCode,
          disconnectedSeatIds,
          connectedSeatIds,
        });
  if (viewer.kind === 'coordinator' && 'id' in view) {
    const { getGameUndoStatus } = await import('@workspace/db/game-store');
    view.coordinatorUndo = await getGameUndoStatus(
      state.id,
      state.version,
      serverNow,
    );
  }
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

type ReadinessStatus = 'ready' | 'unavailable';

const readinessCacheTtlMs = 60_000;

export function createReadinessStatusReader(
  probeDatabase: () => Promise<void>,
  now: () => number = () => Date.now(),
): () => Promise<ReadinessStatus> {
  let cached: { status: ReadinessStatus; expiresAt: number } | undefined;
  let inFlight: Promise<ReadinessStatus> | undefined;

  return async () => {
    if (cached && now() < cached.expiresAt) return cached.status;
    if (inFlight) return inFlight;

    const probe = (async (): Promise<ReadinessStatus> => {
      let status: ReadinessStatus;
      try {
        await probeDatabase();
        status = 'ready';
      } catch {
        status = 'unavailable';
      }
      cached = { status, expiresAt: now() + readinessCacheTtlMs };
      return status;
    })();
    inFlight = probe;
    try {
      return await probe;
    } finally {
      if (inFlight === probe) inFlight = undefined;
    }
  };
}

export function createApp(
  probeDatabase: () => Promise<void>,
  options: AppOptions = {},
): Express {
  const app = express();
  const testOnlyPhaseDurationMs =
    process.env.NODE_ENV === 'test'
      ? options.testOnlyPhaseDurationMs
      : undefined;
  const readReadinessStatus = createReadinessStatusReader(probeDatabase);
  app.disable('x-powered-by');
  const activeDeploymentMode = options.deploymentMode ?? deploymentMode;
  app.use(security(activeDeploymentMode));
  if (options.clientDirectory) app.use(staticClient(options.clientDirectory));
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
  function getPinPepperConfig(): PinPepperConfig {
    if (options.pinPepperConfig) return options.pinPepperConfig;
    const currentSecret = process.env.PIN_PEPPER;
    if (!currentSecret) throw new Error('PIN_PEPPER is required');
    const currentVersion = Number(process.env.PIN_PEPPER_VERSION ?? '1');
    return { current: { version: currentVersion, secret: currentSecret } };
  }
  async function hashConfiguredSeatPin(pin: string) {
    return hashSeatPin(pin, getPinPepperConfig().current);
  }
  async function verifyAndUpgradeSeatPin(
    gameId: string,
    seatId: string,
    pin: string,
    stored: {
      pinSalt: string;
      pinHash: string;
      pinPepperVersion: number;
    },
  ): Promise<boolean> {
    const result = await verifySeatPinWithRotation(
      pin,
      {
        salt: stored.pinSalt,
        hash: stored.pinHash,
        pinPepperVersion: stored.pinPepperVersion,
      },
      getPinPepperConfig(),
    );
    if (!result.valid) return false;
    if (result.replacement) {
      const { updateSeatAccessPinHash } =
        await import('@workspace/db/seat-access-store');
      const updated = await updateSeatAccessPinHash({
        gameId,
        seatId,
        expected: {
          pinSalt: stored.pinSalt,
          pinHash: stored.pinHash,
          pinPepperVersion: stored.pinPepperVersion,
        },
        replacement: {
          salt: result.replacement.salt,
          hash: result.replacement.hash,
          pepperVersion: result.replacement.pepperVersion,
        },
      });
      if (!updated) return false;
    }
    return true;
  }
  const gameJoinRateLimitPerMinute = 40;
  const joinIpAbuseRateLimitPerMinute = 240;
  const joinStatusIpRateLimitPerMinute = 480;
  const seatRecoveryRateLimitPerMinute = 10;

  async function consumeRateLimitForSubject(
    scope: string,
    subject: string,
    limit: number,
    command?: Pick<RateLimitRejectionDiagnostic, 'commandType' | 'actorSeatId'>,
    diagnosticResponse?: Response,
  ): Promise<boolean> {
    if (!options.rateLimitSecret) return true;
    const { consumeRateLimit } = options.consumeRateLimit
      ? { consumeRateLimit: options.consumeRateLimit }
      : await import('@workspace/db/rate-limit');
    const bucketHash = createHmac('sha256', options.rateLimitSecret)
      .update(`${scope}\u0000${subject}`)
      .digest('hex');
    const allowed = await consumeRateLimit(bucketHash, limit, 60_000);
    if (!allowed && command) {
      const diagnostic: RateLimitRejectionDiagnostic = {
        ...command,
        scope,
        bucketFingerprint: bucketHash.slice(0, 12),
        subjectKind: subject.startsWith('ip:') ? 'ip' : 'actor',
        limit,
      };
      if (options.onRateLimitRejected) {
        try {
          options.onRateLimitRejected(diagnostic);
        } catch {
          // Diagnostic sinks must not change command rate-limit behaviour.
        }
      }
      if (options.testOnlyRateLimitDiagnostics) {
        diagnosticResponse?.setHeader(
          'X-Test-Rate-Limit-Diagnostic',
          JSON.stringify(diagnostic),
        );
      }
    }
    return allowed;
  }

  function rateLimitIp(request: Request): string {
    return `ip:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`;
  }

  async function checkRateLimit(
    request: Request,
    scope: string,
    actor?: string,
    limit = 60,
  ): Promise<boolean> {
    if (!options.rateLimitSecret) return true;
    const subjects = [
      rateLimitIp(request),
      ...(actor ? [`actor:${actor}`] : []),
    ];
    for (const subject of subjects) {
      if (!(await consumeRateLimitForSubject(scope, subject, limit)))
        return false;
    }
    return true;
  }

  async function checkGameplayCommandTypeRateLimit(
    commandActorId: string,
    commandType: string,
    actorSeatId?: string,
    response?: Response,
  ): Promise<boolean> {
    return consumeRateLimitForSubject(
      `command-${commandType}`,
      `actor:${commandActorId}`,
      60,
      { commandType, ...(actorSeatId ? { actorSeatId } : {}) },
      response,
    );
  }

  async function checkGameplayCommandAggregateRateLimit(
    commandActorId: string,
    commandType: string,
    actorSeatId: string | undefined,
    seatCount: number,
    response?: Response,
  ): Promise<boolean> {
    if (!actorSeatId) return true;
    const limits = gameplayCommandRateLimits(seatCount);
    return consumeRateLimitForSubject(
      'command-seat-aggregate',
      `actor:${commandActorId}`,
      limits.perSeatAggregatePerMinute,
      { commandType, actorSeatId },
      response,
    );
  }

  async function checkGameplayCommandIpRateLimit(
    request: Request,
    gameId: string,
    seatCount: number,
    commandType: string,
    actorSeatId?: string,
    response?: Response,
  ): Promise<boolean> {
    const limits = gameplayCommandRateLimits(seatCount);
    return consumeRateLimitForSubject(
      'command-game-ip',
      `${rateLimitIp(request)}\u0000game:${gameId}`,
      limits.sharedIpPerMinute,
      { commandType, ...(actorSeatId ? { actorSeatId } : {}) },
      response,
    );
  }

  function sendCommandRateLimitError(response: Response): void {
    response.setHeader('Retry-After', '60');
    sendError(response, 429, 'Too many requests');
  }

  async function checkJoinIpAbuseRateLimit(request: Request): Promise<boolean> {
    if (!options.rateLimitSecret) return true;
    return consumeRateLimitForSubject(
      'join-ip-abuse',
      rateLimitIp(request),
      joinIpAbuseRateLimitPerMinute,
    );
  }

  async function checkGameJoinBucket(
    request: Request,
    scope: string,
    gameKey: string,
  ): Promise<boolean> {
    if (!options.rateLimitSecret) return true;
    return consumeRateLimitForSubject(
      scope,
      `${rateLimitIp(request)}\u0000game:${gameKey}`,
      gameJoinRateLimitPerMinute,
    );
  }

  async function checkGameJoinRateLimit(
    request: Request,
    scope: string,
    gameKey: string,
  ): Promise<boolean> {
    if (!(await checkJoinIpAbuseRateLimit(request))) return false;
    return checkGameJoinBucket(request, scope, gameKey);
  }

  async function checkJoinRequestStatusRateLimit(
    request: Request,
    requestId: string,
  ): Promise<boolean> {
    const ip = rateLimitIp(request);
    if (
      !(await consumeRateLimitForSubject(
        'join-request-status-ip',
        ip,
        joinStatusIpRateLimitPerMinute,
      ))
    )
      return false;
    return consumeRateLimitForSubject(
      'join-request-status',
      `${ip}\u0000request:${requestId}`,
      30,
    );
  }

  async function checkSeatRecoveryRateLimit(
    request: Request,
    gameId: string,
    seatId: string,
  ): Promise<boolean> {
    return consumeRateLimitForSubject(
      'seat-recovery-pin',
      `${rateLimitIp(request)}\u0000game:${gameId}\u0000seat:${seatId}`,
      seatRecoveryRateLimitPerMinute,
    );
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
      ...(testOnlyPhaseDurationMs === undefined
        ? {}
        : { testOnlyPhaseDurationMs }),
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
        pinPepperVersion: number;
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
    const status = await readReadinessStatus();
    if (status === 'ready') {
      res.json(ReadinessCheckResponse.parse({ status }));
    } else {
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
      if (activeDeploymentMode.comingSoonMode) {
        sendError(
          response,
          503,
          'Game creation is closed while Oathstone is coming soon.',
        );
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
      if (activeDeploymentMode.comingSoonMode) {
        sendError(
          response,
          503,
          'Game creation is closed while Oathstone is coming soon.',
        );
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
      const idSecret = options.rateLimitSecret ?? 'oathstone-rehearsal-local';
      const deterministicSeatId = (label: string) =>
        createHmac('sha256', idSecret)
          .update(`oathstone-rehearsal\u0000${gameId}\u0000${label}`)
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
          murders: 1,
        },
        roundTable: {
          debateMinutes: speed === 'fast' ? 2 : 15,
          voteMinutes: speed === 'fast' ? 1 : 3,
          tieRule: 'revote-random',
          revealStyle: 'speaker-circle',
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
      const internalPinHash = await hashConfiguredSeatPin(internalPin);
      const accessCreated = await createSeatAccess({
        gameId,
        seatId: humanSeatId,
        pinSalt: internalPinHash.salt,
        pinHash: internalPinHash.hash,
        pinPepperVersion: internalPinHash.pepperVersion,
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
      const { createGameInvite, getOpenGameInviteCode } =
        await import('@workspace/db/seat-access-store');
      const inviteToken = randomBytes(32).toString('base64url');
      const linkTokenHash = createHash('sha256')
        .update(inviteToken)
        .digest('hex');
      const now = Date.now();
      // One Lobby keeps one code: reloading the organiser's Lobby must not
      // invalidate a code or QR already shared (owner, 27 October 2026).
      const openCode = await getOpenGameInviteCode(gameId, now);
      let shortCode: string | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate =
          attempt === 0 && openCode ? openCode : createJoinCode();
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
      .update(`oathstone-request-id\u0000${gameId}\u0000${data.idempotencyKey}`)
      .digest('hex')
      .slice(0, 32);
    const seatId = createHmac('sha256', secret)
      .update(
        `oathstone-request-seat\u0000${gameId}\u0000${data.idempotencyKey}`,
      )
      .digest('hex')
      .slice(0, 32);
    const requestToken = createHmac('sha256', secret)
      .update(
        `oathstone-request-token\u0000${gameId}\u0000${data.idempotencyKey}`,
      )
      .digest('base64url');
    let access = await getSeatAccess(gameId, seatId);
    let accessCreated = false;
    if (!access) {
      const hashedPin = await hashConfiguredSeatPin(data.pin);
      accessCreated = await createSeatAccess({
        gameId,
        seatId,
        pinSalt: hashedPin.salt,
        pinHash: hashedPin.hash,
        pinPepperVersion: hashedPin.pepperVersion,
      });
      access = await getSeatAccess(gameId, seatId);
    }
    if (
      !access ||
      (!accessCreated &&
        !(await verifyAndUpgradeSeatPin(gameId, seatId, data.pin, access)))
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
        !(await checkGameJoinRateLimit(
          request,
          'short-code-join',
          shortCodeHash,
        ))
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
          !(await checkGameJoinRateLimit(
            request,
            'short-code-name-check',
            shortCodeHash,
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
        if (!(await checkJoinIpAbuseRateLimit(request))) {
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
        if (!(await checkGameJoinBucket(request, 'guest-name-check', gameId))) {
          sendError(response, 429, entryFailureMessages.joinRateLimited);
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
          !(await checkGameJoinBucket(
            request,
            'late-invite-name-check',
            gameId,
          ))
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
        !(await checkJoinRequestStatusRateLimit(request, requestId))
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
      const recoveryGameKey =
        'shortCode' in parsed.data
          ? hashJoinCode(parsed.data.shortCode, secret)
          : parsed.data.gameId;
      const recoveryKey =
        'shortCode' in parsed.data
          ? recoveryGameKey
          : createHash('sha256').update(parsed.data.inviteToken).digest('hex');
      const recoveryRateAllowed =
        'shortCode' in parsed.data
          ? await checkGameJoinRateLimit(
              request,
              'seat-recovery',
              recoveryGameKey,
            )
          : await checkJoinIpAbuseRateLimit(request);
      if (!recoveryRateAllowed) {
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
      if (
        'inviteToken' in parsed.data &&
        !(await checkGameJoinBucket(request, 'seat-recovery', invite.gameId))
      ) {
        sendError(response, 429, entryFailureMessages.recoveryRateLimited);
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
        !(await checkSeatRecoveryRateLimit(request, invite.gameId, seat.id))
      ) {
        sendError(response, 429, entryFailureMessages.recoveryRateLimited);
        return;
      }
      if (
        !(await verifyAndUpgradeSeatPin(
          invite.gameId,
          seat.id,
          parsed.data.pin,
          access,
        ))
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
      const { upsertGameSeatConnection } =
        await import('@workspace/db/seat-presence-store');
      await upsertGameSeatConnection({
        connectionId: `initial:${seat.id}`,
        gameId: invite.gameId,
        seatId: seat.id,
        seenAt: now,
      });
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
      if (!(await checkJoinIpAbuseRateLimit(request))) {
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
      if (!(await checkGameJoinBucket(request, 'guest-join', gameId))) {
        sendError(response, 429, entryFailureMessages.joinRateLimited);
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
        if (!(await checkGameJoinBucket(request, 'late-invite-join', gameId))) {
          sendError(response, 429, entryFailureMessages.joinRateLimited);
          return;
        }
        await queueSeatApproval(gameId, parsed.data, response);
        return;
      }
      const seatId = createHmac('sha256', options.rateLimitSecret)
        .update(
          `oathstone-seat\u0000${gameId}\u0000${parsed.data.idempotencyKey}`,
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
        const hashedPin = await hashConfiguredSeatPin(parsed.data.pin);
        createdAccess = await createSeatAccess({
          gameId,
          seatId,
          pinSalt: hashedPin.salt,
          pinHash: hashedPin.hash,
          pinPepperVersion: hashedPin.pepperVersion,
        });
        access = await getSeatAccess(gameId, seatId);
      }
      if (
        !access ||
        !(await verifyAndUpgradeSeatPin(
          gameId,
          seatId,
          parsed.data.pin,
          access,
        ))
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

      const { upsertGameSeatConnection } =
        await import('@workspace/db/seat-presence-store');
      await upsertGameSeatConnection({
        connectionId: `initial:${seatId}`,
        gameId,
        seatId,
        seenAt: now,
      });
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
  app.get('/api/games/:id/coordinator/delegates', async (request, response) => {
    try {
      const viewer = await coordinatorViewerForRequest(request);
      if (viewer.kind !== 'coordinator') {
        sendError(response, 401, 'Authentication required');
        return;
      }
      const gameId = request.params.id ?? '';
      const state = await loadGameState(gameId);
      if (!state) {
        sendError(response, 404, 'Not found');
        return;
      }
      const { listCoordinatorDelegates } =
        await import('@workspace/db/coordinator-access-store');
      response.json(
        GetCoordinatorDelegatesResponse.parse({
          limit: state.config.basics.coCoordinators,
          seatIds: await listCoordinatorDelegates(gameId),
        }),
      );
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.put('/api/games/:id/coordinator/delegates', async (request, response) => {
    try {
      if (!hasValidCsrf(request)) {
        sendError(response, 403, 'Invalid request');
        return;
      }
      const parsed = SetCoordinatorDelegatesBody.safeParse(request.body);
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
      const now = options.testOnlyNow?.() ?? Date.now();
      if (
        !(await checkRateLimit(
          request,
          'coordinator-delegates',
          actorId(actor),
          10,
        ))
      ) {
        sendError(response, 429, 'Too many requests');
        return;
      }
      const state = await loadGameState(gameId);
      if (
        !state ||
        state.phase === 'ARCHIVED' ||
        parsed.data.seatIds.length > state.config.basics.coCoordinators
      ) {
        sendError(response, 409, 'Selection could not be saved');
        return;
      }
      const livingSeats = new Set(
        state.seats
          .filter((seat) => seat.status === 'alive')
          .map((seat) => seat.id),
      );
      if (
        !parsed.data.seatIds.every((seatId: string) => livingSeats.has(seatId))
      ) {
        sendError(response, 409, 'Selection could not be saved');
        return;
      }
      const { getSeatAccess } = await import('@workspace/db/seat-access-store');
      for (const seatId of parsed.data.seatIds) {
        if (!(await getSeatAccess(gameId, seatId))) {
          sendError(response, 409, 'Selection could not be saved');
          return;
        }
      }
      const capability = requestCookie(
        request,
        cookieNameForCoordinatorGame(gameId),
      );
      if (!capability) {
        sendError(response, 401, 'Authentication required');
        return;
      }
      const { replaceCoordinatorDelegates } =
        await import('@workspace/db/coordinator-access-store');
      const updated = await replaceCoordinatorDelegates({
        gameId,
        tokenHash: createHash('sha256').update(capability).digest('hex'),
        seatIds: parsed.data.seatIds,
        now,
      });
      if (!updated) {
        sendError(response, 401, 'Authentication required');
        return;
      }
      response.json(
        SetCoordinatorDelegatesResponse.parse({
          limit: state.config.basics.coCoordinators,
          seatIds: parsed.data.seatIds,
        }),
      );
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.post('/api/games/:id/coordinator/presence', async (request, response) => {
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
      const gameId = request.params.id ?? '';
      const now = options.testOnlyNow?.() ?? Date.now();
      if (
        !(await checkRateLimit(
          request,
          'coordinator-presence',
          actorId(actor),
          8,
        ))
      ) {
        sendError(response, 429, 'Too many requests');
        return;
      }
      const capability = requestCookie(
        request,
        cookieNameForCoordinatorGame(gameId),
      );
      if (!capability) {
        sendError(response, 401, 'Authentication required');
        return;
      }
      const { touchCoordinatorPresence } =
        await import('@workspace/db/coordinator-access-store');
      const touched = await touchCoordinatorPresence({
        gameId,
        tokenHash: createHash('sha256').update(capability).digest('hex'),
        now,
        inactiveRequestCutoff: now - coordinatorInactivityWindowMs,
      });
      if (!touched) {
        sendError(response, 401, 'Authentication required');
        return;
      }
      response.json(
        HeartbeatCoordinatorPresenceResponse.parse({ status: 'online' }),
      );
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.get('/api/games/:id/takeover', async (request, response) => {
    try {
      const viewer = await viewerForRequest(request);
      if (viewer.kind !== 'player' || !viewer.seatId) {
        sendError(response, 401, 'Authentication required');
        return;
      }
      const gameId = request.params.id ?? '';
      const now = options.testOnlyNow?.() ?? Date.now();
      const state = await loadGameState(gameId);
      const seat = state?.seats.find(
        (candidate) =>
          candidate.id === viewer.seatId && candidate.status === 'alive',
      );
      if (!state || !seat) {
        sendError(response, 401, 'Authentication required');
        return;
      }
      const { listPendingGameJoinRequests } =
        await import('@workspace/db/seat-access-store');
      const hasPendingJoinRequest =
        (state.phase === 'LOBBY' || state.phase === 'DRAFT') &&
        (await listPendingGameJoinRequests(gameId)).length > 0;
      const actionNeeded = coordinatorActionNeeded(
        state,
        now,
        hasPendingJoinRequest,
      );
      const {
        getCoordinatorTakeoverRecord,
        reserveAutomaticCoordinatorHandover,
      } = await import('@workspace/db/coordinator-access-store');
      const record = await getCoordinatorTakeoverRecord(gameId, now);
      if (!record) {
        sendError(response, 404, 'Not found');
        return;
      }
      const unavailable = isCoordinatorUnavailableForAction({
        now,
        lastSeenAt: record.lastSeenAt,
        actionNeeded,
      });
      const livingSeatIds = state.seats
        .filter((candidate) => candidate.status === 'alive')
        .map((candidate) => candidate.id);
      const manualRequest =
        record.request?.status === 'pending' ||
        record.request?.status === 'approved'
          ? record.request
          : null;
      const automaticMode = unavailable && actionNeeded && !manualRequest;
      let automaticTargetSeatId: string | null = null;
      if (automaticMode) {
        const { listConnectedSeatIds } =
          await import('@workspace/db/seat-presence-store');
        const connectedSeatIds = await listConnectedSeatIds({ gameId, now });
        const handover = await reserveAutomaticCoordinatorHandover({
          id: randomUUID(),
          gameId,
          delegateSeatIds: record.delegateSeatIds,
          livingSeatIds,
          connectedSeatIds,
          now,
          inactiveRequestCutoff: now - coordinatorInactivityWindowMs,
          expiresAt: now + coordinatorTakeoverRequestDurationMs,
          actionNeeded,
        });
        automaticTargetSeatId = handover?.targetSeatId ?? null;
      }
      const mode = !unavailable
        ? null
        : manualRequest
          ? 'majority'
          : automaticTargetSeatId === seat.id
            ? 'co-coordinator'
            : null;
      const requestRecord = manualRequest;
      const livingVotes = requestRecord?.votes.filter((vote) =>
        livingSeatIds.includes(vote.seatId),
      );
      const yesVotes = livingVotes?.filter((vote) => vote.approved).length ?? 0;
      const noVotes = livingVotes?.filter((vote) => !vote.approved).length ?? 0;
      const viewerVote =
        livingVotes?.find((vote) => vote.seatId === seat.id)?.approved ?? null;
      const requiredVotes = Math.floor(livingSeatIds.length / 2) + 1;
      const effectiveRequestStatus =
        requestRecord?.status === 'approved' && yesVotes < requiredVotes
          ? 'pending'
          : requestRecord?.status;
      const canClaimDelegate =
        mode === 'co-coordinator' && automaticTargetSeatId === seat.id;
      const canClaimMajority =
        mode === 'majority' &&
        effectiveRequestStatus === 'approved' &&
        requestRecord?.requesterSeatId === seat.id;
      response.json(
        GetCoordinatorTakeoverStatusResponse.parse({
          eligible: mode !== null,
          mode,
          canRequest: mode === 'majority' && requestRecord === null,
          canVote:
            mode === 'majority' &&
            effectiveRequestStatus === 'pending' &&
            viewerVote === null,
          canClaim: canClaimDelegate || canClaimMajority,
          request: requestRecord
            ? {
                id: requestRecord.id,
                requesterName:
                  state.seats.find(
                    (candidate) =>
                      candidate.id === requestRecord.requesterSeatId,
                  )?.name ?? '',
                status: effectiveRequestStatus,
                yesVotes,
                noVotes,
                requiredVotes,
                expiresAt: requestRecord.expiresAt,
                viewerVote,
              }
            : null,
        }),
      );
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.post('/api/games/:id/takeover', async (request, response) => {
    try {
      if (!hasValidCsrf(request)) {
        sendError(response, 403, 'Invalid request');
        return;
      }
      const viewer = await viewerForRequest(request);
      if (viewer.kind !== 'player' || !viewer.seatId) {
        sendError(response, 401, 'Authentication required');
        return;
      }
      const gameId = request.params.id ?? '';
      const now = options.testOnlyNow?.() ?? Date.now();
      if (
        !(await checkRateLimit(
          request,
          'coordinator-takeover-request',
          actorId({ kind: 'player', seatId: viewer.seatId }),
          3,
        ))
      ) {
        sendError(response, 429, 'Too many requests');
        return;
      }
      const state = await loadGameState(gameId);
      const seat = state?.seats.find(
        (candidate) =>
          candidate.id === viewer.seatId && candidate.status === 'alive',
      );
      if (!state || !seat) {
        sendError(response, 401, 'Authentication required');
        return;
      }
      const { listPendingGameJoinRequests } =
        await import('@workspace/db/seat-access-store');
      const hasPendingJoinRequest =
        (state.phase === 'LOBBY' || state.phase === 'DRAFT') &&
        (await listPendingGameJoinRequests(gameId)).length > 0;
      const { createCoordinatorTakeoverRequest } =
        await import('@workspace/db/coordinator-access-store');
      const created = await createCoordinatorTakeoverRequest({
        id: randomUUID(),
        gameId,
        requesterSeatId: seat.id,
        expiresAt: now + coordinatorTakeoverRequestDurationMs,
        now,
        inactiveRequestCutoff: now - coordinatorInactivityWindowMs,
        actionNeeded: coordinatorActionNeeded(
          state,
          now,
          hasPendingJoinRequest,
        ),
      });
      if (!created) {
        sendError(response, 409, 'Takeover is not currently available');
        return;
      }
      const record =
        await import('@workspace/db/coordinator-access-store').then(
          ({ getCoordinatorTakeoverRecord }) =>
            getCoordinatorTakeoverRecord(gameId, now),
        );
      const requestId = record?.request?.id;
      if (!requestId) {
        sendError(response, 503, 'Service unavailable');
        return;
      }
      response.status(201).json(
        RequestCoordinatorTakeoverResponse.parse({
          requestId,
          status: record.request?.status,
        }),
      );
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.post('/api/games/:id/takeover/vote', async (request, response) => {
    try {
      if (!hasValidCsrf(request)) {
        sendError(response, 403, 'Invalid request');
        return;
      }
      const parsed = VoteCoordinatorTakeoverBody.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, 'Invalid request');
        return;
      }
      const viewer = await viewerForRequest(request);
      if (viewer.kind !== 'player' || !viewer.seatId) {
        sendError(response, 401, 'Authentication required');
        return;
      }
      const gameId = request.params.id ?? '';
      const now = options.testOnlyNow?.() ?? Date.now();
      if (
        !(await checkRateLimit(
          request,
          'coordinator-takeover-vote',
          actorId({ kind: 'player', seatId: viewer.seatId }),
          8,
        ))
      ) {
        sendError(response, 429, 'Too many requests');
        return;
      }
      const state = await loadGameState(gameId);
      const seat = state?.seats.find(
        (candidate) =>
          candidate.id === viewer.seatId && candidate.status === 'alive',
      );
      if (!state || !seat) {
        sendError(response, 401, 'Authentication required');
        return;
      }
      const { voteCoordinatorTakeover } =
        await import('@workspace/db/coordinator-access-store');
      const status = await voteCoordinatorTakeover({
        requestId: parsed.data.requestId,
        gameId,
        seatId: seat.id,
        approved: parsed.data.approve,
        livingSeatIds: state.seats
          .filter((candidate) => candidate.status === 'alive')
          .map((candidate) => candidate.id),
        now,
        inactiveRequestCutoff: now - coordinatorInactivityWindowMs,
      });
      if (!status) {
        sendError(response, 409, 'Takeover is not currently available');
        return;
      }
      response.json(
        VoteCoordinatorTakeoverResponse.parse({
          requestId: parsed.data.requestId,
          status,
        }),
      );
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.post('/api/games/:id/takeover/claim', async (request, response) => {
    try {
      if (!hasValidCsrf(request)) {
        sendError(response, 403, 'Invalid request');
        return;
      }
      const parsed = ClaimCoordinatorTakeoverBody.safeParse(request.body ?? {});
      if (!parsed.success) {
        sendError(response, 400, 'Invalid request');
        return;
      }
      const viewer = await viewerForRequest(request);
      if (viewer.kind !== 'player' || !viewer.seatId) {
        sendError(response, 401, 'Authentication required');
        return;
      }
      const gameId = request.params.id ?? '';
      const now = options.testOnlyNow?.() ?? Date.now();
      if (
        !(await checkRateLimit(
          request,
          'coordinator-takeover-claim',
          actorId({ kind: 'player', seatId: viewer.seatId }),
          3,
        ))
      ) {
        sendError(response, 429, 'Too many requests');
        return;
      }
      const state = await loadGameState(gameId);
      const seat = state?.seats.find(
        (candidate) =>
          candidate.id === viewer.seatId && candidate.status === 'alive',
      );
      if (!state || !seat) {
        sendError(response, 401, 'Authentication required');
        return;
      }
      const { listPendingGameJoinRequests } =
        await import('@workspace/db/seat-access-store');
      const hasPendingJoinRequest =
        (state.phase === 'LOBBY' || state.phase === 'DRAFT') &&
        (await listPendingGameJoinRequests(gameId)).length > 0;
      const actionNeeded = coordinatorActionNeeded(
        state,
        now,
        hasPendingJoinRequest,
      );
      const { getCoordinatorTakeoverRecord } =
        await import('@workspace/db/coordinator-access-store');
      const record = await getCoordinatorTakeoverRecord(gameId, now);
      if (
        !record ||
        !isCoordinatorUnavailableForAction({
          now,
          lastSeenAt: record.lastSeenAt,
          actionNeeded,
        })
      ) {
        sendError(response, 409, 'Takeover is not currently available');
        return;
      }
      const livingSeatIds = state.seats
        .filter((candidate) => candidate.status === 'alive')
        .map((candidate) => candidate.id);
      const { listConnectedSeatIds } =
        await import('@workspace/db/seat-presence-store');
      const {
        reserveAutomaticCoordinatorHandover,
        claimAutomaticCoordinatorHandover,
        claimCoordinatorTakeover,
      } = await import('@workspace/db/coordinator-access-store');
      const token = randomBytes(32).toString('base64url');
      const manualRequest =
        record.request?.status === 'pending' ||
        record.request?.status === 'approved'
          ? record.request
          : null;
      let transferred = false;
      if (manualRequest) {
        // Never fall back to automatic selection around a pending/approved
        // explicit request, including claims by delegates or other players.
        if (
          parsed.data.requestId === manualRequest.id &&
          manualRequest.requesterSeatId === seat.id &&
          manualRequest.status === 'approved'
        )
          transferred = await claimCoordinatorTakeover({
            gameId,
            tokenHash: createHash('sha256').update(token).digest('hex'),
            sessionExpiresAt: now + seatSessionDurationMs,
            inactiveRequestCutoff: now - coordinatorInactivityWindowMs,
            now,
            actionNeeded,
            requestId: manualRequest.id,
            requesterSeatId: seat.id,
            livingSeatIds,
          });
      } else {
        const connectedSeatIds = await listConnectedSeatIds({ gameId, now });
        // Without an explicit request, every claim uses server selection. A
        // nonselected delegate cannot bypass it by claiming directly.
        const reservation = await reserveAutomaticCoordinatorHandover({
          id: randomUUID(),
          gameId,
          delegateSeatIds: record.delegateSeatIds,
          livingSeatIds,
          connectedSeatIds,
          now,
          inactiveRequestCutoff: now - coordinatorInactivityWindowMs,
          expiresAt: now + coordinatorTakeoverRequestDurationMs,
          actionNeeded,
        });
        if (reservation?.targetSeatId === seat.id)
          transferred = await claimAutomaticCoordinatorHandover({
            gameId,
            tokenHash: createHash('sha256').update(token).digest('hex'),
            sessionExpiresAt: now + seatSessionDurationMs,
            inactiveRequestCutoff: now - coordinatorInactivityWindowMs,
            now,
            actionNeeded,
            requestId: reservation.id,
            seatId: seat.id,
            livingSeatIds,
            connectedSeatIds,
            expectedVersion: state.version,
          });
      }
      if (!transferred) {
        sendError(response, 409, 'Takeover is not currently available');
        return;
      }
      response.cookie(cookieNameForCoordinatorGame(gameId), token, {
        httpOnly: true,
        secure: options.secureCookies ?? false,
        sameSite: 'lax',
        path: '/',
        maxAge: seatSessionDurationMs,
      });
      await publishGame(gameId);
      response.json(
        ClaimCoordinatorTakeoverResponse.parse({ status: 'transferred' }),
      );
    } catch {
      sendError(response, 503, 'Service unavailable');
    }
  });
  app.get('/api/games/:id/coordinator/view', async (request, response) => {
    try {
      const viewer = await coordinatorViewerForRequest(request);
      if (viewer.kind !== 'coordinator') {
        sendError(response, 401, 'Authentication required');
        return;
      }
      const state = await loadGameState(request.params.id ?? '');
      if (!state) {
        sendError(response, 404, 'Not found');
        return;
      }
      // Resolve capability separately from the organiser's player seat.
      // Never elevate the ordinary player/private-view or socket projection.
      response.json(
        GetCoordinatorViewResponse.parse(
          await projectState(state, { kind: 'coordinator' }),
        ),
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
      const undoInvalidated = await import('@workspace/db/game-store').then(
        ({ invalidateGameUndoWindow }) =>
          invalidateGameUndoWindow(
            gameId,
            state.version,
            options.testOnlyNow?.() ?? Date.now(),
          ),
      );
      if (!undoInvalidated) {
        sendError(
          response,
          409,
          'The game changed while opening the private screen. Refresh and try again.',
        );
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
        const pin = await hashConfiguredSeatPin(parsed.data.newPin);
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
            pinPepperVersion: pin.pepperVersion,
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
      const actorSeatId =
        actor.kind === 'player' ? actor.seatId : rehearsalSeatId;
      if (
        !(await checkGameplayCommandTypeRateLimit(
          commandActorId,
          parsed.data.type,
          actorSeatId,
          response,
        ))
      ) {
        sendCommandRateLimitError(response);
        return;
      }

      state ??= await loadGameState(gameId);
      if (!state) {
        sendError(response, 404, 'Not found');
        return;
      }
      if (
        !(await checkGameplayCommandAggregateRateLimit(
          commandActorId,
          parsed.data.type,
          actorSeatId,
          state.seats.length,
          response,
        ))
      ) {
        sendCommandRateLimitError(response);
        return;
      }
      if (
        !(await checkGameplayCommandIpRateLimit(
          request,
          gameId,
          state.seats.length,
          parsed.data.type,
          actorSeatId,
          response,
        ))
      ) {
        sendCommandRateLimitError(response);
        return;
      }

      const idempotency = {
        gameId,
        actorId: commandActorId,
        idempotencyKey: parsed.data.idempotencyKey,
        requestHash: requestHash(parsed.data),
      };
      const { appendGameEvents, readGameCommandResult, readGameUndoWindow } =
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
      if (
        !previous &&
        (parsed.data.type === 'SkipPendingAction' ||
          parsed.data.type === 'RemoveDisconnectedSeat')
      ) {
        const targetSeatId = parsed.data.seatId;
        const playerViewer = await viewerForRequest(request);
        const { getCoordinatorTakeoverRecord } =
          await import('@workspace/db/coordinator-access-store');
        const currentCoordinator = await getCoordinatorTakeoverRecord(
          gameId,
          options.testOnlyNow?.() ?? Date.now(),
        );
        const organiserSeatId =
          currentCoordinator?.holderSeatId ??
          (playerViewer.kind === 'player' ? playerViewer.seatId : undefined);
        if (organiserSeatId && organiserSeatId === targetSeatId) {
          sendError(response, 403, 'You cannot skip or remove your own seat.');
          return;
        }
        const { areGameSeatsDisconnected } =
          await import('@workspace/db/seat-presence-store');
        const disconnected = await areGameSeatsDisconnected({
          gameId,
          seatIds: [targetSeatId],
          now: options.testOnlyNow?.() ?? Date.now(),
        });
        const targetIsAlive = state.seats.some(
          (seat) => seat.id === targetSeatId && seat.status === 'alive',
        );
        if (
          !canOrganiserActOnDisconnectedSeat({
            targetSeatId,
            organiserSeatId,
            seatIsAlive: targetIsAlive,
            seatIsDisconnected: disconnected.includes(targetSeatId),
          })
        ) {
          if (!targetIsAlive) {
            sendError(response, 409, 'That player is no longer in the game.');
            return;
          }
          sendError(
            response,
            409,
            'That player has not been disconnected for 60 seconds. Wait, or ask them to reconnect before skipping or removing them.',
          );
          return;
        }
      }
      if (!previous && parsed.data.type === 'UndoCoordinatorAction') {
        const now = options.testOnlyNow?.() ?? Date.now();
        const undoWindow = await readGameUndoWindow(gameId, state.version, now);
        if (!undoWindow) {
          sendError(
            response,
            409,
            'The undo window has closed or the game has changed. No changes were made.',
          );
          return;
        }
        const undoEvent = eventSchema.parse({
          seq: state.version + 1,
          at: now,
          schemaVersion: 1,
          type: 'CoordinatorActionUndone',
          restoreState: undoWindow.state,
        });
        const nextState = replayFrom(state, [undoEvent]);
        const stored = await appendGameEvents({
          ...idempotency,
          expectedVersion: state.version,
          events: [undoEvent],
          snapshot: { seq: nextState.version, state: nextState },
          deadline: {
            kind: nextState.phase,
            dueAt: nextState.deadline,
          },
          undoConsume: { actionVersion: undoWindow.actionVersion, now },
        });
        if (!stored.ok) {
          sendError(
            response,
            409,
            'The undo window has closed or the game has changed. No changes were made.',
          );
          return;
        }
        await publishGame(gameId);
      } else if (!previous) {
        const voteSubmission = parsed.data.type === 'SubmitVote';
        const shadowChoiceSubmission =
          parsed.data.type === 'SubmitShadowChoice';
        const retriesVersionConflicts =
          voteSubmission || shadowChoiceSubmission;
        const privateAcknowledgement =
          parsed.data.type === 'AcknowledgePrivate';
        const attempts =
          retriesVersionConflicts || privateAcknowledgement ? 40 : 1;
        let committed = false;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          const now = options.testOnlyNow?.() ?? Date.now();
          const result = decide(state, parsed.data, {
            now,
            actor,
            random: options.testOnlyRandom ?? gameRandom,
            ...(testOnlyPhaseDurationMs === undefined
              ? {}
              : { testOnlyPhaseDurationMs }),
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
            ...(viewer.kind === 'coordinator' &&
            !rehearsalSeatId &&
            parsed.data.type !== 'EndGameEarly' &&
            !result.events.some(
              (event) =>
                event.type === 'GameFinished' ||
                (event.type === 'PhaseChanged' &&
                  ['DEAL', 'FINISHED', 'ARCHIVED'].includes(event.phase)),
            )
              ? { undoCapture: { state, expiresAt: now + 60_000 } }
              : {}),
          });
          if (stored.ok) {
            await publishGame(gameId);
            committed = true;
            break;
          }
          const retryableConflict =
            stored.code === 'VERSION_CONFLICT' &&
            (privateAcknowledgement || retriesVersionConflicts);
          if (!retryableConflict || attempt + 1 === attempts) {
            sendError(response, 409, 'Command rejected');
            return;
          }
          // Re-evaluate concurrent acknowledgements, votes and night choices
          // against the latest state rather than losing a valid tap to a
          // version conflict.
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
