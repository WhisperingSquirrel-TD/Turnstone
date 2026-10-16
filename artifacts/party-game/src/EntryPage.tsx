import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { io } from 'socket.io-client';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  commandSchema,
  entryFailureMessages,
  gameConfigSchema,
  gameInviteResponseSchema,
  lateGameInviteResponseSchema,
  gameViewResponseSchema,
  guestJoinRequestSchema,
  joinNameCheckRequestSchema,
  joinNameCheckResponseSchema,
  joinRequestCreatedResponseSchema,
  joinRequestDecisionResponseSchema,
  joinRequestDecisionSchema,
  joinRequestStatusResponseSchema,
  isEntryFailureMessage,
  pendingJoinRequestsResponseSchema,
  rehearsalStartRequestSchema,
  shortCodeJoinRequestSchema,
  type FullView,
  type View,
} from '@workspace/shared';
import { config } from '@/config';
import { apiUrl as buildApiUrl } from '@/api-url';
import { en } from '@/locale/en-GB';
import {
  EntryExperience,
  type EntryExperienceBusy,
  type EntryExperienceErrors,
  type EntryExperienceInputs,
  type EntryExperienceOptions,
  type EntryScreen,
} from './EntryExperience';
import { attachGameView, type GameRealtimeSocket } from './game-socket';
import { lobbyCodeJoinUrl, parseLobbyCodeFragment } from './lobby-code-url';
import { recoverSeat } from './recovery-client';
import {
  EntryActionError,
  type EntryFailureMessage,
} from './entry-action-error';

const QRCode = lazy(async () => {
  const module = await import('qrcode.react');
  return {
    default: function LobbyQRCode({ value }: { value: string }) {
      return (
        <module.QRCodeSVG
          value={value}
          size={208}
          includeMargin
          fgColor="#16110D"
          bgColor="#FAFAF5"
          title={en.entry.qrAlt}
        />
      );
    },
  };
});

type Schema<T> = { parse(value: unknown): T };
type EntryMode = 'play' | 'join' | 'coordinate' | 'waiting';

interface EntryPageProps {
  mode: EntryMode;
  csrfToken: string | null;
}

class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message?: string) {
    super(message ?? (status === 503 ? 'busy' : 'request-failed'));
    this.status = status;
  }
}

async function createApiError(response: Response): Promise<ApiRequestError> {
  const body: unknown = await response.json().catch(() => null);
  const message =
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    isEntryFailureMessage(body.error)
      ? body.error
      : undefined;
  return new ApiRequestError(response.status, message);
}

function joinFailureMessage(error: unknown): EntryFailureMessage {
  if (error instanceof ApiRequestError) {
    if (isEntryFailureMessage(error.message)) return error.message;
    if (error.status === 404) return entryFailureMessages.gameCodeUnavailable;
    if (error.status === 409) return entryFailureMessages.joinRequestNotSaved;
    if (error.status === 429) return entryFailureMessages.joinRateLimited;
    if (error.status === 401) return entryFailureMessages.joinPinMismatch;
    if (error.status === 400 || error.status === 403) {
      return entryFailureMessages.securityCheck;
    }
    if (error.status >= 500) return entryFailureMessages.serviceUnavailable;
  }
  if (error instanceof Error && error.message === 'security-not-ready') {
    return entryFailureMessages.securityCheck;
  }
  return entryFailureMessages.joinNetwork;
}

function nameCheckFailureMessage(error: unknown): EntryFailureMessage {
  if (error instanceof ApiRequestError) {
    if (isEntryFailureMessage(error.message)) return error.message;
    if (error.status === 404) return entryFailureMessages.gameCodeUnavailable;
    if (error.status === 409) {
      return entryFailureMessages.gameNotAcceptingPlayers;
    }
    if (error.status === 429) return entryFailureMessages.joinRateLimited;
    if (error.status === 403 || error.status === 400) {
      return entryFailureMessages.securityCheck;
    }
    if (error.status === 503) return entryFailureMessages.nameCheckFailed;
  }
  if (error instanceof Error && error.message === 'security-not-ready') {
    return entryFailureMessages.securityCheck;
  }
  return entryFailureMessages.nameCheckFailed;
}

