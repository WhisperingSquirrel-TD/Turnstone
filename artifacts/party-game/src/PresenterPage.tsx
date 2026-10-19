import {
  useGetGameView,
  getGetGameViewQueryKey,
} from '@workspace/api-client-react';
import {
  presenterPairRequestSchema,
  presenterPairResponseSchema,
  type FullView,
} from '@workspace/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ComponentType, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { BrandFooter } from './BrandFooter';
import { GameConnectionStatus } from './GameConnectionStatus';
import {
  attachGameView,
  type GameConnectionState,
  type GameRealtimeSocket,
} from './game-socket';
import { apiUrl } from './api-url';
import { lobbyCodeJoinUrl } from './lobby-code-url';
import { config } from './config';
import { en } from './locale/en-GB';
import './PresenterPage.css';

function isFullView(view: unknown): view is FullView {
  return Boolean(view && typeof view === 'object' && 'seats' in view);
}

function phaseTitle(view: FullView): string {
  if (view.phase === 'LOBBY') return 'The lobby';
  if (view.phase === 'DEAL') return 'Role assignment';
  if (view.phase === 'DEBATE') return 'The conversation';
  if (view.phase === 'VOTE') return view.revote ? 'The re-vote' : 'The vote';
  if (view.phase === 'VERDICT') return 'The verdict';
  if (view.phase === 'SHADOW') return `Night ${view.cycle}`;
  if (view.phase === 'DAWN') return 'Morning';
  if (view.phase === 'ENDGAME') return 'End or continue';
  if (view.phase === 'FINAL_VOTE') return 'Endgame vote';
  if (view.phase === 'FINAL_BANISH') return 'Endgame verdict';
  if (view.phase === 'FINISHED') return 'Game complete';
  if (view.phase === 'MISSION') return 'Mission';
  if (view.phase === 'ARCHIVED') return 'Archived game';
  return 'Game setup';
}

function announcementText(view: FullView): string {
  const announcement = view.publicAnnouncement;
  if (!announcement) return '';
  if (announcement.kind === 'no_votes') return en.game.noVotesAnnouncement;
  if (announcement.kind === 'finished') return en.presenter.gameComplete;
  if (announcement.kind === 'verdict') {
    return `${announcement.seat.name} has been banished.`;
  }
  return announcement.victims.length
    ? en.game.publicLogDawn(announcement.victims.map((victim) => victim.name))
    : 'Nobody was taken in the night.';
}

function phaseCommentary(view: FullView): string | null {
  const remaining = view.seats.filter((seat) => seat.status === 'alive').length;
  if (view.phase === 'DEBATE')
    return en.presenter.dayCommentary(Math.max(1, view.cycle), remaining);
  if (view.phase === 'VOTE' || view.phase === 'FINAL_BANISH')
    return en.presenter.voteProgress(view.progress.done, view.progress.total);
  if (view.phase === 'SHADOW')
    return en.presenter.nightCommentary(Math.max(1, view.cycle));
  if (view.phase === 'ENDGAME')
    return en.presenter.endgameCommentary(
      remaining,
      view.endRule === 'unanimous',
    );
  if (view.phase === 'FINAL_VOTE')
    return en.presenter.finalVoteProgress(
      view.progress.done,
      view.progress.total,
    );
  return null;
}

function publicUpdate(entry: FullView['publicLog'][number]): string {
  if (entry.action === 'device_recovered')
    return en.game.publicLogDeviceRecovered(entry.name);
  if (entry.action === 'seat_pin_reset')
    return en.game.publicLogPinReset(entry.name);
  if (entry.action === 'dawn')
    return en.game.publicLogDawn(entry.victims.map((victim) => victim.name));
  if (entry.action === 'no_votes') return en.game.noVotesAnnouncement;
  if (entry.action === 'banishment')
    return en.game.publicLogBanishment(entry.seat.name);
  if (entry.action === 'seat_departed')
    return en.game.publicLogSeatDeparted(entry.seat.name);
  if (entry.action === 'schedule_shift')
    return en.game.publicLogScheduleShift(entry.minutes);
  if (entry.action === 'coordinator_undo')
    return en.game.publicLogCoordinatorUndo;
  return en.presenter.gameComplete;
}

