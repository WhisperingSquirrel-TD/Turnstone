import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
import { gameThemeForPhase } from './game-theme';
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
  RehearsalWatchAction,
  RehearsalWatchCommentary,
} from './RehearsalWatchMode';
import {
  getGetGameViewQueryKey,
  setBaseUrl,
  useGetGameView,
  useRevealPrivateView,
  useSubmitGameCommand,
  type GameCommandInput,
} from '@workspace/api-client-react';
import { requiresPrivacyShield } from './privacy-shield-policy';
import type {
  FullView,
  GameViewResponse,
  PrivateView,
  VisitorView,
} from '@workspace/api-client-react';
import { config } from '@/config';
import { BrandFooter, BrandSurfaceContext } from './BrandFooter';
import {
  GameBottomBar,
  GameHelpDisclosure,
  PlayerTile,
  GameStatusBar,
  WhatIsHappeningCard,
} from './GameChrome';
import { PhaseClipOverlay } from './PhaseClipOverlay';
import { NotesScreen } from './NotesScreen';
import { BanishmentVoteScreen } from './BanishmentVoteScreen';
import { PrivateChoiceControls } from './PrivateChoiceControls';
import { NightChoiceScreen } from './NightChoiceScreen';
import { GameStepAnnouncement } from './GameStepAnnouncement';
import { ConversationPromptsCard } from './ConversationPromptsCard';
import { getDayStartConversationPrompts } from './conversation-prompts';
import { buildNightChoiceStatusLines } from './night-choice-status';
import { orderChoiceOptions } from './choice-order';
import { WhileAwayCard } from './WhileAwayCard';
import {
  privateStepKeyFor,
  shouldPreserveShadowChoice,
  type ShadowChoiceWindow,
} from './private-step-key';
import { VerdictScreen } from './VerdictScreen';
import { ShieldCard } from './ShieldCard';
import { PendingCommandNotice } from './PendingCommandNotice';
import { PhaseProgressStatus } from './PhaseProgressStatus';
import { VoteProgressSummary } from './VoteProgressSummary';
import { VotingCircleScreen } from './VotingCircleScreen';
import { voteCompletionMessage } from './vote-progress';
import { CoordinatorTakeoverPanel } from './CoordinatorTakeoverPanel';
import { apiUrl } from './api-url';
import { en } from '@/locale/en-GB';
import {
  attachGameView,
  type GameConnectionState,
  type GameRealtimeSocket,
} from './game-socket';
import { HoldRoleDemo } from './HoldRoleDemo';
import { lobbyCodeJoinUrl } from './lobby-code-url';
import {
  rehearsalGuideStepKey,
  shouldShowRehearsalGuide,
} from './rehearsal-guide-step';
import { getPublicFacts } from './public-site-content';
import { getAdvanceControlState, isAdvanceConflict } from './advance-control';
import {
  clearPrivateChoiceDraft,
  clearStalePrivateChoiceDrafts,
  createPrivateChoiceDraftKey,
  readPrivateChoiceDraft,
  writePrivateChoiceDraft,
} from './private-choice-draft';
import {
  gameCommandStepKey,
  isDefinitiveCommandRejection,
  PendingCommandStore,
} from './pending-command';
import {
  secondsUntilServerDeadline,
  serverClockOffset,
  serverTimeNow,
} from './server-clock';
import './public-home.css';