function apiUrl(path: string): string {
  return buildApiUrl(path, config.apiOrigin);
}

async function getJson<T>(path: string, schema: Schema<T>): Promise<T> {
  const response = await fetch(apiUrl(path), { credentials: 'include' });
  if (!response.ok) throw await createApiError(response);
  return schema.parse(await response.json());
}

async function postJson<T>(
  path: string,
  body: unknown,
  schema: Schema<T>,
  csrfToken: string | null,
): Promise<T> {
  if (!csrfToken) throw new Error('security-not-ready');
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await createApiError(response);
  return schema.parse(await response.json());
}

function isFullView(view: View): view is FullView {
  return 'id' in view && 'seats' in view;
}

function webPath(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  return `${base}${path}`;
}

function invitationUrl(gameId: string, inviteUrl: string): string {
  const token = new URL(inviteUrl).hash.slice(1);
  return `${window.location.origin}${webPath(
    `/join/${encodeURIComponent(gameId)}`,
  )}#${token}`;
}

function readEntryOptions(): EntryExperienceOptions {
  if (typeof window === 'undefined') {
    return { tapToReveal: false, largeText: false, simpleLanguage: false };
  }
  try {
    const raw = sessionStorage.getItem(
      `${config.appName.toLowerCase()}-display-options`,
    );
    if (!raw)
      return { tapToReveal: false, largeText: false, simpleLanguage: false };
    const value = JSON.parse(raw) as Partial<EntryExperienceOptions>;
    return {
      tapToReveal: value.tapToReveal === true,
      largeText: value.largeText === true,
      simpleLanguage: value.simpleLanguage === true,
    };
  } catch {
    return { tapToReveal: false, largeText: false, simpleLanguage: false };
  }
}

function initialScreen(
  mode: EntryMode,
  hasGameQuery: boolean,
  hasInviteFragment: boolean,
  entryIntent: string | null,
): EntryScreen {
  if (mode === 'coordinate' || hasGameQuery) return 'lobby';
  if (mode === 'waiting') return 'join-wait';
  if (mode === 'join') return hasInviteFragment ? 'join-name' : 'join-code';
  if (mode === 'play' && entryIntent === 'create') return 'create-name';
  if (mode === 'play' && entryIntent === 'rehearsal') return 'rehearsal-setup';
  return 'welcome';
}

