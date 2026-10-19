import { useEffect, useState } from 'react';
import { config } from '@/config';
import { en } from '@/locale/en-GB';
import { apiUrl } from './api-url';

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

  useEffect(() => {
    if (hidden) return;
    let mounted = true;
    async function refresh() {
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
        if (!response.ok) throw new Error('Unable to check takeover status');
        const parsed = parseTakeoverStatus(await response.json());
        if (mounted) {
          setStatus(parsed);
          setError('');
        }
      } catch {
        if (mounted) setError(en.coordinator.takeoverError);
      }
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [gameId, hidden]);

  async function send(
    path: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    if (!csrfToken || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(apiUrl(path, config.apiOrigin), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      if (!response.ok) throw new Error('Takeover action failed');
      const result: unknown = await response.json();
      if (
        result &&
        typeof result === 'object' &&
        'status' in result &&
        result.status === 'transferred'
      ) {
        onTransferred();
        return;
      }
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
      if (!refreshed.ok) throw new Error('Unable to check takeover status');
      setStatus(parseTakeoverStatus(await refreshed.json()));
    } catch {
      setError(en.coordinator.takeoverError);
    } finally {
      setBusy(false);
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
            void send(`/games/${encodeURIComponent(gameId)}/takeover`)
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
              })
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
              })
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
            )
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
