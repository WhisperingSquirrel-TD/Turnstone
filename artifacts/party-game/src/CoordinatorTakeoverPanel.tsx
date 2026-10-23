import { useEffect, useRef, useState } from 'react';
import { config } from '@/config';
import { en } from '@/locale/en-GB';
import { apiUrl } from './api-url';
import { createAdaptivePoller } from './polling-backoff';

type TakeoverRequest = {
  id: string;
  requesterName: string;
  status: 'pending' | 'approved';
  yesVotes: number;
  noVotes: number;
  requiredVotes: number;
  expiresAt: number;
  viewerVote: boolean | null;
};

type TakeoverStatus = {
  eligible: boolean;
  mode: 'co-coordinator' | 'majority' | null;
  canRequest: boolean;
  canVote: boolean;
  canClaim: boolean;
  request: TakeoverRequest | null;
};

function parseTakeoverStatus(value: unknown): TakeoverStatus {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid takeover status');
  }
  const candidate = value as Partial<TakeoverStatus>;
  const request = candidate.request;
  const requestIsValid =
    request === null ||
    (typeof request === 'object' &&
      typeof request.id === 'string' &&
      typeof request.requesterName === 'string' &&
      (request.status === 'pending' || request.status === 'approved') &&
      Number.isInteger(request.yesVotes) &&
      Number.isInteger(request.noVotes) &&
      Number.isInteger(request.requiredVotes) &&
      Number.isInteger(request.expiresAt) &&
      (request.viewerVote === null || typeof request.viewerVote === 'boolean'));
  if (
    typeof candidate.eligible !== 'boolean' ||
    ![null, 'co-coordinator', 'majority'].includes(candidate.mode ?? null) ||
    typeof candidate.canRequest !== 'boolean' ||
    typeof candidate.canVote !== 'boolean' ||
    typeof candidate.canClaim !== 'boolean' ||
    !requestIsValid
  ) {
    throw new Error('Invalid takeover status');
  }
  return candidate as TakeoverStatus;
}

function responseError(message: string, response: Response) {
  return Object.assign(new Error(message), {
    status: response.status,
    headers: response.headers,
  });
}