setBaseUrl(config.apiOrigin);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
const LazyEntryPage = lazy(async () => {
  const module = await import('./EntryPage');
  return { default: module.EntryPage };
});
const LazyPresenterPage = lazy(async () => {
  const module = await import('./PresenterPage');
  return { default: module.PresenterPage };
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
function choiceIdFromCommand(data: GameCommandInput | undefined) {
  if (data?.type === 'SubmitVote' && typeof data.target === 'string')
    return data.target;
  if (
    (data?.type === 'SubmitShadowChoice' ||
      data?.type === 'SubmitEndgameVote') &&
    typeof data.choice === 'string'
  )
    return data.choice;
  return '';
}
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
  connectionStatus = null,
  hideGameFooter = false,
  phase,
  cycle = 1,
  remaining = 0,
  organiserControlsVisible = false,
  organiserTools,
  onOpenNotes,
}: {
  children: ReactNode;
  isPlayer?: boolean;
  privateMode?: boolean;
  privateRevealActive?: boolean;
  connectionStatus?: GameConnectionState | null;
  hideGameFooter?: boolean;
  phase?: string;
  cycle?: number;
  remaining?: number;
  organiserControlsVisible?: boolean;
  organiserTools?: ReactNode;
  onOpenNotes?: () => void;
}) {
  const navigate = useNavigate();
  const [alwaysDark, setAlwaysDark] = useState(false);
  const theme = gameThemeForPhase(phase, alwaysDark);
  const previousPhase = useRef<string | undefined>(undefined);
  const [themeMessage, setThemeMessage] = useState<string | null>(null);
  const [browserOnline, setBrowserOnline] = useState(true);
  useEffect(() => {
    if (!phase) return;
    const previous = previousPhase.current;
    previousPhase.current = phase;
    if (
      !previous ||
      alwaysDark ||
      (previous === 'SHADOW') === (phase === 'SHADOW')
    ) {
      setThemeMessage(null);
      return;
    }
    setThemeMessage(theme === 'night' ? en.app.nightFalls : en.app.morning);
    const timer = setTimeout(() => setThemeMessage(null), 800);
    return () => clearTimeout(timer);
  }, [phase, theme, alwaysDark]);
  useEffect(() => {
    const update = () => setBrowserOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    if (!isPlayer) return;
    const root = document.querySelector<HTMLElement>('.game-shell');
    if (!root) return;
    const measure = () => {
      const footer = root.querySelector<HTMLElement>('.game-brand-footer');
      const bottomBar = root.querySelector<HTMLElement>('.game-bottom-bar');
      const actions = [
        ...root.querySelectorAll<HTMLElement>(
          '.game-action-bar, .game-action-dock, .game-notes-dock-button',
        ),
      ];
      const footerHeight = footer?.getBoundingClientRect().height ?? 0;
      const bottomBarHeight = bottomBar?.getBoundingClientRect().height ?? 0;
      const actionHeight = Math.max(
        0,
        ...actions.map((action) => action.getBoundingClientRect().height),
      );
      root.style.setProperty('--game-footer-dock-height', `${footerHeight}px`);
      root.style.setProperty(
        '--game-bottom-bar-height',
        `${bottomBarHeight}px`,
      );
      root.style.setProperty('--game-action-dock-height', `${actionHeight}px`);
      root.style.setProperty(
        '--game-bottom-stack-height',
        `${footerHeight + bottomBarHeight + actionHeight}px`,
      );
    };
    const resize = new ResizeObserver(measure);
    const watch = () => {
      resize.disconnect();
      root
        .querySelectorAll(
          '.game-brand-footer, .game-bottom-bar, .game-action-bar, .game-action-dock, .game-notes-dock-button',
        )
        .forEach((element) => resize.observe(element));
      measure();
    };
    const mutations = new MutationObserver(watch);
    mutations.observe(root, { childList: true, subtree: true });
    watch();
    return () => {
      mutations.disconnect();
      resize.disconnect();
    };
  }, [isPlayer]);
  const [standalone, setStandalone] = useState(false);
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
      data-game-theme={isPlayer ? theme : undefined}
      className={`safe-page flex min-h-[100dvh] flex-col${isPlayer ? ` game-shell${hideGameFooter ? '' : ' game-shell--footer-visible'}` : ''}${privateMode ? ' private-moment-shell' : ''}${privateMode && privateRevealActive ? ' private-moment-shell--held' : ''}`}
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
        {isPlayer ? (
          <GameStatusBar
            phase={phase ?? 'DRAFT'}
            cycle={cycle}
            remaining={remaining}
            connectionStatus={
              !browserOnline ? 'offline' : (connectionStatus ?? 'connecting')
            }
            onOpenNotes={onOpenNotes}
            menuContent={
              organiserControlsVisible ? (
                <>
                  {organiserTools}
                  <div className="game-display-settings">
                    <p>{en.app.display}</p>
                    <label>
                      <input
                        type="checkbox"
                        checked={alwaysDark}
                        onChange={(event) =>
                          setAlwaysDark(event.target.checked)
                        }
                      />
                      {en.app.alwaysDark}
                    </label>
                  </div>
                  {standalone && (
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
                </>
              ) : undefined
            }
          />
        ) : (
          <>
            <Link
              to={config.routes.home}
              aria-label={config.appName}
              className="oathstone-wordmark"
            >
              <span>
                {config.appName.slice(0, -config.wordmarkAccentSuffix.length)}
              </span>
              <span className="text-gilt">{config.wordmarkAccentSuffix}</span>
            </Link>
            <nav
              aria-label={en.nav.label}
              className="public-home-nav text-sm text-ash"
            >
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
            </nav>
          </>
        )}
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
      {isPlayer && themeMessage && (
        <div className="game-theme-transition" role="status" aria-live="polite">
          {themeMessage}
        </div>
      )}
      <main
        id="main"
        tabIndex={-1}
        className={`mx-auto w-full max-w-5xl flex-1 py-10 sm:py-16${privateMode ? ' private-moment-main' : ''}${isPlayer ? ' game-shell-main' : ''}`}
      >
        <BrandSurfaceContext.Provider
          value={isPlayer && theme === 'day' ? 'light' : 'dark'}
        >
          {children}
        </BrandSurfaceContext.Provider>
      </main>
      {isPlayer && <GameBottomBar active="game" />}
      {(!isPlayer || !hideGameFooter) && (
        <BrandFooter
          context={isPlayer ? 'game' : 'public'}
          surface={isPlayer && theme === 'day' ? 'light' : 'dark'}
          className={
            isPlayer
              ? 'game-brand-footer'
              : 'mx-auto mt-8 w-full max-w-5xl py-3'
          }
          testId="brand-footer-shell"
        />
      )}
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
  return (
    <Suspense fallback={<main role="status">{en.entry.loadingSetup}</main>}>
      <LazyEntryPage mode={mode} csrfToken={csrfToken} />
    </Suspense>
  );
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

function OathstonePlayerHeader() {
  return (
    <header
      className="entry-brand"
      aria-label={config.appName}
      data-testid="player-brand-header"
    >
      <Link
        to={config.routes.home}
        className="oathstone-wordmark"
        aria-label={config.appName}
        data-testid="text-entry-brand"
      >
        <span>
          {config.appName.slice(0, -config.wordmarkAccentSuffix.length)}
        </span>
        <span className="text-gilt">{config.wordmarkAccentSuffix}</span>
      </Link>
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

function publicLogMessage(entry: FullView['publicLog'][number]): string {
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
  if (entry.action === 'seat_left_disconnected')
    return en.game.publicLogDisconnectedSeatLeft(entry.seat.name);
  if (entry.action === 'seat_reinstated')
    return en.game.publicLogSeatReinstated(entry.seat.name);
  if (entry.action === 'coordinator_role_moved')
    return en.game.publicLogCoordinatorRoleMoved;
  if (entry.action === 'phase_action_skipped')
    return en.game.publicLogPhaseActionSkipped(entry.seat.name);
  if (entry.action === 'phase_action_skip_undone')
    return en.game.publicLogPhaseActionSkipUndone(entry.seat.name);
  if (entry.action === 'schedule_shift')
    return en.game.publicLogScheduleShift(entry.minutes);
  if (entry.action === 'coordinator_undo')
    return en.game.publicLogCoordinatorUndo;
  return en.game.publicLogFinished(entry.winner);
}

type AwaySnapshot = {
  lastPublicSeq: number | null;
  showEmptyCard: boolean;
};

function publicUpdatesSince(
  publicLog: FullView['publicLog'],
  lastPublicSeq: number | null,
): string[] {
  if (lastPublicSeq === null) return [];
  return publicLog
    .filter((entry) => entry.seq > lastPublicSeq)
    .sort((first, second) => first.seq - second.seq)
    .map(publicLogMessage);
}

function awayCursorStorageKey(gameId: string): string {
  return `oathstone-away-seq:${gameId}`;
}

function readAwayCursor(gameId: string): AwaySnapshot | null {
  if (!gameId || typeof window === 'undefined') return null;
  try {
    const saved = window.localStorage.getItem(awayCursorStorageKey(gameId));
    if (saved === null) return null;
    try {
      const parsed: unknown = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        const candidate = parsed as Partial<AwaySnapshot>;
        const sequenceIsValid =
          candidate.lastPublicSeq === null ||
          (typeof candidate.lastPublicSeq === 'number' &&
            Number.isSafeInteger(candidate.lastPublicSeq) &&
            candidate.lastPublicSeq >= 0);
        if (sequenceIsValid && typeof candidate.showEmptyCard === 'boolean') {
          return {
            lastPublicSeq: candidate.lastPublicSeq ?? null,
            showEmptyCard: candidate.showEmptyCard,
          };
        }
      }
    } catch {
      // Read the earlier numeric cursor format as a no-empty-card snapshot.
    }
    const legacySequence = Number(saved);
    return Number.isSafeInteger(legacySequence) && legacySequence >= 0
      ? { lastPublicSeq: legacySequence, showEmptyCard: false }
      : null;
  } catch {
    return null;
  }
}

function storeAwayCursor(gameId: string, snapshot: AwaySnapshot) {
  try {
    window.localStorage.setItem(
      awayCursorStorageKey(gameId),
      JSON.stringify(snapshot),
    );
  } catch {
    // In-memory state still supports the open page when storage is blocked.
  }
}

function PlayerGame() {
  const { id = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const showRehearsalStartGuide =
    (location.state as { showRehearsalStartGuide?: boolean } | null)
      ?.showRehearsalStartGuide === true;
  const token = useContext(csrfContext);
  const install = useContext(installContext);
  const queryClient = useQueryClient();
  const [shielded, setShielded] = useState(false);
  const shieldedShadowCycle = useRef<number | null>(null);
  const requestedShadowPrivateViewKey = useRef<string | null>(null);
  const currentShadowPrivateViewKeyRef = useRef<string | null>(null);
  const acknowledgedShadowPrivateViewKey = useRef<string | null>(null);
  const openingShadowPrivateViewKey = useRef<string | null>(null);
  const [shieldPending, setShieldPending] = useState(false);
  const [held, setHeld] = useState(false);
  const [roleSeen, setRoleSeen] = useState(false);
  const [shieldCountdown, setShieldCountdown] = useState(3);
  const [holdProgress, setHoldProgress] = useState(0);
  const [privateView, setPrivateView] = useState<PrivateView | null>(null);
  const [privateCovered, setPrivateCovered] = useState(false);
  const [holdMessage, setHoldMessage] = useState('');
  const [selected, setSelected] = useState('');
  const previousShadowChoiceWindow = useRef<ShadowChoiceWindow | null>(null);
  const [confirmChoice, setConfirmChoice] = useState(false);
  const [actionDone, setActionDone] = useState(false);
  const [commandMessage, setCommandMessage] = useState('');
  const [advanceLocalNow, setAdvanceLocalNow] = useState(() => Date.now());
  const [installMessage, setInstallMessage] = useState('');
  const [wakeLockFallback, setWakeLockFallback] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<GameConnectionState>('connecting');
  const [resumeStatus, setResumeStatus] = useState<
    'idle' | 'syncing' | 'failed'
  >(() => (readAwayCursor(id) === null ? 'idle' : 'syncing'));
  const [whileAwayUpdates, setWhileAwayUpdates] = useState<string[] | null>(
    null,
  );
  const isResuming = resumeStatus !== 'idle' || readAwayCursor(id) !== null;
  const [fullscreenMessage, setFullscreenMessage] = useState('');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesStatus, setNotesStatus] = useState('');
  const [rehearsalGuideDismissedSteps, setRehearsalGuideDismissedSteps] =
    useState<Set<string>>(() => new Set());
  const [advanceConfirmationOpen, setAdvanceConfirmationOpen] = useState(false);
  const heldRef = useRef(false);
  const holdVersion = useRef(0);
  const privateResult = useRef<PrivateView | null>(null);
  const privateVersionRef = useRef(0);
  const notesRequestPending = useRef(false);
  const notesRequestStartedForOpen = useRef(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const shieldDialog = useRef<HTMLDialogElement | null>(null);
  const focusTime = useRef(0);
  const serverClockOffsetMs = useRef(0);
  const ignoreSyntheticClick = useRef(false);
  const awaySnapshot = useRef<AwaySnapshot | null>(null);
  const pageIsHiding = useRef(false);
  const lastPublicSeq = useRef(0);
  const resyncPromise = useRef<Promise<void> | null>(null);
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
  const pendingCommandsRef =
    useRef<PendingCommandStore<GameCommandInput> | null>(null);
  if (pendingCommandsRef.current === null)
    pendingCommandsRef.current = new PendingCommandStore<GameCommandInput>();
  const pendingCommands = pendingCommandsRef.current;
  const response = gameQuery.data;
  const view = response?.view;
  const full = view && isFullView(view) ? view : null;
  const commandStepKey = full
    ? gameCommandStepKey({
        gameId: id,
        viewerSeatId: full.viewerSeatId ?? null,
        phase: full.phase,
        cycle: full.cycle,
        revote: full.revote,
        shadowRound: full.shadowRound,
        shadowSlot: full.shadowSlot,
      })
    : '';
  useEffect(() => {
    if (commandStepKey) pendingCommands.clearForStep(commandStepKey);
  }, [commandStepKey, pendingCommands]);
  const visitor = view && !isFullView(view) ? (view as VisitorView) : null;
  const responseServerNow = response?.serverNow;
  const advanceClockOffsetMs = useMemo(
    () =>
      responseServerNow === undefined
        ? serverClockOffsetMs.current
        : serverClockOffset(responseServerNow, Date.now()),
    [responseServerNow],
  );
  const advanceControl = getAdvanceControlState({
    minimumAdvanceAt: full?.coordinatorMinimumAdvanceAt,
    localNow: advanceLocalNow,
    serverClockOffsetMs: advanceClockOffsetMs,
    busy: command.isPending,
    paused: full?.paused ?? false,
  });
  const waitingForAdvanceMinimum = advanceControl.waitSeconds > 0;
  useEffect(() => {
    if (response) {
      serverClockOffsetMs.current = serverClockOffset(
        response.serverNow,
        Date.now(),
      );
      setAdvanceLocalNow(Date.now());
    }
  }, [response?.serverNow]);
  useEffect(() => {
    if (!full?.canAdvancePhase || !waitingForAdvanceMinimum) return;
    const timer = window.setInterval(() => setAdvanceLocalNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [
    full?.canAdvancePhase,
    full?.coordinatorMinimumAdvanceAt,
    waitingForAdvanceMinimum,
  ]);
  useEffect(() => {
    const savedSnapshot = readAwayCursor(id);
    awaySnapshot.current = savedSnapshot;
    pageIsHiding.current = false;
    lastPublicSeq.current = 0;
    resyncPromise.current = null;
    setResumeStatus(savedSnapshot === null ? 'idle' : 'syncing');
    setWhileAwayUpdates(null);
  }, [id]);
  useEffect(() => {
    if (!full) return;
    const latestSeq = full.publicLog.reduce(
      (maximum, entry) => Math.max(maximum, entry.seq),
      0,
    );
    lastPublicSeq.current = Math.max(lastPublicSeq.current, latestSeq);
    if (awaySnapshot.current?.lastPublicSeq === null) {
      awaySnapshot.current.lastPublicSeq = latestSeq;
      storeAwayCursor(id, awaySnapshot.current);
    }
    if (awaySnapshot.current && !isResuming) {
      const updates = publicUpdatesSince(
        full.publicLog,
        awaySnapshot.current.lastPublicSeq,
      );
      setWhileAwayUpdates(
        updates.length > 0 || awaySnapshot.current.showEmptyCard
          ? updates
          : null,
      );
      awaySnapshot.current = null;
      try {
        window.localStorage.removeItem(awayCursorStorageKey(id));
      } catch {
        // The in-memory away card remains available when storage is blocked.
      }
    }
  }, [full, id, isResuming]);
  const explanationKey = full
    ? explanationKeyForPhase(full.phase, notesOpen)
    : null;
  const conversationPrompts = useMemo(
    () =>
      full?.phase === 'DEBATE' ? getDayStartConversationPrompts(full) : [],
    [full],
  );
  const explanationStepKey = full
    ? rehearsalGuideStepKey({
        phase: full.phase,
        cycle: full.cycle,
        deadline: full.deadline,
        revote: full.revote,
        shadowRound: full.shadowRound,
        shadowSlot: full.shadowSlot,
        notesOpen,
      })
    : '';
  const renderedRehearsalGuideKey: RehearsalGuideKey =
    full?.rehearsal && showRehearsalStartGuide
      ? 'start'
      : (explanationKey ?? 'start');
  const rehearsalGuideVisible = shouldShowRehearsalGuide({
    rehearsal: Boolean(full?.rehearsal),
    started: !showRehearsalStartGuide,
    explanationAvailable: Boolean(explanationKey),
    stepKey: explanationStepKey,
    dismissedStepKeys: rehearsalGuideDismissedSteps,
  });
  const ownSeat = full?.viewerSeatId
    ? (full.seats.find((seat) => seat.id === full.viewerSeatId) ?? null)
    : null;
  const ownTakenThisDawn = Boolean(
    full?.phase === 'DAWN' &&
    ownSeat?.status === 'murdered' &&
    full.viewerSeatId &&
    full.publicAnnouncement?.kind === 'dawn' &&
    full.publicAnnouncement.victims.some(
      (victim) => victim.id === full.viewerSeatId,
    ),
  );
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
    full && requiresPrivacyShield(full.phase, notesOpen),
  );
  const isActionPhase = Boolean(
    full &&
    ['VOTE', 'SHADOW', 'FINAL_VOTE', 'FINAL_BANISH'].includes(full.phase),
  );
  const hasPlayerSeat = Boolean(full);
  const privateChoiceDraftKey =
    isActionPhase && ownSeat?.status === 'alive' && full?.viewerSeatId
      ? createPrivateChoiceDraftKey({
          gameId: id,
          seatId: full.viewerSeatId,
          phase: full.phase,
          cycle: full.cycle,
          slot: full.phase === 'SHADOW' ? full.shadowSlot : full.revote ? 1 : 0,
        })
      : null;
  const privateOptions = privateView?.options ?? [];
  const choices = orderChoiceOptions({
    choices:
      ownSeat?.status !== 'alive'
        ? []
        : full?.phase === 'VOTE' || full?.phase === 'FINAL_BANISH'
          ? eligibleSeats
              .filter((seat) => seat.id !== full.viewerSeatId)
              .map(({ id: seatId, name }) => ({ id: seatId, name }))
          : full?.phase === 'SHADOW'
            ? privateOptions
            : full?.phase === 'FINAL_VOTE'
              ? [
                  { id: 'end', name: 'End the game' },
                  { id: 'continue', name: 'Continue playing' },
                ]
              : [],
    seats: full?.seats ?? [],
    phase: full?.phase,
    seed: `${id}:${full?.viewerSeatId ?? ''}:${full?.phase ?? ''}:${full?.cycle ?? 0}:${full?.shadowSlot ?? 0}`,
  });
  const choiceIdsSignature = JSON.stringify(
    choices.map(({ id: seatId }) => seatId),
  );
  useEffect(() => {
    if (!response) return;
    try {
      const storage = window.sessionStorage;
      clearStalePrivateChoiceDrafts(storage, privateChoiceDraftKey);
      if (!privateChoiceDraftKey || choices.length === 0) return;
      const savedChoice = readPrivateChoiceDraft(
        storage,
        privateChoiceDraftKey,
      );
      if (!savedChoice) return;
      const availableChoiceIds = new Set(
        JSON.parse(choiceIdsSignature) as string[],
      );
      if (!availableChoiceIds.has(savedChoice)) {
        clearPrivateChoiceDraft(storage, privateChoiceDraftKey);
        if (selected === savedChoice) setSelected('');
        return;
      }
      if (!selected) setSelected(savedChoice);
    } catch {
      // In-memory selection remains available when browser storage is blocked.
    }
  }, [
    response,
    privateChoiceDraftKey,
    choiceIdsSignature,
    privateView,
    full?.version,
    selected,
  ]);
  const tieCandidateNames =
    full?.revote && (full.phase === 'VOTE' || full.phase === 'FINAL_BANISH')
      ? full.voteCandidates.flatMap((seatId) => {
          const seat = full.seats.find((candidate) => candidate.id === seatId);
          return seat ? [seat.name] : [];
        })
      : [];
  const isBanishmentPhase = Boolean(
    full && (full.phase === 'VOTE' || full.phase === 'FINAL_BANISH'),
  );
  const voteProgressRows =
    full?.seats
      .filter((seat) => seat.status === 'alive')
      .map((seat) => ({
        id: seat.id,
        name: seat.name,
        hasVoted: full.votedSeatIds.includes(seat.id),
      })) ?? [];
  const longBanishmentRoster = isBanishmentPhase && voteProgressRows.length > 8;
  const completedVoteMessage = full ? voteCompletionMessage(full) : null;
  const ownBanishmentVoteRecorded = Boolean(
    full?.viewerSeatId &&
    isBanishmentPhase &&
    full.votedSeatIds.includes(full.viewerSeatId),
  );
  const showPrivateWaitingMessage = Boolean(
    full &&
    full.phase !== 'SHADOW' &&
    (actionDone || ownBanishmentVoteRecorded),
  );
  const shadowStatusLines =
    full && privateView
      ? buildNightChoiceStatusLines({
          role: privateView.role,
          viewerSeatId: full.viewerSeatId ?? '',
          murderSlots: full.murderSlots,
          traitorTeam: privateView.team
            .filter((member) => member.role === 'traitor')
            .map(({ id, name }) => ({ id, name })),
          choiceSlots: privateView.choiceSlots,
          seats: full.seats.map(({ id, name }) => ({ id, name })),
        })
      : ['', '', '', ''];

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
    setConnectionStatus('connecting');
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
      setConnectionStatus,
    );
    return () => {
      detach();
      socket.disconnect();
    };
  }, [id, hasPlayerSeat, queryClient]);

  const clearPrivate = useCallback(
    (
      options: {
        preservePrivateView?: boolean;
        preserveSelection?: boolean;
        preserveChoiceProgress?: boolean;
        preserveSyntheticClick?: boolean;
      } = {},
    ) => {
      if (!options.preserveSyntheticClick) ignoreSyntheticClick.current = false;
      heldRef.current = false;
      holdVersion.current += 1;
      setHeld(false);
      if (!options.preservePrivateView) {
        setPrivateView(null);
        privateResult.current = null;
        privateVersionRef.current = 0;
      }
      if (!options.preserveSelection) setSelected('');
      if (!options.preserveChoiceProgress) {
        setConfirmChoice(false);
        setActionDone(false);
      }
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
  const shadowPrivateViewKey =
    full?.phase === 'SHADOW'
      ? `${id}:${full.cycle}:${full.shadowRound}:${full.shadowSlot}`
      : null;
  currentShadowPrivateViewKeyRef.current = shadowPrivateViewKey;
  const revealAcknowledgedShadowWindow = useCallback(
    async (key: string): Promise<GameViewResponse | null> => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (
          currentShadowPrivateViewKeyRef.current !== key ||
          acknowledgedShadowPrivateViewKey.current !== key
        )
          return null;
        try {
          const response = await reveal.mutateAsync({ id });
          const nextView = response.view;
          if (
            currentShadowPrivateViewKeyRef.current !== key ||
            acknowledgedShadowPrivateViewKey.current !== key ||
            !isFullView(nextView) ||
            nextView.phase !== 'SHADOW' ||
            `${id}:${nextView.cycle}:${nextView.shadowRound}:${nextView.shadowSlot}` !==
              key
          )
            return null;
          return response;
        } catch (error) {
          if (attempt === 4 || !isAdvanceConflict(error)) throw error;
          // Other seats can advance the version between the server's private
          // projection and undo-window CAS. Retry the read, never the choice.
          await new Promise((resolve) =>
            window.setTimeout(resolve, 100 * (attempt + 1)),
          );
        }
      }
      return null;
    },
    [id, reveal.mutateAsync],
  );
  const privateStepKey = full
    ? privateStepKeyFor({
        phase: full.phase,
        cycle: full.cycle,
        deadline: full.deadline,
        shadowSlot: full.shadowSlot,
        shadowRound: full.shadowRound,
        notesOpen,
      })
    : 'none';
  const activeGame = Boolean(
    full && !['DRAFT', 'LOBBY', 'FINISHED', 'ARCHIVED'].includes(full.phase),
  );
  const watchingRehearsal = Boolean(
    full?.rehearsal && ownSeat && ownSeat.status !== 'alive',
  );
  const unfinishedCount = Math.max(
    0,
    (full?.progress.total ?? 0) - (full?.progress.done ?? 0),
  );
  const privateInteractionInProgress = Boolean(
    inPrivateMoment && (!actionDone || notesOpen),
  );
  const isDealPhase = full?.phase === 'DEAL';
  const returnState = useRef({
    shieldRequired,
    inPrivateMoment,
    isDealPhase,
    notesOpen,
  });
  returnState.current = {
    shieldRequired,
    inPrivateMoment,
    isDealPhase,
    notesOpen,
  };
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
    const nextShadowChoiceWindow =
      full?.phase === 'SHADOW'
        ? {
            gameId: id,
            cycle: full.cycle,
            slot: full.shadowSlot,
            round: full.shadowRound,
          }
        : null;
    const preserveShadowSelection = shouldPreserveShadowChoice(
      previousShadowChoiceWindow.current,
      nextShadowChoiceWindow,
    );
    clearPrivate(
      preserveShadowSelection
        ? { preservePrivateView: true, preserveSelection: true }
        : undefined,
    );
    if (nextShadowChoiceWindow)
      previousShadowChoiceWindow.current = nextShadowChoiceWindow;
    const keepNightShield =
      full?.phase === 'SHADOW' && shieldedShadowCycle.current === full.cycle;
    setShielded(!shieldRequired || keepNightShield);
    setRoleSeen(false);
    setPrivateCovered(false);
    setShieldCountdown(shieldRequired && !keepNightShield ? 3 : 0);
    if (keepNightShield && shadowPrivateViewKey) {
      if (requestedShadowPrivateViewKey.current !== shadowPrivateViewKey) {
        requestedShadowPrivateViewKey.current = shadowPrivateViewKey;
        openingShadowPrivateViewKey.current = shadowPrivateViewKey;
        setHoldMessage(en.game.privateLoading);
        void (async () => {
          try {
            let acknowledged = false;
            for (let attempt = 0; attempt < 2; attempt += 1) {
              if (
                currentShadowPrivateViewKeyRef.current !== shadowPrivateViewKey
              )
                return;
              const latest = await gameQuery.refetch();
              const latestView = latest.data?.view;
              const latestShadowKey =
                latestView && isFullView(latestView)
                  ? `${id}:${latestView.cycle}:${latestView.shadowRound}:${latestView.shadowSlot}`
                  : null;
              if (latestShadowKey !== shadowPrivateViewKey) return;
              try {
                const acknowledgementResponse = await pendingCommands.send(
                  'private-phase-acknowledgement',
                  commandStepKey,
                  () => ({
                    type: 'AcknowledgePrivate',
                    idempotencyKey: idempotencyKey(),
                  }),
                  (payload) => command.mutateAsync({ id, data: payload }),
                );
                const acknowledgedView = acknowledgementResponse.view;
                if (
                  currentShadowPrivateViewKeyRef.current !==
                    shadowPrivateViewKey ||
                  !isFullView(acknowledgedView) ||
                  acknowledgedView.phase !== 'SHADOW' ||
                  `${id}:${acknowledgedView.cycle}:${acknowledgedView.shadowRound}:${acknowledgedView.shadowSlot}` !==
                    shadowPrivateViewKey
                )
                  return;
                pendingCommands.confirm(
                  'private-phase-acknowledgement',
                  commandStepKey,
                );
                acknowledgedShadowPrivateViewKey.current = shadowPrivateViewKey;
                acknowledged = true;
                break;
              } catch (error) {
                // A competing bot update can invalidate the command version.
                // Refetch once and retry; the private-view endpoint still
                // enforces that acknowledgement succeeded before data is shown.
                if (isDefinitiveCommandRejection(error)) {
                  pendingCommands.reject(
                    'private-phase-acknowledgement',
                    commandStepKey,
                  );
                  break;
                }
              }
            }
            if (!acknowledged)
              throw new Error('Private acknowledgement failed');
            if (currentShadowPrivateViewKeyRef.current !== shadowPrivateViewKey)
              return;
            const response =
              await revealAcknowledgedShadowWindow(shadowPrivateViewKey);
            if (
              !response ||
              currentShadowPrivateViewKeyRef.current !== shadowPrivateViewKey ||
              response.version < privateVersionRef.current
            )
              return;
            const nextPrivateView = isFullView(response.view)
              ? response.view.private
              : null;
            if (!nextPrivateView) {
              setHoldMessage(en.game.privateUnavailable);
              setPrivateCovered(true);
              return;
            }
            privateVersionRef.current = response.version;
            setPrivateView(nextPrivateView);
            setPrivateCovered(false);
            setHoldMessage('');
          } catch {
            if (currentShadowPrivateViewKeyRef.current !== shadowPrivateViewKey)
              return;
            setHoldMessage(en.game.privateUnavailable);
            setPrivateCovered(true);
          } finally {
            if (openingShadowPrivateViewKey.current === shadowPrivateViewKey)
              openingShadowPrivateViewKey.current = null;
            if (
              currentShadowPrivateViewKeyRef.current === shadowPrivateViewKey
            ) {
              command.reset();
              reveal.reset();
            }
          }
        })();
      }
      return;
    }
    if (full?.rehearsal && rehearsalGuideVisible) return;
    if (!shieldRequired) return;
    const startedAt = serverTimeNow(Date.now(), serverClockOffsetMs.current);
    const timer = window.setInterval(() => {
      const elapsedSeconds = Math.floor(
        (serverTimeNow(Date.now(), serverClockOffsetMs.current) - startedAt) /
          1000,
      );
      setShieldCountdown(Math.max(0, 3 - elapsedSeconds));
    }, 100);
    return () => window.clearInterval(timer);
  }, [
    privateStepKey,
    inPrivateMoment,
    shieldRequired,
    clearPrivate,
    full?.phase,
    full?.cycle,
    shadowPrivateViewKey,
    commandStepKey,
    pendingCommands,
    id,
    gameQuery.refetch,
    command.mutateAsync,
    command.reset,
    reveal.mutateAsync,
    revealAcknowledgedShadowWindow,
    reveal.reset,
    full?.rehearsal,
    rehearsalGuideVisible,
  ]);

  useEffect(() => {
    shieldedShadowCycle.current = null;
    requestedShadowPrivateViewKey.current = null;
    acknowledgedShadowPrivateViewKey.current = null;
    openingShadowPrivateViewKey.current = null;
    setRehearsalGuideDismissedSteps(new Set());
  }, [id]);

  useEffect(() => {
    if (!notesOpen || phaseIsPrivate) {
      notesRequestStartedForOpen.current = false;
      return;
    }
    if (notesRequestPending.current || notesRequestStartedForOpen.current)
      return;

    notesRequestStartedForOpen.current = true;
    notesRequestPending.current = true;
    setNotesStatus('');
    void reveal
      .mutateAsync({ id, data: { purpose: 'notes' } })
      .then((response) => {
        const nextPrivateView = isFullView(response.view)
          ? response.view.private
          : null;
        if (!nextPrivateView) {
          setNotesStatus(en.game.privateUnavailable);
          return;
        }
        setPrivateView(nextPrivateView);
        setPrivateCovered(false);
      })
      .catch(() => {
        setNotesStatus(en.game.privateUnavailable);
        setHoldMessage(en.game.privateUnavailable);
        setPrivateCovered(true);
      })
      .finally(() => {
        notesRequestPending.current = false;
        reveal.reset();
      });
  }, [notesOpen, phaseIsPrivate, id, reveal.mutateAsync, reveal.reset]);

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
    let active = true;
    const coverPrivate = () => {
      clearPrivate({
        preserveSelection: true,
        preserveChoiceProgress: true,
      });
      const currentState = returnState.current;
      const requiresDealReshield =
        currentState.shieldRequired && currentState.isDealPhase;
      setShielded(!requiresDealReshield);
      setShieldCountdown(requiresDealReshield ? 5 : 0);
      setRoleSeen(false);
      setPrivateCovered(
        Boolean(currentState.inPrivateMoment && !currentState.isDealPhase),
      );
    };
    const markAwayAndCover = (
      showEmptyCard: boolean,
      replaceEmptyCardChoice = false,
    ) => {
      if (!awaySnapshot.current) {
        const cachedView = queryClient.getQueryData<GameViewResponse>(
          getGetGameViewQueryKey(id),
        )?.view;
        const latestSeq =
          cachedView && isFullView(cachedView)
            ? cachedView.publicLog.reduce(
                (maximum, entry) => Math.max(maximum, entry.seq),
                0,
              )
            : lastPublicSeq.current || null;
        awaySnapshot.current = { lastPublicSeq: latestSeq, showEmptyCard };
        setWhileAwayUpdates(null);
      } else if (showEmptyCard || replaceEmptyCardChoice) {
        awaySnapshot.current.showEmptyCard = showEmptyCard;
      }
      storeAwayCursor(id, awaySnapshot.current);
      coverPrivate();
    };
    const resync = () => {
      if (
        document.visibilityState !== 'visible' ||
        !active ||
        resyncPromise.current
      )
        return;
      setResumeStatus('syncing');
      const pending = (async () => {
        try {
          const previousView = queryClient.getQueryData<GameViewResponse>(
            getGetGameViewQueryKey(id),
          )?.view;
          const result = await gameQuery.refetch();
          if (!active) return;
          if (result.isError || !result.data) {
            setResumeStatus('failed');
            return;
          }
          const refreshedView = result.data.view;
          if (isFullView(refreshedView)) {
            if (previousView && isFullView(previousView)) {
              const previousStep = privateStepKeyFor({
                phase: previousView.phase,
                cycle: previousView.cycle,
                deadline: previousView.deadline,
                shadowSlot: previousView.shadowSlot,
                shadowRound: previousView.shadowRound,
                notesOpen: returnState.current.notesOpen,
              });
              const refreshedStep = privateStepKeyFor({
                phase: refreshedView.phase,
                cycle: refreshedView.cycle,
                deadline: refreshedView.deadline,
                shadowSlot: refreshedView.shadowSlot,
                shadowRound: refreshedView.shadowRound,
                notesOpen: returnState.current.notesOpen,
              });
              if (previousStep !== refreshedStep) {
                clearPrivate();
                setSelected('');
                setConfirmChoice(false);
                setActionDone(false);
              }
            }
            const snapshot = awaySnapshot.current;
            if (snapshot) {
              const updates = publicUpdatesSince(
                refreshedView.publicLog,
                snapshot.lastPublicSeq,
              );
              setWhileAwayUpdates(
                updates.length > 0 || snapshot.showEmptyCard ? updates : null,
              );
            } else {
              setWhileAwayUpdates(null);
            }
            lastPublicSeq.current = Math.max(
              lastPublicSeq.current,
              refreshedView.publicLog.reduce(
                (maximum, entry) => Math.max(maximum, entry.seq),
                0,
              ),
            );
          } else {
            setWhileAwayUpdates(null);
          }
          awaySnapshot.current = null;
          try {
            window.localStorage.removeItem(awayCursorStorageKey(id));
          } catch {
            // The UI still clears the cursor when browser storage is blocked.
          }
          setResumeStatus('idle');
        } catch {
          if (active) setResumeStatus('failed');
        } finally {
          resyncPromise.current = null;
        }
      })();
      resyncPromise.current = pending;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        pageIsHiding.current = false;
        resync();
      } else if (!pageIsHiding.current) {
        markAwayAndCover(true);
      }
    };
    const onPageShow = () => {
      pageIsHiding.current = false;
      resync();
    };
    const onOnline = () => resync();
    const onFocus = () => resync();
    const onOffline = () => markAwayAndCover(true);
    const onBlur = () => markAwayAndCover(false);
    const onPageHide = () => {
      pageIsHiding.current = true;
      markAwayAndCover(false, true);
    };
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    if (!navigator.onLine) markAwayAndCover(true);
    else if (awaySnapshot.current) resync();
    return () => {
      active = false;
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      clearPrivate();
    };
  }, [id, queryClient, gameQuery.refetch, clearPrivate]);

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
    const currentView = gameQuery.data?.view;
    if (
      !currentView ||
      !isFullView(currentView) ||
      currentView.deadline === null ||
      currentView.paused
    ) {
      setSecondsLeft(null);
      return;
    }
    const deadline = currentView.deadline;
    const update = () => {
      setSecondsLeft(
        secondsUntilServerDeadline(
          deadline,
          Date.now(),
          serverClockOffsetMs.current,
        ),
      );
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [gameQuery.data]);

  async function acknowledge(restoringPrivate = false) {
    const pendingAcknowledgement = pendingCommands.get(
      'private-phase-acknowledgement',
      commandStepKey,
    );
    if (
      !token ||
      shieldPending ||
      (!restoringPrivate &&
        (shieldCountdown > 0 || (!shieldRequired && !pendingAcknowledgement)))
    )
      return;
    setShieldPending(true);
    setHoldMessage('');
    try {
      let nextPrivateView: PrivateView | null = null;
      const notesRequest = notesOpen && !phaseIsPrivate;
      const needsPrivateView =
        restoringPrivate || notesRequest || full?.phase === 'SHADOW';
      if (phaseIsPrivate) {
        const acknowledgementResponse = await pendingCommands.send(
          'private-phase-acknowledgement',
          commandStepKey,
          () => ({
            type: 'AcknowledgePrivate',
            idempotencyKey: idempotencyKey(),
          }),
          (payload) => command.mutateAsync({ id, data: payload }),
        );
        pendingCommands.confirm(
          'private-phase-acknowledgement',
          commandStepKey,
        );
        command.reset();
        if (full?.phase === 'SHADOW' && shadowPrivateViewKey) {
          const acknowledgedView = acknowledgementResponse.view;
          if (
            currentShadowPrivateViewKeyRef.current !== shadowPrivateViewKey ||
            !isFullView(acknowledgedView) ||
            acknowledgedView.phase !== 'SHADOW' ||
            `${id}:${acknowledgedView.cycle}:${acknowledgedView.shadowRound}:${acknowledgedView.shadowSlot}` !==
              shadowPrivateViewKey
          )
            return;
          acknowledgedShadowPrivateViewKey.current = shadowPrivateViewKey;
        }
      }
      if (needsPrivateView) {
        const response =
          !notesRequest && full?.phase === 'SHADOW' && shadowPrivateViewKey
            ? await revealAcknowledgedShadowWindow(shadowPrivateViewKey)
            : await reveal.mutateAsync({
                id,
                ...(notesRequest
                  ? { data: { purpose: 'notes' as const } }
                  : {}),
              });
        if (!response) return;
        privateVersionRef.current = response.version;
        nextPrivateView = isFullView(response.view)
          ? response.view.private
          : null;
        if (!nextPrivateView) throw new Error('Private view unavailable');
      }
      if (full?.phase === 'SHADOW' && shadowPrivateViewKey) {
        shieldedShadowCycle.current = full.cycle;
        requestedShadowPrivateViewKey.current = shadowPrivateViewKey;
      }
      setPrivateView(nextPrivateView);
      setPrivateCovered(false);
      setShielded(true);
    } catch (error) {
      command.reset();
      reveal.reset();
      setShielded(false);
      if (isDefinitiveCommandRejection(error))
        pendingCommands.reject('private-phase-acknowledgement', commandStepKey);
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
    if (phaseIsPrivate) {
      await acknowledge(true);
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
    focusTime.current = serverTimeNow(Date.now(), serverClockOffsetMs.current);
    setHeld(true);
    setHoldMessage('');
    setCommandMessage('');
    setPrivateView(null);
    privateResult.current = null;
    privateVersionRef.current = full?.version ?? 0;
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
          privateVersionRef.current = Math.max(
            privateVersionRef.current,
            response.version,
          );
          privateResult.current = privateData;
          if (
            serverTimeNow(Date.now(), serverClockOffsetMs.current) -
              focusTime.current >=
            500
          ) {
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

  useEffect(() => {
    if (
      !full ||
      full.phase !== 'SHADOW' ||
      !token ||
      notesOpen ||
      !shielded ||
      privateCovered ||
      !privateView ||
      full.version <= privateVersionRef.current
    )
      return;
    const shadowKey = shadowPrivateViewKey;
    if (
      !shadowKey ||
      acknowledgedShadowPrivateViewKey.current !== shadowKey ||
      openingShadowPrivateViewKey.current === shadowKey
    )
      return;
    let stale = false;
    void revealAcknowledgedShadowWindow(shadowKey)
      .then((response) => {
        if (!response) return;
        const view = response.view;
        const privateData = isFullView(view) ? view.private : null;
        if (
          stale ||
          !privateData ||
          currentShadowPrivateViewKeyRef.current !== shadowKey ||
          response.version < privateVersionRef.current
        )
          return;
        privateVersionRef.current = response.version;
        privateResult.current = privateData;
        setPrivateView(privateData);
      })
      .catch(() => undefined)
      .finally(() => reveal.reset());
    return () => {
      stale = true;
    };
  }, [
    currentShadowPrivateViewKeyRef,
    full?.phase,
    full?.version,
    privateCovered,
    privateView,
    shielded,
    shadowPrivateViewKey,
    id,
    notesOpen,
    reveal.mutateAsync,
    reveal.reset,
    revealAcknowledgedShadowWindow,
    token,
  ]);

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
    if (!view || !isFullView(view) || !token) return;
    const stepKey = gameCommandStepKey({
      gameId: id,
      viewerSeatId: view.viewerSeatId ?? null,
      phase: view.phase,
      cycle: view.cycle,
      revote: view.revote,
      shadowRound: view.shadowRound,
      shadowSlot: view.shadowSlot,
    });
    const pendingAction = pendingCommands.get('player-choice', stepKey);
    const pendingAcknowledgement = pendingCommands.get(
      'choice-acknowledgement',
      stepKey,
    );
    if (!selected && !pendingAction && !pendingAcknowledgement) return;
    setCommandMessage('');
    let actionAccepted = Boolean(pendingAcknowledgement && !pendingAction);
    try {
      if (pendingAcknowledgement && !pendingAction) {
        await pendingCommands.send(
          'choice-acknowledgement',
          stepKey,
          () => pendingAcknowledgement.payload,
          (payload) => command.mutateAsync({ id, data: payload }),
        );
      } else {
        await pendingCommands.send(
          'player-choice',
          stepKey,
          () =>
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
                    slot: view.shadowSlot,
                    idempotencyKey: idempotencyKey(),
                  }
                : {
                    type: 'SubmitEndgameVote',
                    choice: selected,
                    idempotencyKey: idempotencyKey(),
                  },
          (payload) => command.mutateAsync({ id, data: payload }),
        );
        pendingCommands.confirm('player-choice', stepKey);
        actionAccepted = true;
        command.reset();
        await pendingCommands.send(
          'choice-acknowledgement',
          stepKey,
          () => ({
            type: 'AcknowledgePrivate',
            idempotencyKey: idempotencyKey(),
          }),
          (payload) => command.mutateAsync({ id, data: payload }),
        );
      }
      pendingCommands.confirm('choice-acknowledgement', stepKey);
      command.reset();
      if (privateChoiceDraftKey) {
        try {
          clearPrivateChoiceDraft(window.sessionStorage, privateChoiceDraftKey);
        } catch {
          // The accepted choice remains in server state if storage is blocked.
        }
      }
      if (view.phase === 'SHADOW') {
        setActionDone(true);
        setCommandMessage('');
        setConfirmChoice(false);
      } else {
        clearPrivate();
        setActionDone(true);
        setSelected('');
        setConfirmChoice(false);
        setPrivateView(null);
      }
      await gameQuery.refetch();
    } catch (error) {
      command.reset();
      const latestView = (await gameQuery.refetch()).data?.view;
      if (latestView && isFullView(latestView)) {
        const latestStepKey = gameCommandStepKey({
          gameId: id,
          viewerSeatId: latestView.viewerSeatId ?? null,
          phase: latestView.phase,
          cycle: latestView.cycle,
          revote: latestView.revote,
          shadowRound: latestView.shadowRound,
          shadowSlot: latestView.shadowSlot,
        });
        if (latestStepKey !== stepKey) {
          pendingCommands.clearForStep(latestStepKey);
          clearPrivate();
          setSelected('');
          setConfirmChoice(false);
          setCommandMessage('');
          return;
        }
      }
      const explicitlyRejected = isDefinitiveCommandRejection(error);
      if (explicitlyRejected) {
        if (actionAccepted) {
          pendingCommands.reject('choice-acknowledgement', stepKey);
          setCommandMessage(en.game.acknowledgementNotRecorded);
        } else {
          pendingCommands.reject('player-choice', stepKey);
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
        return;
      }
      setCommandMessage(en.game.retryUncertainAction);
    }
  }

  async function markRoleReady() {
    if (!token || command.isPending) return;
    setCommandMessage('');
    try {
      await pendingCommands.send(
        'role-ready-acknowledgement',
        commandStepKey,
        () => ({
          type: 'AcknowledgePrivate',
          ready: true,
          idempotencyKey: idempotencyKey(),
        }),
        (payload) => command.mutateAsync({ id, data: payload }),
      );
      pendingCommands.confirm('role-ready-acknowledgement', commandStepKey);
      setRoleSeen(false);
      setActionDone(true);
      command.reset();
      void gameQuery.refetch();
    } catch (error) {
      command.reset();
      if (isDefinitiveCommandRejection(error))
        pendingCommands.reject('role-ready-acknowledgement', commandStepKey);
      setCommandMessage(en.game.readyFailed);
    }
  }

  async function revealVote() {
    if (!token || command.isPending) return;
    setCommandMessage('');
    try {
      await command.mutateAsync({
        id,
        data: { type: 'RevealVote', idempotencyKey: idempotencyKey() },
      });
      command.reset();
    } catch {
      command.reset();
      setCommandMessage(en.game.voteRevealFailed);
    }
  }

  async function moveOn() {
    if (
      !full?.canAdvancePhase ||
      advanceControl.disabled ||
      (full.actionStatus?.waiting ?? 0) > 0
    )
      return;
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
        setCommandMessage(
          latestView.actionStatus.waiting > 0 ? '' : en.game.moveOnFailed,
        );
        return;
      }
      const latestLocalNow = Date.now();
      const latestClockOffsetMs =
        latestResult.data?.serverNow === undefined
          ? advanceClockOffsetMs
          : serverClockOffset(latestResult.data.serverNow, latestLocalNow);
      if (
        getAdvanceControlState({
          minimumAdvanceAt: latestView.coordinatorMinimumAdvanceAt,
          localNow: latestLocalNow,
          serverClockOffsetMs: latestClockOffsetMs,
          paused: latestView.paused,
        }).waitSeconds > 0
      ) {
        setAdvanceLocalNow(latestLocalNow);
        return;
      }
      const previousShadowWindow =
        latestView.phase === 'SHADOW'
          ? {
              gameId: id,
              cycle: latestView.cycle,
              slot: latestView.shadowSlot,
              round: latestView.shadowRound,
            }
          : null;
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
      setConfirmChoice(false);
      const advancedResult = await gameQuery.refetch();
      const advancedView = advancedResult.data?.view;
      const preserveShadowSelection =
        previousShadowWindow &&
        advancedView &&
        isFullView(advancedView) &&
        shouldPreserveShadowChoice(previousShadowWindow, {
          gameId: id,
          cycle: advancedView.cycle,
          slot: advancedView.shadowSlot,
          round: advancedView.shadowRound,
        });
      if (!preserveShadowSelection) {
        setPrivateView(null);
        setSelected('');
      }
    } catch (error) {
      command.reset();
      const refreshed = await gameQuery.refetch();
      if (refreshed.data?.serverNow !== undefined) {
        serverClockOffsetMs.current = serverClockOffset(
          refreshed.data.serverNow,
          Date.now(),
        );
      }
      const refreshedView = refreshed.data?.view;
      setCommandMessage(
        refreshedView?.phase === full.phase
          ? isFullView(refreshedView) && refreshedView.actionStatus.waiting > 0
            ? ''
            : isAdvanceConflict(error)
              ? en.coordinator.advanceTooEarly
              : en.game.moveOnFailed
          : '',
      );
      setAdvanceLocalNow(Date.now());
    }
  }

  function requestMoveOn() {
    if (
      advanceControl.disabled ||
      !full?.canAdvancePhase ||
      (full.actionStatus?.waiting ?? 0) > 0
    )
      return;
    if (!full?.rehearsal && unfinishedCount > 0) {
      setAdvanceConfirmationOpen(true);
      return;
    }
    void moveOn();
  }

  function dismissRehearsalGuide() {
    if (showRehearsalStartGuide) {
      navigate(`${location.pathname}${location.search}${location.hash}`, {
        replace: true,
        state: null,
      });
      return;
    }
    if (explanationKey) {
      setRehearsalGuideDismissedSteps((dismissed) => {
        const next = new Set(dismissed);
        next.add(explanationStepKey);
        return next;
      });
    }
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

  function closeNotes() {
    clearPrivate();
    setNotesOpen(false);
    setNotesDraft('');
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

  const pendingChoiceAttempt = pendingCommands.get(
    'player-choice',
    commandStepKey,
  );
  const pendingChoiceAcknowledgement = pendingCommands.get(
    'choice-acknowledgement',
    commandStepKey,
  );
  const choiceRetryPending = Boolean(
    pendingChoiceAttempt || pendingChoiceAcknowledgement,
  );
  const choiceCommandSending =
    pendingCommands.isSending('player-choice', commandStepKey) ||
    pendingCommands.isSending('choice-acknowledgement', commandStepKey);
  const waitingForChoiceSend =
    !command.isPending &&
    (pendingCommands.isWaitingToSend('player-choice', commandStepKey) ||
      pendingCommands.isWaitingToSend(
        'choice-acknowledgement',
        commandStepKey,
      ));
  const choiceRetryAfterUntil =
    pendingCommands.getRetryAfterUntil('player-choice', commandStepKey) ??
    pendingCommands.getRetryAfterUntil(
      'choice-acknowledgement',
      commandStepKey,
    );
  const pendingPrivateAcknowledgement = pendingCommands.get(
    'private-phase-acknowledgement',
    commandStepKey,
  );
  const waitingForPrivateAcknowledgement = Boolean(
    pendingPrivateAcknowledgement &&
    !command.isPending &&
    pendingCommands.isWaitingToSend(
      'private-phase-acknowledgement',
      commandStepKey,
    ),
  );
  const privateAcknowledgementRetryAfterUntil =
    pendingCommands.getRetryAfterUntil(
      'private-phase-acknowledgement',
      commandStepKey,
    );
  const pendingRoleReadyAcknowledgement = pendingCommands.get(
    'role-ready-acknowledgement',
    commandStepKey,
  );
  const waitingForRoleReadyAcknowledgement = Boolean(
    pendingRoleReadyAcknowledgement &&
    !command.isPending &&
    pendingCommands.isWaitingToSend(
      'role-ready-acknowledgement',
      commandStepKey,
    ),
  );
  const roleReadyRetryAfterUntil = pendingCommands.getRetryAfterUntil(
    'role-ready-acknowledgement',
    commandStepKey,
  );
  const selectedForControls =
    selected || choiceIdFromCommand(pendingChoiceAttempt?.payload);
  const choiceControlProps = {
    choices,
    selected: selectedForControls,
    confirmChoice: confirmChoice || choiceRetryPending,
    choiceSelectionLocked:
      choiceRetryPending || command.isPending || choiceCommandSending,
    isPending: command.isPending || choiceCommandSending,
    waitingToSend: waitingForChoiceSend,
    retryAfterUntil: choiceRetryAfterUntil,
    onResend: () => void submitAction(),
    hasToken: Boolean(token),
    commandMessage,
    onSelect: (choiceId: string) => {
      if (
        command.isPending ||
        pendingCommands.get('player-choice', commandStepKey) ||
        pendingCommands.get('choice-acknowledgement', commandStepKey)
      )
        return;
      if (choiceId !== selectedForControls) setActionDone(false);
      setSelected(choiceId);
      setConfirmChoice(false);
      setCommandMessage('');
      if (privateChoiceDraftKey) {
        try {
          writePrivateChoiceDraft(
            window.sessionStorage,
            privateChoiceDraftKey,
            choiceId,
          );
        } catch {
          // In-memory selection remains available when browser storage is blocked.
        }
      }
    },
    onReview: () => setConfirmChoice(true),
    onConfirm: () => void submitAction(),
    onChooseAgain: () => {
      if (!choiceRetryPending) setConfirmChoice(false);
    },
  };

  const showOrganiserBar = Boolean(
    (full?.canAdvancePhase || full?.coordinatorPendingSeats !== undefined) &&
    !(full.voteCircle && full.voteCircle.speakerSeatId !== null) &&
    !isResuming &&
    activeGame &&
    !showShieldCard &&
    !held &&
    !privateInteractionInProgress &&
    !rehearsalGuideVisible,
  );

  return (
    <Shell
      isPlayer
      phase={!isResuming ? full?.phase : undefined}
      cycle={full?.cycle ?? 1}
      remaining={
        full?.seats.filter((seat) => seat.status === 'alive').length ?? 0
      }
      hideGameFooter={Boolean(
        full && !['LOBBY', 'FINISHED'].includes(full.phase),
      )}
      organiserControlsVisible={showOrganiserBar}
      organiserTools={
        full && activeGame && !full.rehearsal ? (
          <Link
            className="quiet-action"
            to={webPath(`/coordinate/${encodeURIComponent(full.id)}`)}
          >
            {en.entry.organiserControls}
          </Link>
        ) : null
      }
      onOpenNotes={
        full && !isResuming && !phaseIsPrivate && !notesOpen
          ? () => {
              setNotesStatus('');
              setNotesOpen(true);
            }
          : undefined
      }
      privateMode={!isResuming && inPrivateMoment}
      privateRevealActive={!isResuming && held}
      connectionStatus={
        isResuming
          ? 'reconnecting'
          : gameQuery.isLoading || hasPlayerSeat
            ? connectionStatus
            : null
      }
    >
      <PhaseClipOverlay
        enabled={Boolean(
          !isResuming && (activeGame || full?.phase === 'FINISHED'),
        )}
        gameId={id}
        phase={full?.phase}
        cycle={full?.cycle}
        winner={full?.winner}
        publicVerdict={full?.publicAnnouncement?.kind === 'verdict'}
        phaseStartedAt={
          full
            ? (full as FullView & { phaseStartedAt?: number }).phaseStartedAt
            : undefined
        }
        serverNow={response?.serverNow}
      />
      <section
        className={
          inPrivateMoment
            ? 'private-player-stage'
            : 'mx-auto w-full max-w-[480px]'
        }
      >
        {(isResuming || !full) && (
          <WhatIsHappeningCard>
            <p>
              {isResuming
                ? en.game.awayResyncing
                : visitor
                  ? phaseLabel(visitor.phase)
                  : en.game.loading}
            </p>
          </WhatIsHappeningCard>
        )}
        {isResuming && (
          <div
            aria-live="polite"
            className="border border-stone p-5"
            data-testid="away-resync-overlay"
            role={resumeStatus === 'failed' ? 'alert' : 'status'}
          >
            <h1 className="display text-2xl">{en.game.awayResyncHeading}</h1>
            <p className="mt-2 text-ash">
              {resumeStatus === 'failed'
                ? en.game.awayResyncFailed
                : en.game.awayResyncing}
            </p>
            {resumeStatus === 'failed' && (
              <button
                className="quiet-action mt-4"
                type="button"
                onClick={() => {
                  window.dispatchEvent(new Event('online'));
                }}
              >
                {en.game.tryAgain}
              </button>
            )}
          </div>
        )}
        {!isResuming && gameQuery.isLoading && (
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
        {!isResuming && gameQuery.isError && (
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
        {!isResuming && visitor && (
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
        {!isResuming && full && (
          <div
            className={
              showOrganiserBar ? (watchingRehearsal ? 'pb-40' : 'pb-24') : ''
            }
            data-testid="player-game"
            data-phase={full.phase}
            data-version={full.version}
            data-shadow-round={full.shadowRound}
            data-shadow-slot={full.shadowSlot}
            data-progress-done={full.progress.done}
            data-progress-total={full.progress.total}
          >
            {!notesOpen && (
              <h1 className="display mt-2 mb-1 text-[30px] leading-[1.15]">
                {phaseLabel(full.phase)}
              </h1>
            )}
            <WhatIsHappeningCard accent={Boolean(full.revote)}>
              <GameStepAnnouncement
                aliveCount={
                  full.seats.filter((seat) => seat.status === 'alive').length
                }
                endRule={full.endRule}
                murderSlots={full.murderSlots}
                phase={full.phase}
                shadowRound={full.shadowRound}
                revote={full.revote}
                progress={full.progress}
                context={{
                  phase: full.phase,
                  cycle: full.cycle,
                  aliveCount: full.seats.filter(
                    (seat) => seat.status === 'alive',
                  ).length,
                  publicLog: full.publicLog,
                  seats: full.seats,
                  winner: full.winner,
                }}
                coachingTip={
                  full.rehearsal && explanationKey && full.phase !== 'DEAL'
                    ? en.game.coachingTips[explanationKey]
                    : undefined
                }
                fallback={phaseLabel(full.phase)}
              />
            </WhatIsHappeningCard>
            {watchingRehearsal && (
              <RehearsalWatchCommentary phase={full.phase} />
            )}
            {ownSeat && ownSeat.status !== 'alive' && (
              <p
                className="mb-4 text-sm text-ash"
                data-testid="player-fate"
                role="status"
              >
                {ownTakenThisDawn
                  ? en.game.personalTakenFate
                  : en.game.personalOutFate}
              </p>
            )}
            {((!isBanishmentPhase &&
              ['DEAL', 'FINAL_VOTE'].includes(full.phase)) ||
              full.paused) && (
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                {!isBanishmentPhase && (
                  <PhaseProgressStatus
                    phase={full.phase}
                    paused={full.paused}
                    done={full.progress.done}
                    total={full.progress.total}
                    coachingTip={
                      full.rehearsal && full.phase === 'DEAL'
                        ? en.game.coachingTips.role
                        : undefined
                    }
                  />
                )}
              </div>
            )}
            {(explanationKey ||
              conversationPrompts.length > 0 ||
              wakeLockFallback) && (
              <GameHelpDisclosure
                screenLockNotice={
                  wakeLockFallback ? en.game.wakeLockFallback : undefined
                }
              >
                {explanationKey && (
                  <p>{en.game.rehearsalGuide[explanationKey]}</p>
                )}
                {conversationPrompts.length > 0 && (
                  <ConversationPromptsCard
                    title={en.game.conversationPromptsTitle}
                    prompts={conversationPrompts}
                  />
                )}
              </GameHelpDisclosure>
            )}
            {!inPrivateMoment && (
              <VerdictScreen
                coachingTip={
                  full.rehearsal ? en.game.coachingTips.verdict : undefined
                }
                aliveCount={
                  full.seats.filter((seat) => seat.status === 'alive').length
                }
                announcement={
                  full.phase === 'VERDICT' &&
                  full.publicAnnouncement?.kind === 'no_votes'
                    ? full.publicAnnouncement
                    : full.phase !== 'VERDICT' &&
                        full.publicAnnouncement?.kind === 'verdict' &&
                        full.publicAnnouncement.cycle === full.cycle
                      ? full.publicAnnouncement
                      : null
                }
                animateReveal={
                  full.phase !== 'VERDICT' &&
                  full.publicAnnouncement?.kind === 'verdict' &&
                  full.publicAnnouncement.cycle === full.cycle
                }
              />
            )}
            {whileAwayUpdates !== null && (
              <WhileAwayCard
                title={en.game.awayCardHeading}
                noUpdates={en.game.awayCardNoUpdates}
                updates={whileAwayUpdates}
                returnLabel={en.game.awayCardReturn}
                onDismiss={() => setWhileAwayUpdates(null)}
              />
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
              <div className="flex flex-wrap items-end justify-end gap-4">
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
            {!inPrivateMoment && isBanishmentPhase && (
              <section>
                <VoteProgressSummary rows={voteProgressRows} />
                {completedVoteMessage && (
                  <p
                    role="status"
                    className="mt-4 text-sm text-ash"
                    data-testid="vote-completion-message"
                  >
                    <span data-testid="waiting-for-everyone">
                      {completedVoteMessage}
                    </span>
                  </p>
                )}
              </section>
            )}
            {!inPrivateMoment && full.voteCircle && (
              <VotingCircleScreen
                speakerSeatId={full.voteCircle.speakerSeatId}
                viewerSeatId={full.viewerSeatId ?? null}
                ownVoteTargetName={
                  full.ownVoteTargetId
                    ? (full.seats.find(
                        (seat) => seat.id === full.ownVoteTargetId,
                      )?.name ?? null)
                    : null
                }
                ballots={full.ballots}
                seats={full.seats}
                onReveal={() => void revealVote()}
                isPending={command.isPending}
              />
            )}

            {!inPrivateMoment &&
              full.publicAnnouncement &&
              ((full.publicAnnouncement.kind === 'dawn' &&
                full.phase === 'DAWN') ||
                (full.publicAnnouncement.kind === 'finished' &&
                  full.phase === 'FINISHED')) && (
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
            {full.phase === 'FINISHED' &&
              full.fairness &&
              full.fairness.murderSlots.length > 0 && (
                <section
                  className="mt-6"
                  aria-label="Night choices"
                  data-testid="fairness-murder-slots"
                >
                  <h2 className="title text-xl text-candle">Night choices</h2>
                  <ol className="mt-3 grid gap-3">
                    {full.fairness.murderSlots.map((slot) => (
                      <li
                        key={`${slot.cycle}:${slot.slot}`}
                        className="rounded-xl border border-stone p-4"
                        data-testid="murder-slot-record"
                      >
                        <h3 className="text-candle">
                          {en.game.murderSlotTitle(slot.cycle, slot.slot)}
                        </h3>
                        <ul className="mt-2 grid gap-1 text-sm text-ash">
                          {slot.picks.map((pick, index) => (
                            <li key={`${pick.seatId}:${pick.round}:${index}`}>
                              {en.game.murderSlotPick(
                                pick.seatName,
                                pick.choiceName,
                                pick.round,
                              )}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 text-sm text-ash">
                          {en.game.murderSlotOutcome(
                            slot.outcome,
                            slot.chosen?.name ?? null,
                          )}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

            {!inPrivateMoment &&
              Object.keys(full.ballots).length > 0 &&
              (full.phase === 'VERDICT' ||
                full.phase === 'DAWN' ||
                full.phase === 'FINISHED') && (
                <VerdictScreen
                  coachingTip={
                    full.rehearsal ? en.game.coachingTips.verdict : undefined
                  }
                  aliveCount={
                    full.seats.filter((seat) => seat.status === 'alive').length
                  }
                  announcement={
                    full.phase === 'VERDICT' &&
                    full.publicAnnouncement?.kind === 'verdict'
                      ? full.publicAnnouncement
                      : null
                  }
                  ballots={full.ballots}
                  seats={full.seats}
                  showVoteReveal
                  animateReveal={full.phase === 'VERDICT'}
                />
              )}

            {inPrivateMoment && (
              <div className="private-moment-panel">
                {waitingForPrivateAcknowledgement && !showShieldCard && (
                  <PendingCommandNotice
                    disabled={command.isPending || shieldPending}
                    retryAfterUntil={privateAcknowledgementRetryAfterUntil}
                    onResend={() => void acknowledge()}
                  />
                )}
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
                    {holdMessage && !waitingForPrivateAcknowledgement && (
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
                      <h1 className="display text-2xl text-candle">
                        {en.game.guideTitles.role}
                      </h1>
                      {held && privateView && (
                        <div className="private-role-card">
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
                      onPointerUp={() =>
                        clearPrivate({ preserveSyntheticClick: true })
                      }
                      onPointerCancel={cancelPrivate}
                      onPointerLeave={cancelPrivate}
                      onKeyDown={padKeyDown}
                      onKeyUp={(event) => {
                        if (event.key === ' ' || event.key === 'Enter')
                          clearPrivate({ preserveSyntheticClick: true });
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
                    {roleSeen &&
                      !held &&
                      (waitingForRoleReadyAcknowledgement ? (
                        <PendingCommandNotice
                          disabled={command.isPending}
                          retryAfterUntil={roleReadyRetryAfterUntil}
                          onResend={() => void markRoleReady()}
                        />
                      ) : (
                        <button
                          className="primary-action w-full"
                          type="button"
                          disabled={command.isPending}
                          onClick={() => void markRoleReady()}
                        >
                          {en.game.notesDone}
                        </button>
                      ))}
                    {full.phase === 'DEAL' &&
                      commandMessage &&
                      !waitingForRoleReadyAcknowledgement && (
                        <p role="alert" className="text-ash">
                          {commandMessage}
                        </p>
                      )}
                  </>
                ) : (
                  <>
                    <div
                      className={`private-action-content${longBanishmentRoster ? ' private-action-content--long-vote-progress' : ''}`}
                      aria-live="polite"
                      data-testid="private-choice-content"
                    >
                      {showPrivateWaitingMessage ? (
                        <p
                          role="status"
                          className="text-center text-ash"
                          data-testid="waiting-for-everyone"
                        >
                          {completedVoteMessage ?? en.game.waitingForEveryone}
                        </p>
                      ) : notesOpen && !phaseIsPrivate ? (
                        shielded && privateView ? (
                          <section
                            className="game-notes-sheet"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Notes"
                            data-testid="game-notes-sheet"
                          >
                            <div className="game-notes-sheet__header">
                              <h2 className="display text-2xl">Notes</h2>
                              <button
                                className="quiet-action"
                                type="button"
                                onClick={closeNotes}
                              >
                                {en.game.notesDone}
                              </button>
                            </div>
                            <NotesScreen
                              privateView={privateView}
                              seats={full.seats}
                              notesDraft={notesDraft}
                              notesStatus={notesStatus}
                              saving={command.isPending}
                              onDraftChange={setNotesDraft}
                              onSave={() => void saveNotes()}
                            />
                          </section>
                        ) : (
                          <p role="status" className="text-sm text-ash">
                            {holdMessage || en.game.privateLoading}
                          </p>
                        )
                      ) : shielded &&
                        !privateCovered &&
                        isActionPhase &&
                        (full.phase !== 'SHADOW' || privateView) ? (
                        full.phase === 'SHADOW' ? (
                          <>
                            <NightChoiceScreen
                              {...choiceControlProps}
                              actionDone={actionDone}
                              taskInstruction={privateView?.task?.instruction}
                              slotLabel={
                                full.shadowSlot === 1
                                  ? en.game.firstChoice
                                  : en.game.secondChoice
                              }
                              prompt={
                                privateView?.role === 'traitor'
                                  ? en.game.shadowTraitorPrompt
                                  : en.game.shadowFaithfulPrompt
                              }
                              statusLines={shadowStatusLines}
                            />
                            {actionDone && (
                              <p
                                role="status"
                                className="mt-3 text-center text-sm text-ash"
                                data-testid="waiting-for-everyone"
                              >
                                {en.game.waitingForEveryone}
                              </p>
                            )}
                          </>
                        ) : (
                          <div className="enter">
                            {full.phase === 'VOTE' ||
                            full.phase === 'FINAL_BANISH' ? (
                              <BanishmentVoteScreen
                                {...choiceControlProps}
                                revote={full.revote}
                                tieCandidateIds={full.voteCandidates}
                                tieCandidateNames={tieCandidateNames}
                                voteProgressRows={voteProgressRows}
                                viewerSeatId={full.viewerSeatId}
                              />
                            ) : (
                              <>
                                <p className="display text-2xl">
                                  {en.game.finalDecision}
                                </p>
                                <PrivateChoiceControls
                                  {...choiceControlProps}
                                />
                              </>
                            )}
                          </div>
                        )
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
                          onPointerUp={() =>
                            clearPrivate({ preserveSyntheticClick: true })
                          }
                          onPointerCancel={cancelPrivate}
                          onPointerLeave={cancelPrivate}
                          onKeyDown={padKeyDown}
                          onKeyUp={(event) => {
                            if (event.key === ' ' || event.key === 'Enter')
                              clearPrivate({ preserveSyntheticClick: true });
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
                  </>
                )}
              </div>
            )}

            {!inPrivateMoment && (
              <div
                className={
                  full.phase === 'DEBATE'
                    ? 'border-t border-stone pt-0'
                    : 'mt-12 border-t border-stone pt-6'
                }
              >
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

                <section
                  id="game-players"
                  className={full.phase === 'DEBATE' ? 'mt-0' : 'mt-7'}
                  aria-labelledby="players-heading"
                >
                  <h2 id="players-heading" className="display text-2xl">
                    {en.game.playersHeading}
                  </h2>
                  <ul className="game-roster-grid mt-2">
                    {full.seats.map((seat) => {
                      const isAlive = seat.status === 'alive';
                      return (
                        <li
                          key={seat.id}
                          data-testid={`player-seat-${seat.id}`}
                        >
                          <PlayerTile
                            name={seat.name}
                            state={isAlive ? 'available' : 'out'}
                            statusText={
                              full.phase === 'FINISHED' && seat.role
                                ? isAlive
                                  ? seat.role === 'traitor'
                                    ? en.game.roleTraitor
                                    : en.game.roleFaithful
                                  : en.game.playerOutRole(seat.role)
                                : isAlive
                                  ? en.game.playerPlaying
                                  : undefined
                            }
                            testId={`player-tile-${seat.id}`}
                          />
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
                          {publicLogMessage(entry)}
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
        {full && showOrganiserBar && (
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
              {watchingRehearsal && (
                <RehearsalWatchAction
                  onClick={() => navigate(config.routes.rehearsal)}
                />
              )}
              <button
                className="primary-action w-full"
                type="button"
                aria-live="polite"
                disabled={
                  advanceControl.disabled ||
                  !full.canAdvancePhase ||
                  full.actionStatus.waiting > 0
                }
                onClick={requestMoveOn}
              >
                {full.actionStatus.waiting > 0
                  ? en.coordinator.waitingForPlayers(full.actionStatus.waiting)
                  : waitingForAdvanceMinimum
                    ? en.coordinator.minimumMoveOnWait(
                        advanceControl.waitSeconds,
                      )
                    : full.rehearsal
                      ? en.game.nextRehearsalStep
                      : en.game.organiserMoveOn}
              </button>
            </div>
          </section>
        )}
        {!isResuming && advanceConfirmationOpen && full && !full.rehearsal && (
          <div
            className="game-fullscreen-overlay fixed inset-0 z-50 flex flex-col bg-charcoal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="organiser-confirm-title"
          >
            <OathstonePlayerHeader />
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
          </div>
        )}
        {!isResuming && full?.rehearsal && rehearsalGuideVisible && (
          <div
            className="game-fullscreen-overlay fixed inset-0 z-40 flex flex-col bg-charcoal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rehearsal-guide-title"
            data-testid="rehearsal-explainer"
            data-guide-key={renderedRehearsalGuideKey}
            data-guide-started={String(!showRehearsalStartGuide)}
            data-start-entry={String(showRehearsalStartGuide)}
          >
            <OathstonePlayerHeader />
            <div className="mx-auto my-auto w-full max-w-[480px]">
              <h2
                className="display text-3xl text-candle"
                id="rehearsal-guide-title"
              >
                {en.game.guideTitles[renderedRehearsalGuideKey]}
              </h2>
              <p
                className="mt-5 text-lg leading-relaxed text-ash"
                data-testid="rehearsal-explanation-copy"
              >
                {en.game.rehearsalGuideCards[renderedRehearsalGuideKey]}
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
          </div>
        )}
        {!isResuming && showShieldCard && (
          <ShieldCard
            ref={shieldDialog}
            countdown={shieldCountdown}
            pending={shieldPending}
            waitingToSend={waitingForPrivateAcknowledgement}
            retryAfterUntil={privateAcknowledgementRetryAfterUntil}
            message={waitingForPrivateAcknowledgement ? undefined : holdMessage}
            hasToken={Boolean(token)}
            showNotesDone={notesOpen && !phaseIsPrivate}
            onAcknowledge={() => void acknowledge()}
            onNotesDone={closeNotes}
            header={<OathstonePlayerHeader />}
          />
        )}
        {hasPlayerSeat && full && (
          <CoordinatorTakeoverPanel
            gameId={id}
            csrfToken={token}
            hidden={
              isResuming ||
              !activeGame ||
              inPrivateMoment ||
              held ||
              showShieldCard ||
              rehearsalGuideVisible
            }
            onTransferred={() =>
              navigate(
                webPath(
                  `${config.routes.coordinate}/${encodeURIComponent(id)}`,
                ),
              )
            }
          />
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
            <Route
              path={`${config.routes.join}/:gameId`}
              element={<Play mode="join" />}
            />
            <Route
              path={`${config.routes.joinRequest}/:requestId`}
              element={<Play mode="waiting" />}
            />
            <Route
              path={`${config.routes.coordinate}/:id`}
              element={<Play mode="coordinate" />}
            />
            <Route
              path={`${config.routes.game}/:id`}
              element={<PlayerGame />}
            />
            <Route
              path={`${config.routes.tv}/:id`}
              element={<PresenterRoute />}
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </CsrfProvider>
      </InstallPromptProvider>
    </QueryClientProvider>
  );
}

function PresenterRoute() {
  const csrfToken = useContext(csrfContext);
  return (
    <Suspense fallback={<main role="status">{en.presenter.loading}</main>}>
      <LazyPresenterPage csrfToken={csrfToken} />
    </Suspense>
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