export function EntryPage({ mode, csrfToken }: EntryPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ gameId: string; id: string; requestId: string }>();
  const queryGameId = new URLSearchParams(location.search).get('game');
  const entryIntent = new URLSearchParams(location.search).get('entry');
  const coordinatorGameId =
    mode === 'coordinate' ? params.id : mode === 'play' ? queryGameId : null;
  const inviteGameId = mode === 'join' ? params.gameId : null;
  const requestId = mode === 'waiting' ? params.requestId : null;
  const [screen, setScreen] = useState<EntryScreen>(() =>
    initialScreen(
      mode,
      Boolean(queryGameId),
      typeof window !== 'undefined' && Boolean(window.location.hash),
      entryIntent,
    ),
  );
  const [inputs, setInputs] = useState<EntryExperienceInputs>({
    joinCodeEntry: '',
    joinName: '',
    joinPin: '',
    createGameName: '',
    createPlayerCount: 15,
    organiserName: '',
    organiserPin: '',
    rehearsalPlayerCount: 8,
    rehearsalSpeed: 'fast',
    rehearsalName: '',
  });
  const [options, setOptions] =
    useState<EntryExperienceOptions>(readEntryOptions);
  const [joinRequestId, setJoinRequestId] = useState<string | null>(
    requestId ?? null,
  );
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [coordinatorView, setCoordinatorView] = useState<FullView | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [invitationKind, setInvitationKind] = useState<'lobby' | 'late' | null>(
    null,
  );
  const [coordinatorAuthorised, setCoordinatorAuthorised] = useState(false);
  const [pendingJoiners, setPendingJoiners] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [errors, setErrors] = useState<EntryExperienceErrors>({});
  const [busy, setBusy] = useState<EntryExperienceBusy>({
    join: false,
    create: false,
    approveJoinerIds: [],
    startGame: false,
    rehearsal: false,
    share: false,
  });
  const mounted = useRef(true);
  const lateJoinMode = Boolean(
    coordinatorView && !['DRAFT', 'LOBBY'].includes(coordinatorView.phase),
  );

  useEffect(() => {
    if (
      coordinatorView?.phase !== 'LOBBY' &&
      (invitationKind === 'lobby' ||
        ['FINISHED', 'ARCHIVED'].includes(coordinatorView?.phase ?? ''))
    ) {
      setJoinCode('');
      setShareUrl('');
      setInvitationKind(null);
    }
  }, [coordinatorView?.phase, invitationKind]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setScreen(
      initialScreen(
        mode,
        Boolean(queryGameId),
        Boolean(window.location.hash),
        entryIntent,
      ),
    );
  }, [entryIntent, mode, queryGameId]);

  useEffect(() => {
    if (mode !== 'join' || !window.location.hash) return;
    const fragment = window.location.hash.slice(1);
    const lobbyCode = parseLobbyCodeFragment(fragment);
    if (inviteGameId && /^[A-Za-z0-9_-]{43}$/.test(fragment)) {
      const token = fragment;
      setInviteToken(token);
      setScreen('join-name');
    } else if (lobbyCode) {
      setInviteToken(null);
      setInputs((current) => ({
        ...current,
        joinCodeEntry: lobbyCode,
      }));
      setScreen('join-name');
    } else {
      setInviteToken(null);
      setScreen('join-code');
    }
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}`,
    );
  }, [inviteGameId, mode]);

  const updateInput = useCallback(
    (field: keyof EntryExperienceInputs, value: string | number) => {
      setInputs((current) => ({ ...current, [field]: value }));
    },
    [],
  );

  const loadPendingJoiners = useCallback(async (gameId: string) => {
    const result = await getJson(
      `/games/${encodeURIComponent(gameId)}/join-requests`,
      pendingJoinRequestsResponseSchema,
    );
    if (mounted.current) {
      setPendingJoiners(result.requests.map(({ id, name }) => ({ id, name })));
      setCoordinatorAuthorised(true);
    }
  }, []);

  const loadCoordinatorView = useCallback(async (gameId: string) => {
    const response = await getJson(
      `/games/${encodeURIComponent(gameId)}/view`,
      gameViewResponseSchema,
    );
    if (!isFullView(response.view))
      throw new Error('coordinator-view-unavailable');
    if (mounted.current) setCoordinatorView(response.view);
    return response.view;
  }, []);

  const createLobbyInvite = useCallback(
    async (gameId: string) => {
      if (!csrfToken) return;
      const invite = await postJson(
        `/games/${encodeURIComponent(gameId)}/invites`,
        {},
        gameInviteResponseSchema,
        csrfToken,
      );
      if (!mounted.current) return;
      setJoinCode(invite.shortCode);
      setShareUrl(invitationUrl(gameId, invite.joinUrl));
      setInvitationKind('lobby');
    },
    [csrfToken],
  );

  useEffect(() => {
    if (!coordinatorGameId || !csrfToken) return;
    let active = true;
    let socket: ReturnType<typeof io> | null = null;
    let detach: (() => void) | null = null;

    const load = async () => {
      try {
        const view = await loadCoordinatorView(coordinatorGameId);
        await loadPendingJoiners(coordinatorGameId);
        if (view.phase === 'LOBBY' && !shareUrl) {
          await createLobbyInvite(coordinatorGameId);
        }
        if (!active) return;
      } catch (error) {
        if (active)
          setErrors((current) => ({
            ...current,
            approve:
              error instanceof ApiRequestError && error.status === 401
                ? en.entry.organiserOnly
                : en.entry.errorFallback,
          }));
      }
    };
    void load();

    const api = new URL(config.apiOrigin ?? '/', window.location.origin);
    const prefix = api.pathname.replace(/\/+$/, '');
    socket = io(api.origin, {
      path: `${prefix}/socket.io`,
      withCredentials: true,
      auth: { gameId: coordinatorGameId },
    });
    detach = attachGameView(
      socket as unknown as GameRealtimeSocket,
      coordinatorGameId,
      (response) => {
        if (isFullView(response.view)) setCoordinatorView(response.view);
        void loadPendingJoiners(coordinatorGameId);
      },
    );

    return () => {
      active = false;
      detach?.();
      socket?.disconnect();
    };
  }, [coordinatorGameId, csrfToken]);

  async function join(data: {
    shortCode: string;
    name: string;
    pin: string;
  }): Promise<void> {
    setErrors({});
    setBusy((current) => ({ ...current, join: true }));
    try {
      const requestBody = inviteToken
        ? guestJoinRequestSchema.parse({
            inviteToken,
            name: data.name,
            pin: data.pin,
            idempotencyKey: crypto.randomUUID(),
          })
        : shortCodeJoinRequestSchema.parse({
            shortCode: data.shortCode,
            name: data.name,
            pin: data.pin,
            idempotencyKey: crypto.randomUUID(),
          });
      const result = await postJson(
        inviteToken
          ? `/games/${encodeURIComponent(inviteGameId ?? '')}/join`
          : '/join',
        requestBody,
        joinRequestCreatedResponseSchema,
        csrfToken,
      );
      setJoinRequestId(result.requestId);
      setInviteToken(null);
      navigate(
        webPath(`/join-request/${encodeURIComponent(result.requestId)}`),
      );
    } catch (error) {
      const message = joinFailureMessage(error);
      setErrors((current) => ({
        ...current,
        join: message,
      }));
      throw new EntryActionError(message);
    } finally {
      setBusy((current) => ({ ...current, join: false }));
    }
  }

  async function checkJoinName(data: {
    shortCode: string;
    name: string;
  }): Promise<'available' | 'duplicate' | 'reserved'> {
    const requestBody = inviteToken
      ? joinNameCheckRequestSchema.parse({
          gameId: inviteGameId,
          inviteToken,
          name: data.name,
        })
      : joinNameCheckRequestSchema.parse({
          shortCode: data.shortCode,
          name: data.name,
        });
    try {
      const result = await postJson(
        '/join/name-check',
        requestBody,
        joinNameCheckResponseSchema,
        csrfToken,
      );
      return result.status;
    } catch (error) {
      throw new EntryActionError(nameCheckFailureMessage(error));
    }
  }

  async function recoverExistingSeat(data: {
    shortCode: string;
    name: string;
    pin: string;
  }): Promise<void> {
    const recovered = await recoverSeat({
      apiOrigin: config.apiOrigin,
      csrfToken,
      ...(inviteToken && inviteGameId
        ? { gameId: inviteGameId, inviteToken }
        : { shortCode: data.shortCode }),
      name: data.name,
      pin: data.pin,
    });
    if (!isFullView(recovered.view)) {
      throw new EntryActionError(entryFailureMessages.recoveryUnavailable);
    }
    navigate(webPath(`/game/${encodeURIComponent(recovered.view.id)}`));
  }

  const checkJoinStatus = useCallback(async () => {
    const targetRequestId = requestId ?? joinRequestId;
    if (!targetRequestId) return;
    setBusy((current) => ({ ...current, join: true }));
    setErrors((current) => ({ ...current, join: undefined }));
    try {
      const status = await getJson(
        `/join-requests/${encodeURIComponent(targetRequestId)}`,
        joinRequestStatusResponseSchema,
      );
      if (status.status === 'rejected') {
        setErrors((current) => ({ ...current, join: en.entry.joinRejected }));
      } else if (status.status === 'approved') {
        if (!isFullView(status.game.view)) {
          setErrors((current) => ({
            ...current,
            join: en.entry.errorFallback,
          }));
          return;
        }
        navigate(webPath(`/game/${encodeURIComponent(status.game.view.id)}`));
      }
    } catch {
      setErrors((current) => ({ ...current, join: en.entry.statusError }));
    } finally {
      setBusy((current) => ({ ...current, join: false }));
    }
  }, [joinRequestId, navigate, requestId]);

  useEffect(() => {
    if (mode !== 'waiting' || !requestId) return;
    void checkJoinStatus();
    const onPageShow = () => void checkJoinStatus();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void checkJoinStatus();
    };
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [checkJoinStatus, mode, requestId]);

  async function createGame(data: {
    gameName: string;
    playerCount: number;
    organiserName: string;
    organiserPin: string;
  }): Promise<void> {
    setErrors({});
    setBusy((current) => ({ ...current, create: true }));
    try {
      if (!csrfToken) throw new Error('security-not-ready');
      const id = crypto.randomUUID();
      const configValue = gameConfigSchema.parse({
        basics: {
          gameName: data.gameName,
          coordinatorPlays: true,
          coCoordinators: 0,
        },
        players: { count: data.playerCount },
      });
      const command = commandSchema.parse({
        type: 'CreateGame',
        id,
        idempotencyKey: crypto.randomUUID(),
        config: configValue,
      });
      const created = await postJson(
        '/games',
        command,
        gameViewResponseSchema,
        csrfToken,
      );
      if (!isFullView(created.view)) throw new Error('game-view-unavailable');
      const lobby = await postJson(
        `/games/${encodeURIComponent(id)}/commands`,
        commandSchema.parse({
          type: 'AdvancePhase',
          expectedVersion: created.view.version,
          idempotencyKey: crypto.randomUUID(),
        }),
        gameViewResponseSchema,
        csrfToken,
      );
      if (!isFullView(lobby.view)) throw new Error('game-view-unavailable');
      const invite = await postJson(
        `/games/${encodeURIComponent(id)}/invites`,
        {},
        gameInviteResponseSchema,
        csrfToken,
      );
      const joinRequest = await postJson(
        '/join',
        shortCodeJoinRequestSchema.parse({
          shortCode: invite.shortCode,
          name: data.organiserName,
          pin: data.organiserPin,
          idempotencyKey: crypto.randomUUID(),
        }),
        joinRequestCreatedResponseSchema,
        csrfToken,
      );
      const pending = await getJson(
        `/games/${encodeURIComponent(id)}/join-requests`,
        pendingJoinRequestsResponseSchema,
      );
      const self = pending.requests.find(
        (request) => request.name === data.organiserName,
      );
      if (!self) throw new Error('organiser-seat-request-missing');
      await postJson(
        `/games/${encodeURIComponent(id)}/join-requests/${encodeURIComponent(self.id)}/decision`,
        joinRequestDecisionSchema.parse({
          decision: 'approve',
          expectedVersion: lobby.view.version,
        }),
        joinRequestDecisionResponseSchema,
        csrfToken,
      );
      const approved = await getJson(
        `/join-requests/${encodeURIComponent(joinRequest.requestId)}`,
        joinRequestStatusResponseSchema,
      );
      if (approved.status !== 'approved' || !isFullView(approved.game.view)) {
        throw new Error('organiser-seat-not-approved');
      }
      navigate(
        webPath(
          `/play?game=${encodeURIComponent(id)}&players=${encodeURIComponent(String(data.playerCount))}`,
        ),
        {
          replace: true,
        },
      );
      setScreen('lobby');
    } catch (error) {
      setErrors((current) => ({
        ...current,
        create:
          error instanceof Error && error.message === 'security-not-ready'
            ? en.app.securityPreparing
            : error instanceof ApiRequestError && error.status === 503
              ? en.entry.busy
              : en.entry.errorFallback,
      }));
      throw error;
    } finally {
      setBusy((current) => ({ ...current, create: false }));
    }
  }

  async function approveJoiner(joinerId: string): Promise<void> {
    if (!coordinatorGameId || !coordinatorView) return;
    setBusy((current) => ({
      ...current,
      approveJoinerIds: [...current.approveJoinerIds, joinerId],
    }));
    setErrors((current) => ({ ...current, approve: undefined }));
    try {
      await postJson(
        `/games/${encodeURIComponent(coordinatorGameId)}/join-requests/${encodeURIComponent(joinerId)}/decision`,
        joinRequestDecisionSchema.parse({
          decision: 'approve',
          expectedVersion: coordinatorView.version,
        }),
        joinRequestDecisionResponseSchema,
        csrfToken,
      );
      await loadCoordinatorView(coordinatorGameId);
      await loadPendingJoiners(coordinatorGameId);
    } catch {
      setErrors((current) => ({ ...current, approve: en.entry.errorFallback }));
    } finally {
      setBusy((current) => ({
        ...current,
        approveJoinerIds: current.approveJoinerIds.filter(
          (id) => id !== joinerId,
        ),
      }));
    }
  }

  async function startGame(): Promise<void> {
    if (!coordinatorGameId || !coordinatorView) return;
    if (lateJoinMode) {
      navigate(webPath(`/game/${encodeURIComponent(coordinatorGameId)}`));
      return;
    }
    setBusy((current) => ({ ...current, startGame: true }));
    setErrors((current) => ({ ...current, startGame: undefined }));
    try {
      await postJson(
        `/games/${encodeURIComponent(coordinatorGameId)}/commands`,
        commandSchema.parse({
          type: 'StartGame',
          expectedVersion: coordinatorView.version,
          idempotencyKey: crypto.randomUUID(),
        }),
        gameViewResponseSchema,
        csrfToken,
      );
      navigate(webPath(`/game/${encodeURIComponent(coordinatorGameId)}`));
    } catch {
      setErrors((current) => ({
        ...current,
        startGame: en.entry.errorFallback,
      }));
    } finally {
      setBusy((current) => ({ ...current, startGame: false }));
    }
  }

  async function rehearse(data: {
    playerCount: number;
    speed: 'fast' | 'normal';
    name: string;
  }): Promise<void> {
    setBusy((current) => ({ ...current, rehearsal: true }));
    setErrors((current) => ({ ...current, rehearsal: undefined }));
    try {
      const result = await postJson(
        '/rehearsals',
        rehearsalStartRequestSchema.parse({
          gameId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
          name: data.name,
          playerCount: data.playerCount,
          speed: data.speed,
        }),
        gameViewResponseSchema,
        csrfToken,
      );
      if (!isFullView(result.view))
        throw new Error('rehearsal-view-unavailable');
      navigate(webPath(`/game/${encodeURIComponent(result.view.id)}`));
    } catch (error) {
      setErrors((current) => ({
        ...current,
        rehearsal:
          error instanceof Error && error.message === 'security-not-ready'
            ? en.app.securityPreparing
            : en.entry.errorFallback,
      }));
      throw error;
    } finally {
      setBusy((current) => ({ ...current, rehearsal: false }));
    }
  }

  async function shareInvitation(url: string): Promise<void> {
    if (!url) return;
    setBusy((current) => ({ ...current, share: true }));
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title: config.appName, url });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError')
            return;
        }
      }
      await navigator.clipboard.writeText(url);
    } finally {
      setBusy((current) => ({ ...current, share: false }));
    }
  }

  const playerList = useMemo(
    () =>
      (coordinatorView?.seats ?? [])
        .filter((seat) => seat.status !== 'departed')
        .map(({ id, name }) => ({ id, name })),
    [coordinatorView],
  );
  const lobbyCodeUrl = joinCode
    ? lobbyCodeJoinUrl({
        origin: window.location.origin,
        joinPath: webPath(config.routes.join),
        code: joinCode,
      })
    : '';
  const visibleShareUrl =
    lateJoinMode && invitationKind !== 'late' ? '' : shareUrl;
  const qrUrl = lateJoinMode ? visibleShareUrl : lobbyCodeUrl;
  const qrCode = qrUrl ? (
    <Suspense fallback={<span aria-label={en.entry.qrPreparing}>…</span>}>
      <span data-testid="lobby-join-qr" data-join-url={qrUrl}>
        <QRCode value={qrUrl} />
      </span>
    </Suspense>
  ) : null;
  return (
    <EntryExperience
      copy={{
        ...en.entry,
        brand: config.appName,
        brandGoldSuffix: config.wordmarkAccentSuffix,
      }}
      screen={screen}
      lateJoinMode={lateJoinMode}
      inviteMode={Boolean(inviteToken)}
      inputs={inputs}
      onInputChange={updateInput}
      options={options}
      onOptionChange={(field, value) => {
        setOptions((current) => {
          const next = { ...current, [field]: value };
          try {
            sessionStorage.setItem(
              `${config.appName.toLowerCase()}-display-options`,
              JSON.stringify(next),
            );
          } catch {
            // Accessibility preferences remain available for this page session.
          }
          return next;
        });
      }}
      busy={busy}
      errors={errors}
      organiserDisplayName={en.entry.defaultOrganiser}
      defaultGameName={`${config.appName} game`}
      joinCode={lateJoinMode ? '' : joinCode}
      shareUrl={visibleShareUrl}
      qrCode={qrCode}
      players={playerList}
      requiredPlayerCount={
        Number(new URLSearchParams(location.search).get('players')) ||
        inputs.createPlayerCount
      }
      pendingJoiners={pendingJoiners}
      onJoin={join}
      onCheckJoinName={checkJoinName}
      onRecover={recoverExistingSeat}
      onCheckJoinStatus={checkJoinStatus}
      onCreate={createGame}
      onApproveJoiner={approveJoiner}
      onStartGame={startGame}
      onCreateLateInvite={
        coordinatorAuthorised
          ? async () => {
              if (!coordinatorGameId) return;
              setBusy((current) => ({ ...current, share: true }));
              setErrors((current) => ({ ...current, approve: undefined }));
              try {
                const invite = await postJson(
                  `/games/${encodeURIComponent(coordinatorGameId)}/late-invites`,
                  {},
                  lateGameInviteResponseSchema,
                  csrfToken,
                );
                setJoinCode('');
                setInvitationKind('late');
                setShareUrl(invitationUrl(coordinatorGameId, invite.joinUrl));
              } catch (error) {
                setShareUrl('');
                setInvitationKind(null);
                setErrors((current) => ({
                  ...current,
                  approve:
                    error instanceof ApiRequestError && error.status === 409
                      ? en.entry.lateInviteUnavailable
                      : en.entry.errorFallback,
                }));
              } finally {
                setBusy((current) => ({ ...current, share: false }));
              }
            }
          : undefined
      }
      onRehearsal={rehearse}
      onShare={shareInvitation}
      onClearSensitiveValues={() => {
        setInputs((current) => ({
          ...current,
          joinCodeEntry: '',
          joinPin: '',
          organiserPin: '',
        }));
        setInviteToken(null);
      }}
      onScreenChange={setScreen}
    />
  );
}
