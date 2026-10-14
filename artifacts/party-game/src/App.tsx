import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  getGetGameViewQueryKey,
  setBaseUrl,
  useGetGameView,
  useRevealPrivateView,
  useSubmitGameCommand,
} from '@workspace/api-client-react';
import type {
  FullView,
  GameViewResponse,
  PrivateView,
  VisitorView,
} from '@workspace/api-client-react';
import { config } from '@/config';
import { apiUrl } from './api-url';
import { en } from '@/locale/en-GB';
import { attachGameView, type GameRealtimeSocket } from './game-socket';
import { EntryPage } from './EntryPage';
import { HoldRoleDemo } from './HoldRoleDemo';
import { getPublicFacts } from './public-site-content';
import './public-home.css';

setBaseUrl(config.apiOrigin);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
const csrfContext = createContext<string | null>(null);
type InstallOutcome = 'accepted' | 'dismissed';
type BeforeInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: InstallOutcome }>;
};
const installContext = createContext<{
  available: boolean;
  install: () => Promise<InstallOutcome | null>;
}>({
  available: false,
  install: async () => null,
});
const requestHeaders = (token: string | null) => ({
  credentials: 'include' as const,
  headers: new Headers(token ? { 'X-CSRF-Token': token } : undefined),
});
const idempotencyKey = () => crypto.randomUUID();
type WakeLockSentinelLike = { release: () => Promise<void> };
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
};

function InstallPromptProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<BeforeInstallPrompt | null>(null);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPrompt);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!prompt) return null;
    await prompt.prompt();
    const result = await prompt.userChoice;
    setPrompt(null);
    return result.outcome;
  }, [prompt]);
  const value = useMemo(
    () => ({ available: prompt !== null, install }),
    [prompt, install],
  );

  return (
    <installContext.Provider value={value}>{children}</installContext.Provider>
  );
}

function CsrfProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(apiUrl('/csrf', config.apiOrigin), { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Security check unavailable');
        const result = (await response.json()) as { csrfToken?: unknown };
        if (typeof result.csrfToken !== 'string')
          throw new Error('Invalid security token');
        if (active) setToken(result.csrfToken);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <csrfContext.Provider value={token}>
      {children}
      {failed && (
        <div
          role="alert"
          className="safe-page fixed inset-x-0 bottom-0 z-20 border-t border-gilt bg-hearth text-candle"
        >
          <p>{en.app.securityUnavailable}</p>
          <button
            className="quiet-action mt-2"
            type="button"
            onClick={() => window.location.reload()}
          >
            {en.app.tryAgain}
          </button>
        </div>
      )}
    </csrfContext.Provider>
  );
}

