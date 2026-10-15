import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createContext,
  lazy,
  Suspense,
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
  useLocation,
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
import { BrandFooter } from './BrandFooter';
import { apiUrl } from './api-url';
import { en } from '@/locale/en-GB';
import { attachGameView, type GameRealtimeSocket } from './game-socket';
import { EntryPage } from './EntryPage';
import { HoldRoleDemo } from './HoldRoleDemo';
import { lobbyCodeJoinUrl } from './lobby-code-url';
import {
  rehearsalGuideStepKey,
  shouldShowRehearsalGuide,
} from './rehearsal-guide-step';
import { getPublicFacts } from './public-site-content';
import './public-home.css';

setBaseUrl(config.apiOrigin);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
const LobbyQRCode = lazy(async () => {
  const module = await import('qrcode.react');
  return {
    default: function LobbyQRCodeView({ value }: { value: string }) {
      return (
        <module.QRCodeSVG
          value={value}
          size={176}
          includeMargin
          fgColor="#16110D"
          bgColor="#FAFAF5"
          title={en.entry.qrAlt}
        />
      );
    },
  };
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
  const location = useLocation();

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
          className={`safe-page fixed inset-x-0 bottom-0 z-20 border-t border-gilt bg-hearth text-candle${location.pathname.startsWith('/game/') ? ' game-footer-adjacent' : ''}`}
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
  privateMode = false,
  privateRevealActive = false,
}: {
  children: ReactNode;
  isPlayer?: boolean;
  privateMode?: boolean;
  privateRevealActive?: boolean;
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
    <div
      className={`safe-page flex min-h-[100dvh] flex-col${isPlayer ? ' game-shell' : ''}${privateMode ? ' private-moment-shell' : ''}${privateMode && privateRevealActive ? ' private-moment-shell--held' : ''}`}
    >
      <a
        href="#main"
        className="absolute left-3 top-3 z-10 -translate-y-20 rounded-sm bg-candle px-3 py-2 font-medium text-charcoal focus:translate-y-0"
      >
        {en.skip}
      </a>
      <header
        className={`public-home-brand public-shell-header w-full${isPlayer ? ' player-shell-header' : ' mx-auto max-w-5xl'}`}
      >
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
      </header>
      <main
        id="main"
        tabIndex={-1}
        className={`mx-auto w-full max-w-5xl flex-1 py-10 sm:py-16${privateMode ? ' private-moment-main' : ''}${isPlayer ? ' game-shell-main' : ''}`}
      >
        {children}
      </main>
      <BrandFooter
        context={isPlayer ? 'game' : 'public'}
        className={
          isPlayer ? 'game-brand-footer' : 'mx-auto mt-8 w-full max-w-5xl py-3'
        }
        testId="brand-footer-shell"
      />
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

function webPath(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  return `${base}${path}`;
}

function TurnstonePlayerHeader() {
  return (
    <header
      className="entry-brand"
      aria-label={config.appName}
      data-testid="player-brand-header"
    >
      <a
        href={config.routes.home}
        className="turnstone-wordmark"
        aria-label={config.appName}
        data-testid="text-entry-brand"
      >
        <span>
          {config.appName.slice(0, -config.wordmarkAccentSuffix.length)}
        </span>
        <span className="text-gilt">{config.wordmarkAccentSuffix}</span>
      </a>
    </header>
  );
}

type RehearsalGuideKey = keyof typeof en.game.rehearsalGuide;

function explanationKeyForPhase(
  phase: string,
  notesOpen: boolean,
): RehearsalGuideKey | null {
  if (notesOpen) return 'notes';
  switch (phase) {
    case 'DEAL':
      return 'role';
    case 'MISSION':
      return 'mission';
    case 'DEBATE':
      return 'conversation';
    case 'VOTE':
      return 'vote';
    case 'VERDICT':
      return 'verdict';
    case 'SHADOW':
      return 'night';
    case 'DAWN':
      return 'dawn';
    case 'ENDGAME':
      return 'endgame';
    case 'FINAL_VOTE':
      return 'finalVote';
    case 'FINAL_BANISH':
      return 'finalBanish';
    case 'FINISHED':
      return 'complete';
    default:
      return null;
  }
}

function seededChoiceRandom(seed: string) {
  let state = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 0x01000193) >>> 0;
  }

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shuffleSeatChoices(
  choices: Array<{ id: string; name: string }>,
  seats: FullView['seats'],
  seed: string,
) {
  if (
    choices.length < 2 ||
    choices.some((choice) => !seats.some((seat) => seat.id === choice.id))
  )
    return choices;

  const random = seededChoiceRandom(seed);
  const shuffled = choices.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[otherIndex]] = [
      shuffled[otherIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

function PlayerGame() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const token = useContext(csrfContext);
  const install = useContext(installContext);
  const queryClient = useQueryClient();
  const [shielded, setShielded] = useState(false);
  const [shieldPending, setShieldPending] = useState(false);
  const [held, setHeld] = useState(false);
  const [roleSeen, setRoleSeen] = useState(false);
  const [shieldCountdown, setShieldCountdown] = useState(3);
  const [holdProgress, setHoldProgress] = useState(0);
  const [privateView, setPrivateView] = useState<PrivateView | null>(null);
  const [privateCovered, setPrivateCovered] = useState(false);
  const [holdMessage, setHoldMessage] = useState('');
  const [selected, setSelected] = useState('');
  const [confirmChoice, setConfirmChoice] = useState(false);
  const [actionDone, setActionDone] = useState(false);
  const [commandMessage, setCommandMessage] = useState('');
  const [installMessage, setInstallMessage] = useState('');
  const [wakeLockFallback, setWakeLockFallback] = useState(false);
  const [fullscreenMessage, setFullscreenMessage] = useState('');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesStatus, setNotesStatus] = useState('');
  const [rehearsalGuideStarted, setRehearsalGuideStarted] = useState(false);
  const [rehearsalGuideDismissedStep, setRehearsalGuideDismissedStep] =
    useState<string | null>(null);
  const [advanceConfirmationOpen, setAdvanceConfirmationOpen] = useState(false);
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
  const explanationKey = full
    ? explanationKeyForPhase(full.phase, notesOpen)
    : null;
  const explanationStepKey = full
    ? rehearsalGuideStepKey({
        phase: full.phase,
        cycle: full.cycle,
        deadline: full.deadline,
        shadowRound: full.shadowRound,
        notesOpen,
      })
    : '';
  const renderedRehearsalGuideKey: RehearsalGuideKey =
    full?.rehearsal && !rehearsalGuideStarted
      ? 'start'
      : (explanationKey ?? 'start');
  const rehearsalGuideVisible = shouldShowRehearsalGuide({
    rehearsal: Boolean(full?.rehearsal),
    started: rehearsalGuideStarted,
    explanationAvailable: Boolean(explanationKey),
    stepKey: explanationStepKey,
    dismissedStepKey: rehearsalGuideDismissedStep,
  });
  const ownSeat = full?.viewerSeatId
    ? (full.seats.find((seat) => seat.id === full.viewerSeatId) ?? null)
    : null;
  const eligibleSeats =
    full?.seats.filter((seat) => seat.status === 'alive') ?? [];
  const phaseIsPrivate = Boolean(
    full &&
    ownSeat?.status === 'alive' &&
    ['DEAL', 'VOTE', 'SHADOW', 'FINAL_VOTE', 'FINAL_BANISH'].includes(
      full.phase,
    ),
  );
  const inPrivateMoment = Boolean(full && (phaseIsPrivate || notesOpen));
  const shieldRequired = Boolean(
    full &&
    (['DEAL', 'VOTE', 'SHADOW', 'FINAL_VOTE', 'FINAL_BANISH'].includes(
      full.phase,
    ) ||
      notesOpen),
  );
  const isActionPhase = Boolean(
    full &&
    ['VOTE', 'SHADOW', 'FINAL_VOTE', 'FINAL_BANISH'].includes(full.phase),
  );
  const hasPlayerSeat = Boolean(full);
  const privateOptions = privateView?.options ?? [];
  const choices = shuffleSeatChoices(
    ownSeat?.status !== 'alive'
      ? []
      : full?.phase === 'VOTE' || full?.phase === 'FINAL_BANISH'
        ? eligibleSeats
            .filter(
              (seat) =>
                seat.id !== full.viewerSeatId &&
                (!full.voteCandidates.length ||
                  full.voteCandidates.includes(seat.id)),
            )
            .map(({ id: seatId, name }) => ({ id: seatId, name }))
        : full?.phase === 'SHADOW'
          ? privateOptions
          : full?.phase === 'FINAL_VOTE'
            ? [
                { id: 'end', name: 'End the game' },
                { id: 'continue', name: 'Continue playing' },
              ]
            : [],
    full?.seats ?? [],
    `${id}:${full?.viewerSeatId ?? ''}:${full?.phase ?? ''}:${full?.cycle ?? 0}:${full?.shadowRound ?? 0}`,
  );

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
      setActionDone(false);
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
    ? `${full.phase}:${full.cycle}:${full.deadline ?? 'manual'}:${full.shadowRound}:${notesOpen ? 'notes' : 'phase'}`
    : 'none';
  const activeGame = Boolean(
    full && !['DRAFT', 'LOBBY', 'FINISHED', 'ARCHIVED'].includes(full.phase),
  );
  const unfinishedCount = Math.max(
    0,
    (full?.progress.total ?? 0) - (full?.progress.done ?? 0),
  );
  const privateInteractionInProgress = Boolean(
    inPrivateMoment && (!actionDone || notesOpen),
  );
  const isDealPhase = full?.phase === 'DEAL';
  const showShieldCard = Boolean(
    full &&
    inPrivateMoment &&
    shieldRequired &&
    !shielded &&
    !(full.rehearsal && rehearsalGuideVisible),
  );

  useEffect(() => {
    if (!inPrivateMoment) {
      setShielded(false);
      setShieldCountdown(3);
      return;
    }
    clearPrivate();
    setShielded(!shieldRequired);
    setRoleSeen(false);
    setPrivateCovered(false);
    setShieldCountdown(shieldRequired ? 3 : 0);
    if (full?.rehearsal && rehearsalGuideVisible) return;
    if (!shieldRequired) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      setShieldCountdown(Math.max(0, 3 - elapsedSeconds));
    }, 100);
    return () => window.clearInterval(timer);
  }, [
    privateStepKey,
    inPrivateMoment,
    shieldRequired,
    clearPrivate,
    full?.rehearsal,
    rehearsalGuideVisible,
  ]);

  useEffect(() => {
    const dialog = shieldDialog.current;
    if (!dialog) return;
    if (showShieldCard && !dialog.open) dialog.showModal();
    if (!showShieldCard && dialog.open) dialog.close();
  }, [showShieldCard]);

  useEffect(() => {
    if (!held) return;
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    root.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [held]);

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
      const requiresDealReshield = shieldRequired && isDealPhase;
      setShielded(!requiresDealReshield);
      setShieldCountdown(requiresDealReshield ? 5 : 0);
      setRoleSeen(false);
      setPrivateCovered(Boolean(inPrivateMoment && !isDealPhase));
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
  }, [
    id,
    queryClient,
    cancelPrivate,
    shieldRequired,
    inPrivateMoment,
    isDealPhase,
  ]);

  useEffect(() => {
    if (
      !inPrivateMoment ||
      !shielded ||
      !privateView ||
      isDealPhase ||
      actionDone
    )
      return;
    let timer: number;
    const resetIdleTimer = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        cancelPrivate();
        setPrivateCovered(true);
      }, 30_000);
    };
    resetIdleTimer();
    window.addEventListener('pointerdown', resetIdleTimer, true);
    window.addEventListener('keydown', resetIdleTimer);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', resetIdleTimer, true);
      window.removeEventListener('keydown', resetIdleTimer);
    };
  }, [
    inPrivateMoment,
    shielded,
    privateView,
    isDealPhase,
    actionDone,
    cancelPrivate,
  ]);

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
    if (!token || shieldPending || shieldCountdown > 0 || !shieldRequired)
      return;
    setShieldPending(true);
    setHoldMessage('');
    try {
      let nextPrivateView: PrivateView | null = null;
      const notesRequest = notesOpen && !phaseIsPrivate;
      const needsPrivateView = notesRequest || full?.phase === 'SHADOW';
      if (phaseIsPrivate) {
        await command.mutateAsync({
          id,
          data: {
            type: 'AcknowledgePrivate',
            idempotencyKey: idempotencyKey(),
          },
        });
        command.reset();
      }
      if (needsPrivateView) {
        const response = await reveal.mutateAsync({
          id,
          ...(notesRequest ? { data: { purpose: 'notes' as const } } : {}),
        });
        nextPrivateView = isFullView(response.view)
          ? response.view.private
          : null;
        if (!nextPrivateView) throw new Error('Private view unavailable');
      }
      setPrivateView(nextPrivateView);
      setPrivateCovered(false);
      setShielded(true);
    } catch {
      command.reset();
      reveal.reset();
      setShielded(false);
      setHoldMessage(en.game.shieldRetry);
    } finally {
      setShieldPending(false);
      reveal.reset();
    }
  }

  async function restorePrivate() {
    if (!full || !token || !inPrivateMoment || !privateCovered) return;
    if (full.phase === 'VOTE' || full.phase === 'FINAL_BANISH') {
      setPrivateCovered(false);
      return;
    }
    setShieldPending(true);
    setHoldMessage('');
    try {
      const response = await reveal.mutateAsync({
        id,
        ...(notesOpen && !phaseIsPrivate
          ? { data: { purpose: 'notes' as const } }
          : {}),
      });
      const privateData = isFullView(response.view)
        ? response.view.private
        : null;
      if (!privateData) {
        setHoldMessage(en.game.privateUnavailable);
      } else {
        setPrivateView(privateData);
        setPrivateCovered(false);
      }
    } catch {
      setHoldMessage(en.game.privateUnavailable);
    } finally {
      setShieldPending(false);
      reveal.reset();
    }
  }

  function beginHold() {
    if (
      !shielded ||
      full?.phase !== 'DEAL' ||
      notesOpen ||
      !token ||
      heldRef.current ||
      reveal.isPending
    )
      return;
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
        setRoleSeen(true);
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
            setRoleSeen(true);
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
      await command.mutateAsync({
        id,
        data: {
          type: 'AcknowledgePrivate',
          idempotencyKey: idempotencyKey(),
        },
      });
      command.reset();
      clearPrivate();
      setActionDone(true);
      setCommandMessage(en.game.waitingForEveryone);
      setSelected('');
      setConfirmChoice(false);
      setPrivateView(null);
      await gameQuery.refetch();
    } catch {
      command.reset();
      const latestView = (await gameQuery.refetch()).data?.view;
      if (
        latestView &&
        isFullView(latestView) &&
        latestView.phase !== view.phase
      ) {
        clearPrivate();
        setSelected('');
        setConfirmChoice(false);
        setCommandMessage('');
        return;
      }
      setCommandMessage(
        view.phase === 'SHADOW'
          ? en.game.chooseSomeoneElse
          : view.phase === 'VOTE' || view.phase === 'FINAL_BANISH'
            ? en.game.voteNotRecorded
            : en.game.choiceNotRecorded,
      );
      setSelected('');
      setConfirmChoice(false);
    }
  }

  async function moveOn() {
    if (!full?.canAdvancePhase || command.isPending) return;
    const currentPhase = full.phase;
    setCommandMessage('');
    try {
      const latestResult = await gameQuery.refetch();
      const latestView = latestResult.data?.view;
      if (!latestView || !isFullView(latestView)) {
        setCommandMessage(en.game.moveOnFailed);
        return;
      }
      if (latestView.phase !== currentPhase) {
        setAdvanceConfirmationOpen(false);
        return;
      }
      if (!latestView.canAdvancePhase) {
        setCommandMessage(en.game.moveOnFailed);
        return;
      }
      await command.mutateAsync({
        id,
        data: {
          type: 'AdvancePhase',
          expectedVersion: latestView.version,
          idempotencyKey: idempotencyKey(),
        },
      });
      command.reset();
      setAdvanceConfirmationOpen(false);
      setActionDone(false);
      setPrivateView(null);
      setSelected('');
      setConfirmChoice(false);
      await gameQuery.refetch();
    } catch {
      command.reset();
      const refreshed = await gameQuery.refetch();
      setCommandMessage(
        refreshed.data?.view.phase === full.phase ? en.game.moveOnFailed : '',
      );
    }
  }

  function requestMoveOn() {
    if (!full?.rehearsal && unfinishedCount > 0) {
      setAdvanceConfirmationOpen(true);
      return;
    }
    void moveOn();
  }

  function dismissRehearsalGuide() {
    if (!rehearsalGuideStarted) {
      setRehearsalGuideStarted(true);
      return;
    }
    if (explanationKey) setRehearsalGuideDismissedStep(explanationStepKey);
  }

  async function saveNotes() {
    const text = notesDraft.trim();
    if (!privateView || !notesOpen || text.length === 0) return;
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
    <Shell isPlayer privateMode={inPrivateMoment} privateRevealActive={held}>
      <section
        className={
          inPrivateMoment
            ? 'private-player-stage'
            : 'mx-auto w-full max-w-[480px]'
        }
      >
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
          <div
            className={full.canAdvancePhase && activeGame ? 'pb-24' : ''}
            data-testid="player-game"
            data-phase={full.phase}
            data-version={full.version}
            data-shadow-round={full.shadowRound}
            data-progress-done={full.progress.done}
            data-progress-total={full.progress.total}
          >
            {!full.rehearsal && explanationKey && (
              <details className="mb-4 text-sm text-ash">
                <summary className="min-h-11 cursor-pointer py-2">
                  {en.game.whatsThis}
                </summary>
                <p className="mt-2">{en.game.rehearsalGuide[explanationKey]}</p>
              </details>
            )}
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
            {!inPrivateMoment && (
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="display mt-2 text-4xl leading-tight sm:text-5xl">
                    {phaseLabel(full.phase)}
                  </h1>
                </div>
                {!full.rehearsal && secondsLeft !== null && (
                  <p
                    className="text-sm text-ash"
                    aria-label={
                      secondsLeft === 0
                        ? en.game.movingOn
                        : en.game.secondsRemaining(secondsLeft)
                    }
                    role={secondsLeft === 0 ? 'status' : undefined}
                  >
                    {secondsLeft === 0 ? (
                      en.game.movingOn
                    ) : (
                      <>
                        {en.game.timeLeft}{' '}
                        <span className="gold ml-2 font-medium tabular-nums">
                          {Math.floor(secondsLeft / 60)}:
                          {String(secondsLeft % 60).padStart(2, '0')}
                        </span>
                      </>
                    )}
                  </p>
                )}
              </div>
            )}
            {activeGame && !inPrivateMoment && wakeLockFallback && (
              <p role="status" className="mt-4 text-sm text-ash">
                {en.game.wakeLockFallback}
              </p>
            )}
            {!inPrivateMoment && full.phase !== 'FINISHED' && (
              <div className="status-rule mt-6 pt-6">
                <p className="max-w-xl text-ash">
                  {full.paused
                    ? en.game.paused
                    : en.game.progress(full.progress.done, full.progress.total)}
                </p>
              </div>
            )}

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
            {full.phase === 'FINISHED' && ownSeat?.role && full.winner && (
              <p
                className="mt-4 text-lg text-candle"
                data-testid="player-outcome"
                role="status"
              >
                {en.game.playerOutcome(full.winner, ownSeat.role)}
              </p>
            )}

            {!inPrivateMoment &&
              Object.keys(full.ballots).length > 0 &&
              (full.phase === 'VERDICT' ||
                full.phase === 'DAWN' ||
                full.phase === 'FINISHED') && (
                <section className="mt-6" aria-label={en.game.voteResults}>
                  <ul
                    className="divide-y divide-stone"
                    data-testid="list-vote-reveal"
                  >
                    {Object.keys(full.ballots).every((key) =>
                      key.startsWith('anonymous-vote-'),
                    )
                      ? [...new Set(Object.values(full.ballots))].map(
                          (targetId) => {
                            const target = full.seats.find(
                              (seat) => seat.id === targetId,
                            );
                            const count = Object.values(full.ballots).filter(
                              (id) => id === targetId,
                            ).length;
                            return target ? (
                              <li
                                key={targetId}
                                className="py-3 text-ash"
                                data-testid="anonymous-ballot-tally"
                              >
                                {en.game.voteTally(count, target.name)}
                              </li>
                            ) : null;
                          },
                        )
                      : Object.entries(full.ballots).map(
                          ([voterId, targetId]) => {
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
                          },
                        )}
                  </ul>
                </section>
              )}

            {inPrivateMoment && (
              <div className="private-moment-panel">
                {shieldRequired && !shielded ? null : privateCovered ? (
                  <>
                    <button
                      className="primary-action w-full"
                      type="button"
                      onClick={() => void restorePrivate()}
                      disabled={shieldPending || !token}
                    >
                      {en.game.privateRestore}
                    </button>
                    {holdMessage && (
                      <p role="status" className="text-sm text-ash">
                        {holdMessage}
                      </p>
                    )}
                  </>
                ) : full.phase === 'DEAL' && !notesOpen ? (
                  <>
                    <div
                      className="private-role-slot"
                      aria-live="polite"
                      data-testid="private-role-content"
                    >
                      {held && privateView && (
                        <div className="private-role-card">
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
                            <p className="mt-2 text-candle">
                              {privateView.task.instruction}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
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
                          {held ? en.game.holdKeep : en.game.holdText}
                        </span>
                      </span>
                    </button>
                    <p id="hold-instructions" className="text-sm text-ash">
                      {en.game.holdInstructions}
                    </p>
                    {roleSeen && !held && (
                      <button
                        className="primary-action w-full"
                        type="button"
                        onClick={() => {
                          setRoleSeen(false);
                          setActionDone(true);
                          setCommandMessage(en.game.waitingForEveryone);
                        }}
                      >
                        {en.game.notesDone}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div
                      className="private-action-content"
                      aria-live="polite"
                      data-testid="private-choice-content"
                    >
                      {actionDone ? (
                        <p
                          role="status"
                          className="text-center text-ash"
                          data-testid="waiting-for-everyone"
                        >
                          {en.game.waitingForEveryone}
                        </p>
                      ) : notesOpen && !phaseIsPrivate ? (
                        shielded && privateView ? (
                          <div
                            className="enter"
                            data-testid="private-notes-content"
                          >
                            <h2 className="display text-2xl">
                              {en.game.notesHeading}
                            </h2>
                            <p className="mt-2 text-sm text-ash">
                              {en.game.notesPrivateIntro}
                            </p>
                            <div
                              className="mt-4 whitespace-pre-wrap border-y border-stone py-3 text-sm text-ash"
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
                          <p role="status" className="text-sm text-ash">
                            {holdMessage || en.game.privateLoading}
                          </p>
                        )
                      ) : shielded &&
                        !privateCovered &&
                        isActionPhase &&
                        (full.phase !== 'SHADOW' || privateView) ? (
                        <div className="enter">
                          {full.phase === 'SHADOW' && privateView?.task && (
                            <p className="mb-4 text-left text-candle">
                              {privateView.task.instruction}
                            </p>
                          )}
                          <p className="display text-2xl">
                            {full.phase === 'VOTE' ||
                            full.phase === 'FINAL_BANISH'
                              ? en.game.votePrompt
                              : full.phase === 'SHADOW'
                                ? privateView?.role === 'traitor'
                                  ? en.game.shadowTraitorPrompt
                                  : en.game.shadowFaithfulPrompt
                                : en.game.finalDecision}
                          </p>
                          {full.phase === 'SHADOW' && (
                            <p
                              className="mt-2 min-h-12 whitespace-pre-wrap text-left text-sm text-ash"
                              data-testid="shadow-status"
                              aria-live="polite"
                            >
                              {privateView?.role === 'traitor'
                                ? Object.entries(privateView.choices)
                                    .flatMap(([seatId, targetId]) => {
                                      const picker = full.seats.find(
                                        (seat) => seat.id === seatId,
                                      );
                                      const target = full.seats.find(
                                        (seat) => seat.id === targetId,
                                      );
                                      return picker && target
                                        ? [
                                            en.game.shadowPick(
                                              picker.name,
                                              target.name,
                                            ),
                                          ]
                                        : [];
                                    })
                                    .join('\n') || en.game.shadowWaiting
                                : en.game.shadowFaithfulStatus}
                            </p>
                          )}
                          <div
                            className="mt-3 grid gap-2"
                            data-testid="private-choice-list"
                          >
                            {choices.map((choice) => (
                              <button
                                key={choice.id}
                                type="button"
                                className="choice-action"
                                aria-pressed={selected === choice.id}
                                onClick={() => {
                                  setSelected(choice.id);
                                  setConfirmChoice(false);
                                  setActionDone(false);
                                  setCommandMessage('');
                                }}
                              >
                                {choice.name}
                              </button>
                            ))}
                          </div>
                          {selected && !confirmChoice && (
                            <button
                              className="quiet-action mt-4 w-full"
                              type="button"
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
                          {commandMessage && !actionDone && (
                            <p role="status" className="mt-4 text-sm text-ash">
                              {commandMessage}
                            </p>
                          )}
                        </div>
                      ) : held || reveal.isPending || holdMessage ? (
                        <p role="status" className="text-sm text-ash">
                          {holdMessage || en.game.privateLoading}
                        </p>
                      ) : null}
                    </div>
                    {!actionDone && full.phase === 'DEAL' && !notesOpen && (
                      <>
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
                              {held ? en.game.holdKeep : en.game.holdText}
                            </span>
                          </span>
                        </button>
                        <p id="hold-instructions" className="text-sm text-ash">
                          {en.game.holdInstructions}
                        </p>
                      </>
                    )}
                    {notesOpen && !phaseIsPrivate && (
                      <button
                        className="primary-action w-full"
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
                {!full.rehearsal && activeGame && (
                  <Link
                    className="quiet-action my-3 inline-flex min-h-11 items-center"
                    to={webPath(`/coordinate/${encodeURIComponent(full.id)}`)}
                  >
                    {en.entry.organiserControls}
                  </Link>
                )}
                {full.phase === 'LOBBY' && full.lobbyCode && (
                  <section
                    className="mt-5 flex flex-col items-center gap-3 border-y border-stone py-5 text-center"
                    aria-label={en.entry.qrAlt}
                  >
                    <h3 className="text-sm text-ash">{en.entry.codeCaption}</h3>
                    <p
                      className="font-mono text-3xl font-medium tracking-[0.2em] text-candle"
                      data-testid="lobby-room-code"
                    >
                      {full.lobbyCode}
                    </p>
                    <Suspense
                      fallback={
                        <span role="status">{en.entry.qrPreparing}</span>
                      }
                    >
                      <span
                        data-testid="lobby-join-qr"
                        data-join-url={lobbyCodeJoinUrl({
                          origin: window.location.origin,
                          joinPath: webPath(config.routes.join),
                          code: full.lobbyCode,
                        })}
                      >
                        <LobbyQRCode
                          value={lobbyCodeJoinUrl({
                            origin: window.location.origin,
                            joinPath: webPath(config.routes.join),
                            code: full.lobbyCode,
                          })}
                        />
                      </span>
                    </Suspense>
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
                    {fullscreenMessage && (
                      <p role="status" className="text-sm text-ash">
                        {fullscreenMessage}
                      </p>
                    )}
                  </section>
                )}
                {full.missionsEnabled && (
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
                )}

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
                            {full.phase === 'FINISHED' && seat.role
                              ? !isAlive
                                ? en.game.playerOutRole(seat.role)
                                : seat.role === 'traitor'
                                  ? en.game.roleTraitor
                                  : en.game.roleFaithful
                              : isAlive
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
                      .reverse()
                      .map((entry) => (
                        <li
                          key={entry.seq}
                          className="py-3 text-sm text-ash"
                          data-testid={`public-log-entry-${entry.seq}`}
                        >
                          {entry.action === 'device_recovered'
                            ? en.game.publicLogDeviceRecovered(entry.name)
                            : entry.action === 'seat_pin_reset'
                              ? en.game.publicLogPinReset(entry.name)
                              : entry.action === 'dawn'
                                ? en.game.publicLogDawn(
                                    entry.victims.map((victim) => victim.name),
                                  )
                                : entry.action === 'banishment'
                                  ? en.game.publicLogBanishment(entry.seat.name)
                                  : en.game.publicLogFinished(entry.winner)}
                        </li>
                      ))}
                    {full.publicLog.length === 0 && (
                      <li className="py-3 text-sm text-ash">
                        {en.game.noPublicUpdates}
                      </li>
                    )}
                  </ul>
                </section>
                {!full.canAdvancePhase && (
                  <p className="mt-7 text-sm text-ash">{en.game.roomNote}</p>
                )}
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
                {full.phase === 'FINISHED' && (
                  <div className="mt-6 grid gap-3">
                    {full.rehearsal && (
                      <button
                        className="secondary-action w-full"
                        type="button"
                        onClick={() => navigate(config.routes.rehearsal)}
                      >
                        {en.game.rehearseAgain}
                      </button>
                    )}
                    <button
                      className="primary-action w-full"
                      type="button"
                      onClick={() => navigate(config.routes.play)}
                    >
                      {en.game.backToStart}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {full?.canAdvancePhase &&
          activeGame &&
          !showShieldCard &&
          !held &&
          !privateInteractionInProgress &&
          !rehearsalGuideVisible && (
            <section
              aria-label={
                full.rehearsal
                  ? en.game.rehearsalControls
                  : en.game.organiserControls
              }
              className="game-action-bar fixed inset-x-0 z-30 border-t border-stone bg-hearth px-6 pt-3"
              style={{
                paddingBottom: '0.75rem',
              }}
              data-testid="rehearsal-action-bar"
            >
              <div className="mx-auto w-full max-w-[480px]">
                {!full.rehearsal && (
                  <p className="mb-2 text-sm text-ash">
                    {en.game.organiserControls}
                  </p>
                )}
                {commandMessage && (
                  <p role="status" className="mb-2 text-sm text-ash">
                    {commandMessage}
                  </p>
                )}
                <button
                  className={
                    full.rehearsal
                      ? 'primary-action w-full'
                      : 'quiet-action w-full'
                  }
                  type="button"
                  disabled={command.isPending}
                  onClick={requestMoveOn}
                >
                  {full.rehearsal
                    ? en.game.nextRehearsalStep
                    : en.game.organiserMoveOn}
                </button>
              </div>
            </section>
          )}
        {advanceConfirmationOpen && full && !full.rehearsal && (
          <div
            className="game-fullscreen-overlay fixed inset-0 z-50 flex flex-col bg-charcoal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="organiser-confirm-title"
          >
            <TurnstonePlayerHeader />
            <div className="mx-auto my-auto w-full max-w-[480px] border border-stone bg-hearth p-6">
              <h2
                className="display text-2xl text-candle"
                id="organiser-confirm-title"
              >
                {en.game.organiserConfirmMoveOn(unfinishedCount)}
              </h2>
              <div className="mt-6 grid gap-3">
                <button
                  className="primary-action w-full"
                  type="button"
                  onClick={() => void moveOn()}
                >
                  {en.game.organiserConfirm}
                </button>
                <button
                  className="quiet-action w-full"
                  type="button"
                  onClick={() => setAdvanceConfirmationOpen(false)}
                >
                  {en.game.organiserKeepWaiting}
                </button>
              </div>
            </div>
            <BrandFooter
              context="game"
              className="game-brand-footer-overlay"
              testId="brand-footer-confirmation"
            />
          </div>
        )}
        {full?.rehearsal && rehearsalGuideVisible && (
          <div
            className="game-fullscreen-overlay fixed inset-0 z-40 flex flex-col bg-charcoal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rehearsal-guide-title"
            data-testid="rehearsal-explainer"
          >
            <TurnstonePlayerHeader />
            <div className="mx-auto my-auto w-full max-w-[480px]">
              <h2
                className="display text-3xl text-candle"
                id="rehearsal-guide-title"
              >
                {en.game.guideTitle}
              </h2>
              <p
                className="mt-5 text-lg leading-relaxed text-ash"
                data-testid="rehearsal-explanation-copy"
              >
                {en.game.rehearsalGuide[renderedRehearsalGuideKey]}
              </p>
              <button
                className="primary-action mt-8 w-full"
                type="button"
                autoFocus
                onClick={dismissRehearsalGuide}
              >
                {en.game.guideGotIt}
              </button>
            </div>
            <BrandFooter
              context="game"
              className="game-brand-footer-overlay"
              testId="brand-footer-overlay"
            />
          </div>
        )}
        {showShieldCard && (
          <dialog
            ref={shieldDialog}
            className="privacy-shield"
            aria-labelledby="privacy-shield-title"
            onCancel={(event) => event.preventDefault()}
          >
            <TurnstonePlayerHeader />
            <div className="privacy-shield-content">
              <div className="mx-auto w-full max-w-md text-center">
                <h1
                  id="privacy-shield-title"
                  className="display text-3xl sm:text-4xl"
                >
                  {en.game.shieldHeading}
                </h1>
                <p className="mt-4 text-ash">{en.game.shieldDetail}</p>
                <button
                  autoFocus
                  className="primary-action mt-8 min-h-14 w-full"
                  type="button"
                  disabled={!token || shieldPending || shieldCountdown > 0}
                  aria-disabled={!token || shieldPending || shieldCountdown > 0}
                  onClick={() => void acknowledge()}
                >
                  {shieldPending
                    ? en.game.shieldConfirming
                    : shieldCountdown > 0
                      ? en.game.countdown(shieldCountdown)
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
            <BrandFooter
              context="game"
              className="game-brand-footer-overlay"
              testId="brand-footer-overlay"
            />
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