export function CoordinatorTakeoverPanel({
  gameId,
  csrfToken,
  hidden,
  onTransferred,
}: {
  gameId: string;
  csrfToken: string | null;
  hidden: boolean;
  onTransferred: () => void;
}) {
  const [status, setStatus] = useState<TakeoverStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const latest = useRef({ gameId, hidden, csrfToken, onTransferred });
  latest.current = { gameId, hidden, csrfToken, onTransferred };
  const action = useRef({
    gameId,
    inFlight: false,
    transferred: false,
    notified: false,
    active: false,
  });
  if (action.current.gameId !== gameId) {
    action.current = {
      gameId,
      inFlight: false,
      transferred: false,
      notified: false,
      active: false,
    };
  }

  function notifyTransferred() {
    const current = action.current;
    if (
      current.transferred &&
      current.active &&
      !current.notified &&
      latest.current.gameId === current.gameId &&
      !latest.current.hidden
    ) {
      current.notified = true;
      latest.current.onTransferred();
    }
  }

  useEffect(() => {
    const lifecycle = action.current;
    lifecycle.active = !hidden;
    if (hidden) return;
    notifyTransferred();
    let mounted = true;
    async function refresh() {
      if (action.current.transferred) return;
      try {
        const response = await fetch(
          apiUrl(
            `/games/${encodeURIComponent(gameId)}/takeover`,
            config.apiOrigin,
          ),
          { credentials: 'include', cache: 'no-store' },
        );
        if (response.status === 401 || response.status === 403) {
          if (mounted) {
            setStatus(null);
            setError('');
          }
          return;
        }
        if (!response.ok)
          throw responseError('Unable to check takeover status', response);
        const parsed = parseTakeoverStatus(await response.json());
        if (mounted) {
          setStatus(parsed);
          setError('');
          // Only the server-selected automatic recipient may claim without
          // consent. Explicit majority requests always keep their button.
          if (
            parsed.eligible &&
            parsed.mode === 'co-coordinator' &&
            parsed.canClaim &&
            parsed.request === null
          ) {
            await send(`/games/${encodeURIComponent(gameId)}/takeover/claim`);
          }
        }
      } catch (error) {
        if (mounted) setError(en.coordinator.takeoverError);
        throw error;
      }
    }
    const poller = createAdaptivePoller(refresh, {
      baseIntervalMs: 15_000,
      maxIntervalMs: 120_000,
    });
    poller.start();
    return () => {
      mounted = false;
      lifecycle.active = false;
      poller.stop();
    };
    // Callback identity and mutation state must not restart polling/retries.
    // send/notifyTransferred read the latest props through refs.
  }, [gameId, hidden, csrfToken]);

  async function send(
    path: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    const current = action.current;
    const context = latest.current;
    if (
      !context.csrfToken ||
      context.hidden ||
      context.gameId !== gameId ||
      current.inFlight ||
      current.transferred
    )
      return;
    current.inFlight = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(apiUrl(path, config.apiOrigin), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': context.csrfToken,
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      if (!response.ok) throw responseError('Takeover action failed', response);
      const result: unknown = await response.json();
      if (
        result &&
        typeof result === 'object' &&
        'status' in result &&
        result.status === 'transferred'
      ) {
        current.transferred = true;
        if (action.current === current) notifyTransferred();
        return;
      }
      if (path.endsWith('/takeover/claim'))
        throw new Error('Invalid takeover claim response');
      if (action.current !== current) return;
      if (
        result &&
        typeof result === 'object' &&
        'status' in result &&
        result.status === 'pending'
      ) {
        setMessage(en.coordinator.takeoverRequested);
      }
      const refreshed = await fetch(
        apiUrl(
          `/games/${encodeURIComponent(gameId)}/takeover`,
          config.apiOrigin,
        ),
        { credentials: 'include', cache: 'no-store' },
      );
      if (!refreshed.ok)
        throw responseError('Unable to check takeover status', refreshed);
      setStatus(parseTakeoverStatus(await refreshed.json()));
    } catch (error) {
      if (action.current === current) setError(en.coordinator.takeoverError);
      throw error;
    } finally {
      current.inFlight = false;
      if (action.current === current) setBusy(false);
    }
  }

  if (hidden || !status?.eligible) return null;
  const request = status.request;

  return (
    <aside
      className="mt-6 grid gap-3 border-t border-stone pt-4"
      aria-label={en.coordinator.takeoverHeading}
      data-testid="coordinator-takeover"
    >
      <h2 className="display text-xl">{en.coordinator.takeoverHeading}</h2>
      {status.mode === 'co-coordinator' && (
        <p className="text-ash">{en.coordinator.takeoverPrompt}</p>
      )}
      {status.mode === 'majority' && !request && (
        <p className="text-ash">{en.coordinator.takeoverRequestHelp}</p>
      )}
      {request && (
        <div role="status" className="grid gap-2 text-sm text-ash">
          <p>{en.coordinator.takeoverApprovalPrompt(request.requesterName)}</p>
          <p>
            {en.coordinator.takeoverVotes(
              request.yesVotes,
              request.noVotes,
              request.requiredVotes,
            )}
          </p>
          {request.status === 'approved' && status.canClaim && (
            <p>{en.coordinator.takeoverApproved}</p>
          )}
        </div>
      )}
      {status.canRequest && (
        <button
          className="entry-secondary-action"
          type="button"
          disabled={busy || !csrfToken}
          onClick={() =>
            void send(`/games/${encodeURIComponent(gameId)}/takeover`).catch(
              () => undefined,
            )
          }
        >
          {busy
            ? en.coordinator.takeoverPending
            : en.coordinator.takeoverRequest}
        </button>
      )}
      {status.canVote && request && (
        <div className="grid grid-cols-2 gap-3">
          <button
            className="entry-secondary-action"
            type="button"
            disabled={busy || !csrfToken}
            onClick={() =>
              void send(`/games/${encodeURIComponent(gameId)}/takeover/vote`, {
                requestId: request.id,
                approve: true,
              }).catch(() => undefined)
            }
          >
            {en.coordinator.takeoverApprove}
          </button>
          <button
            className="entry-secondary-action"
            type="button"
            disabled={busy || !csrfToken}
            onClick={() =>
              void send(`/games/${encodeURIComponent(gameId)}/takeover/vote`, {
                requestId: request.id,
                approve: false,
              }).catch(() => undefined)
            }
          >
            {en.coordinator.takeoverDecline}
          </button>
        </div>
      )}
      {status.canClaim && (
        <button
          className="entry-secondary-action"
          type="button"
          disabled={busy || !csrfToken}
          onClick={() =>
            void send(
              `/games/${encodeURIComponent(gameId)}/takeover/claim`,
              request ? { requestId: request.id } : undefined,
            ).catch(() => undefined)
          }
        >
          {en.coordinator.takeoverClaim}
        </button>
      )}
      {error && (
        <p role="alert" className="entry-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-ash">
          {message}
        </p>
      )}
    </aside>
  );
}