function Shell({
  children,
  isPlayer = false,
}: {
  children: ReactNode;
  isPlayer?: boolean;
}) {
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  );
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);
  useEffect(() => {
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const isIOSStandalone = () =>
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const updateDisplayMode = () =>
      setStandalone(displayMode.matches || isIOSStandalone());
    updateDisplayMode();
    displayMode.addEventListener('change', updateDisplayMode);
    return () => displayMode.removeEventListener('change', updateDisplayMode);
  }, []);
  return (
    <div className="safe-page flex min-h-[100dvh] flex-col">
      <a
        href="#main"
        className="absolute left-3 top-3 z-10 -translate-y-20 rounded-sm bg-candle px-3 py-2 font-medium text-charcoal focus:translate-y-0"
      >
        {en.skip}
      </a>
      <header className="public-home-brand public-shell-header mx-auto w-full max-w-5xl">
        <a
          href={config.routes.home}
          aria-label={config.appName}
          className="turnstone-wordmark"
        >
          <span>
            {config.appName.slice(0, -config.wordmarkAccentSuffix.length)}
          </span>
          <span className="text-gilt">{config.wordmarkAccentSuffix}</span>
        </a>
        <nav
          aria-label={en.nav.label}
          className={`public-home-nav text-sm text-ash ${isPlayer ? 'player-status-nav' : ''}`}
        >
          {!isPlayer && (
            <>
              <Link
                className="underline-offset-4 hover:underline"
                to={config.routes.home}
              >
                {en.nav.home}
              </Link>
              <Link
                className="underline-offset-4 hover:underline"
                to={config.routes.faq}
              >
                {en.publicSite.faqHeading}
              </Link>
              <Link
                className="underline-offset-4 hover:underline"
                to={config.routes.compare}
              >
                {en.publicSite.compareHeading}
              </Link>
              <Link
                className="underline-offset-4 hover:underline"
                to={config.routes.play}
              >
                {en.nav.play}
              </Link>
            </>
          )}
          {isPlayer && (
            <span
              role="status"
              aria-label={en.app.connectionStatus}
              className="inline-flex items-center gap-2"
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${isOnline ? 'bg-gilt' : 'bg-ash'}`}
              />
              {isOnline ? en.app.online : en.app.offline}
            </span>
          )}
          {isPlayer && standalone && (
            <>
              <button
                className="quiet-action"
                type="button"
                onClick={() => {
                  if (window.history.length > 1) navigate(-1);
                  else navigate(config.routes.play);
                }}
              >
                {en.app.back}
              </button>
              <button
                className="quiet-action"
                type="button"
                onClick={() => window.location.reload()}
              >
                {en.app.refresh}
              </button>
            </>
          )}
        </nav>
        {!isPlayer && (
          <details className="public-home-menu">
            <summary>{en.nav.menu}</summary>
            <div>
              <Link to={config.routes.home}>{en.nav.home}</Link>
              <Link to={config.routes.faq}>{en.publicSite.faqHeading}</Link>
              <Link to={config.routes.compare}>
                {en.publicSite.compareHeading}
              </Link>
              <Link to={config.routes.play}>{en.nav.play}</Link>
            </div>
          </details>
        )}
        <Link
          to={config.routes.home}
          aria-label={en.app.turnstoneHomeLink}
          className="public-home-brand-mark inline-flex min-h-11 min-w-11 items-center justify-center"
          data-testid="link-turnstone-mark"
        >
          <img
            className="brand-mark-small"
            src={`${import.meta.env.BASE_URL}${config.appIconPath}`}
            alt=""
          />
        </Link>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl flex-1 py-10 sm:py-16"
      >
        {children}
      </main>
      <footer className="mx-auto mt-8 flex w-full max-w-5xl items-center justify-between border-t border-stone py-5 text-sm text-ash">
        <small>{config.byline}</small>
        <a
          href={config.organisation.url}
          target={isPlayer ? '_blank' : undefined}
          rel={isPlayer ? 'noopener noreferrer' : undefined}
          aria-label={en.app.brandLink}
          className="inline-flex min-h-11 min-w-11 items-center justify-center"
        >
          <img
            className="brand-mark-small"
            src={`${import.meta.env.BASE_URL}${config.stackstoneIconPath}`}
            alt=""
          />
        </a>
      </footer>
    </div>
  );
}

function Home() {
  const facts = getPublicFacts();
  const firstPart = config.appName.slice(
    0,
    config.appName.length - config.wordmarkAccentSuffix.length,
  );

  return (
    <Shell>
      <div className="public-home-content">
        <section
          className="public-home-hero"
          aria-labelledby="public-home-title"
        >
          <div className="public-home-hero-copy">
            <h1 id="public-home-title" className="public-home-wordmark">
              <span>{firstPart}</span>
              <span className="text-gilt">{config.wordmarkAccentSuffix}</span>
            </h1>
            <p className="public-home-subtitle">{en.entry.subtitle}</p>
            <p className="public-home-byline">{en.entry.welcomeDescription}</p>
            <nav className="public-home-actions" aria-label="Get started">
              <Link
                to={`${config.routes.play}?entry=create`}
                className="primary-action no-underline"
              >
                {en.publicSite.play}
              </Link>
              <Link
                to={config.routes.join}
                className="secondary-action no-underline"
              >
                {en.publicSite.joinGame}
              </Link>
              <Link
                to={config.routes.rehearsal}
                className="quiet-action no-underline"
              >
                {en.publicSite.practiseAlone}
              </Link>
            </nav>
          </div>
          <HoldRoleDemo />
        </section>

        <section className="public-home-section public-home-answer-section">
          <p className="public-home-answer">
            {en.publicSite.answer(config.appName)}
          </p>
        </section>

        <section
          className="public-home-section"
          aria-labelledby="public-how-heading"
        >
          <h2 id="public-how-heading">{en.publicSite.howItWorksHeading}</h2>
          <ol className="public-home-steps">
            {en.publicSite.howItWorks.map((step, index) => (
              <li key={step.heading}>
                <h3>
                  {index + 1}. {step.heading}
                </h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          className="public-home-section"
          aria-labelledby="public-formats-heading"
        >
          <h2 id="public-formats-heading">{en.publicSite.formatsHeading}</h2>
          <div className="public-home-formats">
            {en.publicSite.formats.map((format) => (
              <article key={format.name}>
                <h3>{format.name}</h3>
                <p className="public-format-duration">{format.duration}</p>
                <p>{format.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="public-home-section"
          aria-labelledby="public-facts-heading"
        >
          <h2 id="public-facts-heading">{en.publicSite.factsHeading}</h2>
          <p className="text-ash">{en.publicSite.factsIntro}</p>
          <dl className="public-home-facts">
            {facts.map((fact) => (
              <div className="public-fact" key={fact.id}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          className="public-home-section"
          aria-labelledby="public-faq-heading"
        >
          <h2 id="public-faq-heading">{en.publicSite.faqHeading}</h2>
          <div className="public-home-faq">
            {en.publicSite.faq.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
          <Link className="public-page-link" to={config.routes.faq}>
            {en.publicSite.seeAllQuestions}
          </Link>
        </section>
      </div>
    </Shell>
  );
}

function PublicFaq() {
  return (
    <Shell>
      <div className="public-home-content">
        <section
          className="public-home-section"
          aria-labelledby="public-faq-heading"
        >
          <h1 id="public-faq-heading">{en.publicSite.faqHeading}</h1>
          <p className="public-home-answer">
            {en.publicSite.answer(config.appName)}
          </p>
          <div className="public-home-faq">
            {en.publicSite.faq.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </Shell>
  );
}

function PublicCompare() {
  return (
    <Shell>
      <div className="public-home-content">
        <section
          className="public-home-section"
          aria-labelledby="public-compare-heading"
        >
          <h1 id="public-compare-heading">{en.publicSite.compareHeading}</h1>
          <p className="public-home-answer">{en.publicSite.compareIntro}</p>
          <table className="public-comparison-table">
            <caption>How different hidden-role game formats work</caption>
            <thead>
              <tr>
                <th scope="col">Game format</th>
                <th scope="col">What to expect</th>
              </tr>
            </thead>
            <tbody>
              {en.publicSite.comparisonCategories.map((category) => (
                <tr key={category.name}>
                  <th scope="row">{category.name}</th>
                  <td>{category.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section
          className="public-home-section"
          aria-labelledby="public-compare-faq-heading"
        >
          <h2 id="public-compare-faq-heading">{en.publicSite.faqHeading}</h2>
          <div className="public-home-faq">
            {en.publicSite.faq.slice(-3).map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </Shell>
  );
}

function Play({
  mode = 'play',
}: {
  mode?: 'play' | 'join' | 'coordinate' | 'waiting';
}) {
  const csrfToken = useContext(csrfContext);
  return <EntryPage mode={mode} csrfToken={csrfToken} />;
}

function NotFound() {
  return (
    <Shell>
      <h1 className="display text-4xl">{en.notFound.heading}</h1>
      <p className="mt-5 max-w-lg text-lg text-ash">{en.notFound.body}</p>
      <Link to={config.routes.home} className="quiet-action mt-7 no-underline">
        {en.notFound.back}
      </Link>
    </Shell>
  );
}

function phaseLabel(phase: string): string {
  return (
    (en.game.phases as Record<string, string>)[phase] ?? en.game.defaultPhase
  );
}

function isFullView(view: GameViewResponse['view']): view is FullView {
  return 'id' in view;
}

function PlayerGame() {
  const { id = '' } = useParams();
  const token = useContext(csrfContext);
  const install = useContext(installContext);
  const queryClient = useQueryClient();
  const [shielded, setShielded] = useState(false);
  const [shieldPending, setShieldPending] = useState(false);
  const [held, setHeld] = useState(false);
  const [shieldCountdown, setShieldCountdown] = useState(5);
  const [holdProgress, setHoldProgress] = useState(0);
  const [privateView, setPrivateView] = useState<PrivateView | null>(null);
  const [holdMessage, setHoldMessage] = useState('');
  const [selected, setSelected] = useState('');
  const [confirmChoice, setConfirmChoice] = useState(false);
  const [commandMessage, setCommandMessage] = useState('');
  const [installMessage, setInstallMessage] = useState('');
  const [wakeLockFallback, setWakeLockFallback] = useState(false);
  const [fullscreenMessage, setFullscreenMessage] = useState('');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesStatus, setNotesStatus] = useState('');
  const heldRef = useRef(false);
  const holdVersion = useRef(0);
  const privateResult = useRef<PrivateView | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const shieldDialog = useRef<HTMLDialogElement | null>(null);
  const focusTime = useRef(0);
  const ignoreSyntheticClick = useRef(false);
  const request = useMemo(() => requestHeaders(token), [token]);
  const gameQuery = useGetGameView(id, {
    query: { enabled: Boolean(id), queryKey: getGetGameViewQueryKey(id) },
    request: { credentials: 'include' },
  });
  const reveal = useRevealPrivateView({
    request,
    mutation: { gcTime: 0 },
  });
  const command = useSubmitGameCommand({ request, mutation: { gcTime: 0 } });
  const response = gameQuery.data;
  const view = response?.view;
  const full = view && isFullView(view) ? view : null;
  const visitor = view && !isFullView(view) ? (view as VisitorView) : null;
  const eligibleSeats =
    full?.seats.filter((seat) => seat.status === 'alive') ?? [];
  const phaseIsPrivate = Boolean(
    full &&
    ['DEAL', 'VOTE', 'SHADOW', 'FINAL_VOTE', 'FINAL_BANISH'].includes(
      full.phase,
    ),
  );
  const inPrivateMoment = Boolean(full && (phaseIsPrivate || notesOpen));
  const isActionPhase = Boolean(
    full &&
    ['VOTE', 'SHADOW', 'FINAL_VOTE', 'FINAL_BANISH'].includes(full.phase),
  );
  const hasPlayerSeat = Boolean(full);
  const privateOptions = privateView?.options ?? [];
  const choices =
    full?.phase === 'VOTE' || full?.phase === 'FINAL_BANISH'
      ? eligibleSeats.map(({ id: seatId, name }) => ({ id: seatId, name }))
      : full?.phase === 'SHADOW'
        ? privateOptions
        : full?.phase === 'FINAL_VOTE'
          ? [
              { id: 'end', name: 'End the game' },
              { id: 'continue', name: 'Continue playing' },
            ]
          : [];

  async function enterFullScreen() {
    try {
      await document.documentElement.requestFullscreen();
      setFullscreenMessage('');
    } catch {
      setFullscreenMessage(en.game.fullscreenUnavailable);
    }
  }

  useEffect(() => {
    if (!hasPlayerSeat) return;
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
      (nextView) => {
        queryClient.setQueryData(getGetGameViewQueryKey(id), nextView);
      },
    );
    return () => {
      detach();
      socket.disconnect();
    };
  }, [id, hasPlayerSeat, queryClient]);

  const clearPrivate = useCallback(
    (preserveSyntheticClick = false) => {
      if (!preserveSyntheticClick) ignoreSyntheticClick.current = false;
      heldRef.current = false;
      holdVersion.current += 1;
      setHeld(false);
      setPrivateView(null);
      privateResult.current = null;
      setSelected('');
      setConfirmChoice(false);
      setCommandMessage('');
      setNotesStatus('');
      setHoldMessage('');
      if (revealTimer.current) clearTimeout(revealTimer.current);
      if (limitTimer.current) clearTimeout(limitTimer.current);
      if (progressTimer.current) clearInterval(progressTimer.current);
      setHoldProgress(0);
      reveal.reset();
      command.reset();
    },
    [command.reset, reveal.reset],
  );
  const cancelPrivate = useCallback(() => clearPrivate(), [clearPrivate]);
  const privateStepKey = full
    ? `${full.phase}:${full.cycle}:${full.deadline ?? 'manual'}:${notesOpen ? 'notes' : 'phase'}`
    : 'none';
  const activeGame = Boolean(
    full && !['DRAFT', 'LOBBY', 'FINISHED', 'ARCHIVED'].includes(full.phase),
  );
  const showShieldCard = Boolean(full && inPrivateMoment && !shielded);

  useEffect(() => {
    if (!inPrivateMoment) {
      setShielded(false);
      setShieldCountdown(5);
      return;
    }
    clearPrivate();
    setShielded(false);
    setShieldCountdown(5);
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      setShieldCountdown(Math.max(0, 5 - elapsedSeconds));
    }, 100);
    return () => window.clearInterval(timer);
  }, [privateStepKey, inPrivateMoment, clearPrivate]);

  useEffect(() => {
    const dialog = shieldDialog.current;
    if (!dialog) return;
    if (showShieldCard && !dialog.open) dialog.showModal();
    if (!showShieldCard && dialog.open) dialog.close();
  }, [showShieldCard]);

  useEffect(() => {
    if (!activeGame) {
      setWakeLockFallback(false);
      return;
    }
    const wakeLockApi = (navigator as NavigatorWithWakeLock).wakeLock;
    if (!wakeLockApi) {
      setWakeLockFallback(true);
      return;
    }
    let active = true;
    let wakeLock: WakeLockSentinelLike | null = null;
    const requestWakeLock = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        wakeLock = await wakeLockApi.request('screen');
        if (active) setWakeLockFallback(false);
      } catch {
        if (active) setWakeLockFallback(true);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void requestWakeLock();
    };
    void requestWakeLock();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      if (wakeLock) void wakeLock.release();
    };
  }, [activeGame]);

  useEffect(() => {
    const refetch = () => {
      void queryClient.invalidateQueries({
        queryKey: getGetGameViewQueryKey(id),
        exact: true,
      });
    };
    const coverPrivate = () => {
      cancelPrivate();
      setShielded(false);
      setShieldCountdown(5);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refetch();
      else coverPrivate();
    };
    const onPageShow = () => refetch();
    const onOrientation = () => coverPrivate();
    const onOnline = () => refetch();
    const onFocus = () => refetch();
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    window.addEventListener('orientationchange', onOrientation);
    window.addEventListener('blur', coverPrivate);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', coverPrivate);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('orientationchange', onOrientation);
      window.removeEventListener('blur', coverPrivate);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', coverPrivate);
      cancelPrivate();
    };
  }, [id, queryClient, cancelPrivate]);

  useEffect(() => {
    document.title = config.appName;
  }, []);

  useEffect(() => {
    const view = gameQuery.data?.view;
    if (!view || !isFullView(view) || view.deadline === null || view.paused) {
      setSecondsLeft(null);
      return;
    }
    const update = () =>
      setSecondsLeft(
        Math.max(0, Math.ceil((view.deadline! - Date.now()) / 1000)),
      );
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [gameQuery.data]);

  async function acknowledge() {
    if (!token || shieldPending || shieldCountdown > 0) return;
    if (notesOpen && !phaseIsPrivate) {
      setShielded(true);
      setHoldMessage('');
      return;
    }
    setShieldPending(true);
    setHoldMessage('');
    try {
      await command.mutateAsync({
        id,
        data: { type: 'AcknowledgePrivate', idempotencyKey: idempotencyKey() },
      });
      command.reset();
      setShielded(true);
    } catch {
      command.reset();
      setHoldMessage(en.game.shieldRetry);
    } finally {
      setShieldPending(false);
    }
  }

  function beginHold() {
    if (!shielded || !token || heldRef.current || reveal.isPending) return;
    heldRef.current = true;
    const version = ++holdVersion.current;
    focusTime.current = Date.now();
    setHeld(true);
    setHoldMessage('');
    setCommandMessage('');
    setPrivateView(null);
    privateResult.current = null;
    revealTimer.current = setTimeout(() => {
      if (
        heldRef.current &&
        version === holdVersion.current &&
        privateResult.current
      ) {
        setPrivateView(privateResult.current);
        setHoldProgress(100);
        if (progressTimer.current) clearInterval(progressTimer.current);
      }
    }, 500);
    limitTimer.current = setTimeout(clearPrivate, 10_000);
    void reveal
      .mutateAsync({
        id,
        ...(notesOpen && !phaseIsPrivate
          ? { data: { purpose: 'notes' as const } }
          : {}),
      })
      .then((response) => {
        const view = response.view;
        const privateData = isFullView(view) ? view.private : null;
        if (!privateData) {
          if (heldRef.current && version === holdVersion.current)
            setHoldMessage(en.game.privateUnavailable);
          return;
        }
        if (heldRef.current && version === holdVersion.current) {
          privateResult.current = privateData;
          if (Date.now() - focusTime.current >= 500) {
            setPrivateView(privateData);
            setHoldProgress(100);
            if (progressTimer.current) clearInterval(progressTimer.current);
          }
        }
      })
      .catch(() => {
        if (heldRef.current && version === holdVersion.current)
          setHoldMessage(en.game.privateError);
      })
      .finally(() => {
        reveal.reset();
      });
  }

  function padPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    event.preventDefault();
    ignoreSyntheticClick.current = true;
    beginHold();
  }
  function padKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
      event.preventDefault();
      ignoreSyntheticClick.current = true;
      beginHold();
    }
  }

  async function submitAction() {
    const view = gameQuery.data?.view;
    if (!view || !isFullView(view) || !selected || !token) return;
    setCommandMessage('');
    const payload =
      view.phase === 'VOTE' || view.phase === 'FINAL_BANISH'
        ? {
            type: 'SubmitVote',
            target: selected,
            idempotencyKey: idempotencyKey(),
          }
        : view.phase === 'SHADOW'
          ? {
              type: 'SubmitShadowChoice',
              choice: selected,
              idempotencyKey: idempotencyKey(),
            }
          : {
              type: 'SubmitEndgameVote',
              choice: selected,
              idempotencyKey: idempotencyKey(),
            };
    try {
      await command.mutateAsync({ id, data: payload });
      command.reset();
      setCommandMessage(en.game.recorded);
      setSelected('');
      setConfirmChoice(false);
      await gameQuery.refetch();
    } catch {
      command.reset();
      setCommandMessage(en.game.chooseSomeoneElse);
      setSelected('');
      setConfirmChoice(false);
    }
  }

  async function saveNotes() {
    const text = notesDraft.trim();
    if (!privateView || !held || !notesOpen || text.length === 0) return;
    setNotesStatus('');
    if (privateView.role === 'traitor') {
      try {
        await command.mutateAsync({
          id,
          data: {
            type: 'PostTraitorMessage',
            text,
            idempotencyKey: idempotencyKey(),
          },
        });
        command.reset();
        setNotesDraft('');
        setNotesStatus(en.game.notesSent);
      } catch {
        command.reset();
        setNotesStatus(en.game.notesFailed);
      }
      return;
    }
    setNotesStatus(en.game.notesSaved);
  }

  async function installApp() {
    try {
      const outcome = await install.install();
      setInstallMessage(
        outcome === 'accepted'
          ? en.play.installAccepted
          : en.play.installFallback,
      );
    } catch {
      setInstallMessage(en.play.installFailed);
    }
  }

  return (
    <Shell isPlayer>
      <section className="mx-auto w-full max-w-[480px]">
        {gameQuery.isLoading && (
          <div
            aria-label={en.game.loadingLabel}
            className="enter space-y-5"
            role="status"
          >
            <div className="h-3 w-28 animate-pulse bg-stone" />
            <div className="h-12 max-w-lg animate-pulse bg-stone" />
            <div className="mx-auto h-56 w-56 animate-pulse rounded-full border border-stone" />
            <span className="sr-only">{en.game.loading}</span>
          </div>
        )}
        {gameQuery.isError && (
          <div role="alert" className="border-l-2 border-gilt pl-5">
            <h1 className="display text-3xl">{en.game.unavailableHeading}</h1>
            <p className="mt-3 text-ash">{en.game.unavailableBody}</p>
            <button
              className="quiet-action mt-5"
              type="button"
              onClick={() => void gameQuery.refetch()}
            >
              {en.game.tryAgain}
            </button>
          </div>
        )}
        {visitor && (
          <div>
            <h1 className="display mt-3 text-4xl">
              {phaseLabel(visitor.phase)}
            </h1>
            <p className="mt-5 text-ash">{en.game.visitorJoin}</p>
            <Link
              to={config.routes.play}
              className="quiet-action mt-7 no-underline"
            >
              {en.game.joinButton}
            </Link>
          </div>
        )}
        {full && (
          <div>
            {full.phase === 'LOBBY' && (
              <section className="status-rule mb-7 pt-5">
                {install.available && (
                  <button
                    className="quiet-action"
                    type="button"
                    onClick={() => void installApp()}
                  >
                    {en.play.installPrompt}
                  </button>
                )}
                <details className="mt-3 text-sm text-ash">
                  <summary className="min-h-11 cursor-pointer py-2">
                    {en.play.installInstructions}
                  </summary>
                  <p className="mt-2">{en.play.installIos}</p>
                  <p className="mt-2">{en.play.installGeneric}</p>
                </details>
                {installMessage && (
                  <p role="status" className="mt-3">
                    {installMessage}
                  </p>
                )}
              </section>
            )}
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="display mt-2 text-4xl leading-tight sm:text-5xl">
                  {phaseLabel(full.phase)}
                </h1>
              </div>
              {secondsLeft !== null && (
                <p
                  className="text-sm text-ash"
                  aria-label={en.game.secondsRemaining(secondsLeft)}
                >
                  {en.game.timeLeft}{' '}
                  <span className="gold ml-2 font-medium tabular-nums">
                    {Math.floor(secondsLeft / 60)}:
                    {String(secondsLeft % 60).padStart(2, '0')}
                  </span>
                </p>
              )}
            </div>
            {activeGame && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {typeof document !== 'undefined' &&
                  typeof document.documentElement.requestFullscreen ===
                    'function' && (
                    <button
                      className="quiet-action"
                      type="button"
                      onClick={() => void enterFullScreen()}
                    >
                      {en.game.fullscreen}
                    </button>
                  )}
                {wakeLockFallback && (
                  <p role="status" className="text-sm text-ash">
                    {en.game.wakeLockFallback}
                  </p>
                )}
                {fullscreenMessage && (
                  <p role="status" className="text-sm text-ash">
                    {fullscreenMessage}
                  </p>
                )}
              </div>
            )}
            <div className="status-rule mt-6 pt-6">
              <p className="max-w-xl text-ash">
                {full.paused
                  ? en.game.paused
                  : inPrivateMoment
                    ? en.game.privateScreen
                    : en.game.progress(full.progress.done, full.progress.total)}
              </p>
            </div>

            {!inPrivateMoment && full.publicAnnouncement && (
              <section
                className="mt-6 border-l-2 border-gilt pl-5"
                aria-live="polite"
                aria-atomic="true"
                data-testid="shared-announcement"
              >
                {full.publicAnnouncement.kind === 'dawn' && (
                  <h2 className="display text-2xl">
                    {full.publicAnnouncement.victims.length
                      ? full.publicAnnouncement.victims
                          .map((victim) => en.game.dawnTaken(victim.name))
                          .join(' ')
                      : en.game.dawnNoOneTaken}
                  </h2>
                )}
                {full.publicAnnouncement.kind === 'verdict' && (
                  <h2 className="display text-2xl">
                    {en.game.banished(full.publicAnnouncement.seat.name)}
                  </h2>
                )}
                {full.publicAnnouncement.kind === 'finished' && (
                  <h2 className="display text-2xl">
                    {full.publicAnnouncement.winner === 'traitor'
                      ? en.game.resultTraitors
                      : en.game.resultFaithful}
                  </h2>
                )}
              </section>
            )}

            {!inPrivateMoment && full.phase === 'VERDICT' && (
              <section className="mt-6" aria-label={en.game.voteResults}>
                <ul
                  className="divide-y divide-stone"
                  data-testid="list-vote-reveal"
                >
                  {Object.entries(full.ballots).map(([voterId, targetId]) => {
                    const voter = full.seats.find(
                      (seat) => seat.id === voterId,
                    );
                    const target = full.seats.find(
                      (seat) => seat.id === targetId,
                    );
                    return voter && target ? (
                      <li key={voterId} className="py-3 text-ash">
                        {en.game.voteReveal(voter.name, target.name)}
                      </li>
                    ) : null;
                  })}
                </ul>
              </section>
            )}

            {inPrivateMoment && (
              <div className="mx-auto mt-7 max-w-md text-center">
                {!shielded ? (
                  <div className="enter">
                    <p className="display text-2xl">{en.game.shieldHeading}</p>
                    <p className="mt-2 text-sm text-ash">
                      {en.game.shieldDetail}
                    </p>
                    <p
                      className="mt-4 text-2xl tabular-nums text-candle"
                      aria-live="polite"
                    >
                      {shieldCountdown > 0
                        ? en.game.countdown(shieldCountdown)
                        : en.game.shieldReady}
                    </p>
                    <button
                      className="primary-action mt-5 w-full"
                      type="button"
                      onClick={() => void acknowledge()}
                      disabled={!token || shieldPending || shieldCountdown > 0}
                    >
                      {shieldPending
                        ? en.game.shieldConfirming
                        : en.game.shieldConfirm}
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="display text-2xl">{en.game.holdHeading}</p>
                    <p
                      className="mt-2 min-h-6 text-sm text-ash"
                      aria-live="polite"
                    >
                      {held ? en.game.holdPending : en.game.holdRelease}
                    </p>
                    <button
                      className="hold-seal"
                      type="button"
                      aria-label={
                        held ? en.game.releaseLabel : en.game.holdLabel
                      }
                      aria-describedby="hold-instructions"
                      aria-pressed={held}
                      data-held={held}
                      style={
                        {
                          '--hold-progress': holdProgress,
                        } as React.CSSProperties
                      }
                      data-testid="button-hold-reveal"
                      onPointerDown={padPointerDown}
                      onClick={() => {
                        if (ignoreSyntheticClick.current) {
                          ignoreSyntheticClick.current = false;
                          return;
                        }
                        if (heldRef.current) clearPrivate();
                        else beginHold();
                      }}
                      onPointerUp={() => clearPrivate(true)}
                      onPointerCancel={cancelPrivate}
                      onPointerLeave={cancelPrivate}
                      onKeyDown={padKeyDown}
                      onKeyUp={(event) => {
                        if (event.key === ' ' || event.key === 'Enter')
                          clearPrivate(true);
                      }}
                      onBlur={cancelPrivate}
                    >
                      <span className="seal-inner">
                        <span className="seal-copy">
                          {held ? en.game.holdKeep : en.game.holdHeading}
                        </span>
                      </span>
                    </button>
                    <p id="hold-instructions" className="mt-3 text-sm text-ash">
                      {en.game.holdInstructions}
                    </p>
                    <div
                      className="mt-6 min-h-[12rem] text-left"
                      aria-live="polite"
                    >
                      {privateView &&
                        held &&
                        (notesOpen && !phaseIsPrivate ? (
                          <div
                            className="enter border-t border-stone pt-5"
                            data-testid="private-notes-content"
                          >
                            <h2 className="display text-2xl">
                              {en.game.notesHeading}
                            </h2>
                            <p className="mt-2 text-sm text-ash">
                              {en.game.notesPrivateIntro}
                            </p>
                            <div
                              className="mt-4 h-24 overflow-y-auto whitespace-pre-wrap border-y border-stone py-3 text-sm text-ash"
                              aria-live="polite"
                            >
                              {privateView.role === 'traitor'
                                ? privateView.chat
                                    .slice()
                                    .sort((a, b) => a.seq - b.seq)
                                    .map((message) => {
                                      const author = full.seats.find(
                                        (seat) => seat.id === message.seatId,
                                      )?.name;
                                      return author
                                        ? `${author}: ${message.text}`
                                        : message.text;
                                    })
                                    .join('\n') || en.game.notesTeamEmpty
                                : en.game.notesPrivateIntro}
                            </div>
                            <label className="mt-4 block text-sm text-ash">
                              <span>{en.game.notesLabel}</span>
                              <textarea
                                className="mt-2 min-h-24 w-full resize-y border border-stone bg-hearth p-3 text-base text-candle"
                                aria-label={en.game.notesLabel}
                                maxLength={500}
                                value={notesDraft}
                                onChange={(event) =>
                                  setNotesDraft(event.target.value)
                                }
                              />
                            </label>
                            <button
                              className="primary-action mt-4 w-full"
                              type="button"
                              disabled={!notesDraft.trim() || command.isPending}
                              onClick={() => void saveNotes()}
                            >
                              {privateView.role === 'traitor'
                                ? en.game.notesSend
                                : en.game.notesSave}
                            </button>
                            {notesStatus && (
                              <p
                                role="status"
                                className="mt-3 text-sm text-ash"
                              >
                                {notesStatus}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="enter border-t border-stone pt-5">
                            <p className="text-sm text-ash">
                              {en.game.privateRole}
                            </p>
                            <h2 className="display mt-1 text-3xl">
                              {privateView.role === 'traitor'
                                ? en.game.roleTraitor
                                : privateView.role === 'faithful'
                                  ? en.game.roleFaithful
                                  : en.game.roleUnknown}
                            </h2>
                            {privateView.task && (
                              <p className="mt-4 text-candle">
                                {privateView.task.instruction}
                              </p>
                            )}
                            {isActionPhase && (
                              <div className="mt-5">
                                <p className="text-sm text-ash">
                                  {full.phase === 'VOTE' ||
                                  full.phase === 'FINAL_BANISH'
                                    ? en.game.choosePlayer
                                    : full.phase === 'SHADOW'
                                      ? en.game.chooseOption
                                      : en.game.finalDecision}
                                </p>
                                <div className="mt-3 grid gap-2">
                                  {choices.map((choice) => (
                                    <button
                                      key={choice.id}
                                      type="button"
                                      className="choice-action"
                                      aria-pressed={selected === choice.id}
                                      onClick={() => {
                                        setSelected(choice.id);
                                        setConfirmChoice(false);
                                        setCommandMessage('');
                                      }}
                                    >
                                      {choice.name}
                                    </button>
                                  ))}
                                </div>
                                {selected && !confirmChoice && (
                                  <button
                                    type="button"
                                    className="quiet-action mt-4 w-full"
                                    onClick={() => setConfirmChoice(true)}
                                  >
                                    {en.game.reviewChoice}
                                  </button>
                                )}
                                {selected && confirmChoice && (
                                  <div className="mt-4 border-t border-stone pt-4">
                                    <p className="text-candle">
                                      {en.game.confirmChoice}
                                    </p>
                                    <div className="mt-3 flex flex-wrap gap-3">
                                      <button
                                        type="button"
                                        className="primary-action flex-1"
                                        disabled={command.isPending || !token}
                                        onClick={() => void submitAction()}
                                      >
                                        {command.isPending
                                          ? en.game.recording
                                          : en.game.confirm}
                                      </button>
                                      <button
                                        type="button"
                                        className="quiet-action flex-1"
                                        onClick={() => setConfirmChoice(false)}
                                      >
                                        {en.game.chooseAgain}
                                      </button>
                                    </div>
                                  </div>
                                )}
                                {commandMessage && (
                                  <p
                                    role="status"
                                    className="mt-4 text-sm text-ash"
                                  >
                                    {commandMessage}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      {!privateView && holdMessage && (
                        <p role="status" className="pt-5 text-sm text-ash">
                          {holdMessage}
                        </p>
                      )}
                    </div>
                    {notesOpen && !phaseIsPrivate && (
                      <button
                        className="quiet-action mt-4 w-full"
                        type="button"
                        onClick={() => {
                          clearPrivate();
                          setNotesOpen(false);
                        }}
                      >
                        {en.game.notesDone}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {!inPrivateMoment && (
              <div className="mt-12 border-t border-stone pt-6">
                <h2 className="display text-2xl">{en.game.roomHeading}</h2>
                <section
                  className="mt-5 border-y border-stone py-4"
                  aria-label={en.game.prizePot(full.pot, full.unit)}
                >
                  <p className="text-sm text-ash">{en.game.prizePotLabel}</p>
                  <p
                    className="mt-1 text-xl font-medium tabular-nums text-candle"
                    data-testid="status-prize-pot"
                  >
                    {en.game.prizePot(full.pot, full.unit)}
                  </p>
                </section>

                <section className="mt-7" aria-labelledby="players-heading">
                  <h2 id="players-heading" className="display text-2xl">
                    {en.game.playersHeading}
                  </h2>
                  <ul className="mt-2 divide-y divide-stone">
                    {full.seats.map((seat) => {
                      const isAlive = seat.status === 'alive';
                      return (
                        <li
                          key={seat.id}
                          className="flex min-h-14 items-center justify-between gap-4 py-3"
                          data-testid={`player-seat-${seat.id}`}
                        >
                          <span className="min-w-0 break-words text-candle">
                            {seat.name}
                          </span>
                          <span
                            className={`shrink-0 text-sm ${isAlive ? 'text-candle' : 'text-ash'}`}
                          >
                            {isAlive
                              ? en.game.playerPlaying
                              : en.game.playerOut}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <section className="mt-7" aria-labelledby="public-log-heading">
                  <h2 id="public-log-heading" className="display text-2xl">
                    {en.game.latestUpdates}
                  </h2>
                  <ul
                    className="mt-2 divide-y divide-stone"
                    data-testid="list-public-log"
                  >
                    {full.publicLog
                      .slice()
                      .sort((a, b) => a.seq - b.seq)
                      .slice(-5)
                      .reverse()
                      .map((entry) => (
                        <li
                          key={entry.seq}
                          className="py-3 text-sm text-ash"
                          data-testid={`public-log-entry-${entry.seq}`}
                        >
                          {entry.action === 'device_recovered'
                            ? en.game.publicLogDeviceRecovered(entry.name)
                            : en.game.publicLogPinReset(entry.name)}
                        </li>
                      ))}
                    {full.publicLog.length === 0 && (
                      <li className="py-3 text-sm text-ash">
                        {en.game.noPublicUpdates}
                      </li>
                    )}
                  </ul>
                </section>
                <p className="mt-7 text-sm text-ash">{en.game.roomNote}</p>
                <button
                  className="primary-action mt-6 w-full"
                  type="button"
                  data-testid="button-open-notes"
                  onClick={() => {
                    setNotesStatus('');
                    setNotesOpen(true);
                  }}
                >
                  {en.game.notesButton}
                </button>
              </div>
            )}
          </div>
        )}
        {showShieldCard && (
          <dialog
            ref={shieldDialog}
            className="privacy-shield"
            aria-labelledby="privacy-shield-title"
            onCancel={(event) => event.preventDefault()}
          >
            <a
              className="absolute left-4 top-[calc(1rem+env(safe-area-inset-top))] z-10 inline-flex min-h-11 items-center"
              href={config.organisation.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={en.app.brandLink}
            >
              <img
                src={`${import.meta.env.BASE_URL}${config.brandMarkPath}`}
                alt={en.app.brandName}
                className="h-7 w-auto"
              />
            </a>
            <div className="privacy-shield-content">
              <div className="mx-auto w-full max-w-md text-center">
                <h1
                  id="privacy-shield-title"
                  className="display text-3xl sm:text-4xl"
                >
                  {en.game.shieldHeading}
                </h1>
                <p className="mt-4 text-ash">{en.game.shieldDetail}</p>
                <p
                  className="mt-6 min-h-9 text-2xl tabular-nums text-candle"
                  aria-live="polite"
                >
                  {shieldCountdown > 0
                    ? en.game.countdown(shieldCountdown)
                    : en.game.shieldReady}
                </p>
                <button
                  autoFocus
                  className="primary-action mt-6 w-full"
                  type="button"
                  aria-disabled={!token || shieldPending || shieldCountdown > 0}
                  onClick={() => void acknowledge()}
                >
                  {shieldPending
                    ? en.game.shieldConfirming
                    : en.game.shieldConfirm}
                </button>
                {notesOpen && !phaseIsPrivate && (
                  <button
                    className="quiet-action mt-3 w-full"
                    type="button"
                    onClick={() => {
                      clearPrivate();
                      setNotesOpen(false);
                    }}
                  >
                    {en.game.notesDone}
                  </button>
                )}
              </div>
            </div>
          </dialog>
        )}
      </section>
    </Shell>
  );
}

export function AppRoutes() {
  return (
    <QueryClientProvider client={queryClient}>
      <InstallPromptProvider>
        <CsrfProvider>
          <Routes>
            <Route path={config.routes.home} element={<Home />} />
            <Route path={config.routes.faq} element={<PublicFaq />} />
            <Route path={config.routes.compare} element={<PublicCompare />} />
            <Route path={config.routes.play} element={<Play />} />
            <Route path={config.routes.join} element={<Play mode="join" />} />
            <Route path="/join/:gameId" element={<Play mode="join" />} />
            <Route
              path="/join-request/:requestId"
              element={<Play mode="waiting" />}
            />
            <Route
              path="/coordinate/:id"
              element={<Play mode="coordinate" />}
            />
            <Route path="/game/:id" element={<PlayerGame />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </CsrfProvider>
      </InstallPromptProvider>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