export function PresenterPage({ csrfToken }: { csrfToken: string | null }) {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const [pairingCode, setPairingCode] = useState('');
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingError, setPairingError] = useState('');
  const [connectionStatus, setConnectionStatus] =
    useState<GameConnectionState>('connecting');
  const [clientNow, setClientNow] = useState(Date.now());
  const [serverOffset, setServerOffset] = useState(0);
  const gameQuery = useGetGameView(id, {
    query: { enabled: Boolean(id), queryKey: getGetGameViewQueryKey(id) },
    request: { credentials: 'include' },
  });
  const full =
    gameQuery.data && isFullView(gameQuery.data.view)
      ? gameQuery.data.view
      : null;
  const paired = Boolean(full);

  useEffect(() => {
    if (gameQuery.data) {
      setServerOffset(gameQuery.data.serverNow - Date.now());
    }
  }, [gameQuery.data?.serverNow]);

  useEffect(() => {
    const timer = window.setInterval(() => setClientNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!paired || !id) return;
    const api = new URL(config.apiOrigin ?? '/', window.location.origin);
    const prefix = api.pathname.replace(/\/+$/, '');
    const socket = io(api.origin, {
      path: `${prefix}/socket.io`,
      withCredentials: true,
      auth: { gameId: id },
    });
    const detach = attachGameView(
      socket as unknown as GameRealtimeSocket,
      id,
      (response) => {
        queryClient.setQueryData(getGetGameViewQueryKey(id), response);
      },
      setConnectionStatus,
    );
    return () => {
      detach();
      socket.disconnect();
    };
  }, [id, paired, queryClient]);

  async function pairScreen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPairingError('');
    if (!csrfToken) {
      setPairingError(en.presenter.securityPending);
      return;
    }
    const parsed = presenterPairRequestSchema.safeParse({
      gameId: id,
      code: pairingCode.trim(),
    });
    if (!parsed.success) {
      setPairingError(en.presenter.pairError);
      return;
    }
    setPairingBusy(true);
    try {
      const response = await fetch(
        apiUrl('/presenter/pair', config.apiOrigin),
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
          body: JSON.stringify(parsed.data),
        },
      );
      if (!response.ok) throw new Error('pairing-rejected');
      const result = presenterPairResponseSchema.parse(await response.json());
      queryClient.setQueryData(getGetGameViewQueryKey(id), result.game);
      setPairingCode('');
    } catch {
      setPairingError(en.presenter.pairError);
    } finally {
      setPairingBusy(false);
    }
  }

  if (gameQuery.isLoading)
    return (
      <div className="presenter-page">
        <PresenterHeader status={connectionStatus} />
        <main className="presenter-main" role="status">
          {en.presenter.loading}
        </main>
        <BrandFooter context="game" />
      </div>
    );
  if (gameQuery.isError || !gameQuery.data)
    return (
      <div className="presenter-page">
        <PresenterHeader status={connectionStatus} />
        <main className="presenter-main">
          <p role="alert">{en.presenter.notFound}</p>
        </main>
        <BrandFooter context="game" />
      </div>
    );
  if (!full)
    return (
      <div className="presenter-page">
        <PresenterHeader status={connectionStatus} />
        <main className="presenter-main">
          <section
            className="presenter-pair-card"
            data-testid="presenter-pairing-form"
          >
            <h1>{en.presenter.pairHeading}</h1>
            <p>{en.presenter.pairDescription}</p>
            <form className="grid gap-3" onSubmit={pairScreen}>
              <label htmlFor="presenter-pair-code">
                {en.presenter.pairCodeLabel}
              </label>
              <input
                id="presenter-pair-code"
                autoComplete="one-time-code"
                className="presenter-code-input"
                maxLength={43}
                value={pairingCode}
                onChange={(event) => setPairingCode(event.target.value)}
              />
              {pairingError && (
                <p className="presenter-error" role="alert">
                  {pairingError}
                </p>
              )}
              <button
                className="presenter-primary-action"
                type="submit"
                disabled={pairingBusy || pairingCode.trim().length !== 43}
              >
                {pairingBusy
                  ? en.presenter.pairPending
                  : en.presenter.pairButton}
              </button>
            </form>
          </section>
        </main>
        <BrandFooter context="game" />
      </div>
    );

  const joinPath = `${import.meta.env.BASE_URL.replace(/\/+$/, '')}${config.routes.join}`;
  const joinUrl = full.lobbyCode
    ? lobbyCodeJoinUrl({
        origin: window.location.origin,
        joinPath,
        code: full.lobbyCode,
      })
    : '';
  const resultLine = announcementText(full);
  const commentary = phaseCommentary(full);
  const serverTime = clientNow + serverOffset;
  const secondsRemaining =
    full.deadline === null
      ? null
      : Math.max(0, Math.ceil((full.deadline - serverTime) / 1000));

  return (
    <div className="presenter-page" data-testid="presenter-game-view">
      <PresenterHeader status={connectionStatus} />
      <main className="presenter-main">
        {full.gameName && (
          <p className="presenter-game-name">{full.gameName}</p>
        )}
        <h1>{phaseTitle(full)}</h1>
        {(full.paused || secondsRemaining !== null) && (
          <p className="presenter-countdown" data-testid="presenter-countdown">
            {full.paused
              ? en.presenter.paused
              : secondsRemaining === null
                ? ''
                : `${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, '0')}`}
          </p>
        )}
        {commentary && (
          <p className="presenter-commentary" aria-live="polite">
            {commentary}
          </p>
        )}
        {full.missionsEnabled && (
          <p className="presenter-pot">
            {en.presenter.prizePot(full.pot, full.unit)}
          </p>
        )}
        {full.phase === 'LOBBY' && full.lobbyCode && (
          <section
            className="presenter-lobby"
            aria-label={en.presenter.joinPrompt}
          >
            <div>
              <p>{en.presenter.joinPrompt}</p>
              <p
                className="presenter-lobby-code"
                data-testid="presenter-lobby-code"
              >
                {full.lobbyCode}
              </p>
              <p>{en.presenter.playersJoined(full.seats.length)}</p>
            </div>
            <div data-testid="presenter-join-qr">
              <PresenterQr value={joinUrl} title={en.presenter.qrLabel} />
            </div>
          </section>
        )}
        {resultLine && (
          <p className="presenter-announcement" aria-live="polite">
            {resultLine}
          </p>
        )}
        <section aria-labelledby="presenter-updates-heading">
          <h2 id="presenter-updates-heading">{en.presenter.latestUpdates}</h2>
          <ul className="presenter-updates">
            {full.publicLog
              .slice()
              .sort((first, second) => second.seq - first.seq)
              .slice(0, 5)
              .map((entry) => (
                <li key={entry.seq}>{publicUpdate(entry)}</li>
              ))}
            {full.publicLog.length === 0 && <li>{en.presenter.noUpdates}</li>}
          </ul>
        </section>
        {full.phase === 'FINISHED' && (
          <section aria-labelledby="presenter-results-heading">
            <h2 id="presenter-results-heading">{en.presenter.results}</h2>
            <p>{en.presenter.gameComplete}</p>
          </section>
        )}
      </main>
      <BrandFooter context="game" />
    </div>
  );
}

function PresenterHeader({ status }: { status: GameConnectionState }) {
  return (
    <header className="presenter-header">
      <span className="presenter-wordmark">
        Oath<span>stone</span>
      </span>
      <GameConnectionStatus status={status} />
    </header>
  );
}

function PresenterQr({ value, title }: { value: string; title: string }) {
  return (
    <div className="presenter-qr">
      {value ? (
        <QRCode value={value} title={title} />
      ) : (
        <span role="status">{en.presenter.waiting}</span>
      )}
    </div>
  );
}

function QRCode({ value, title }: { value: string; title: string }) {
  const [Component, setComponent] =
    useState<ComponentType<{ value: string; size: number; title?: string }>>();
  useEffect(() => {
    let active = true;
    void import('qrcode.react').then((module) => {
      if (active) setComponent(() => module.QRCodeSVG);
    });
    return () => {
      active = false;
    };
  }, []);
  return Component ? (
    <Component value={value} size={280} title={title} />
  ) : (
    <span role="status">{en.entry.qrPreparing}</span>
  );
}
