import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { en } from '@/locale/en-GB';
import type { GameConnectionState } from './game-socket';
import { GameConnectionStatus } from './GameConnectionStatus';

export type GameConnectionDisplayState =
  | GameConnectionState
  | 'offline'
  | 'connected';

export function gameStatusLabel(phase: string, cycle: number): string {
  if (phase === 'JOIN') return 'Join a game';
  if (phase === 'LOBBY') return 'Lobby';
  const period = phase === 'SHADOW' ? 'Night' : 'Day';
  const compactPhaseNames: Record<string, string> = {
    DEAL: 'Deal',
    MISSION: 'Mission',
    DEBATE: 'Talk',
    VOTE: 'Vote',
    VERDICT: 'Verdict',
    SHADOW: 'Shadow',
    DAWN: 'Dawn',
    ENDGAME: 'Endgame',
    FINAL_VOTE: 'Final vote',
    FINAL_BANISH: 'Final verdict',
    FINISHED: 'Results',
  };
  const phaseName =
    compactPhaseNames[phase] ??
    (en.game.phases as Record<string, string>)[phase] ??
    en.game.defaultPhase;
  return `${period} ${cycle} · ${phaseName}`;
}

export function GameStatusBar({
  phase,
  cycle,
  remaining,
  connectionStatus,
  joinedLabel,
  onOpenNotes,
  menuContent,
}: {
  phase: string;
  cycle: number;
  remaining: number;
  connectionStatus: GameConnectionDisplayState;
  joinedLabel?: string;
  onOpenNotes?: () => void;
  menuContent?: ReactNode;
}) {
  return (
    <div
      className="game-status-bar"
      data-testid="game-status-bar"
      aria-label="Game status"
    >
      <span className="game-status-chip" data-testid="game-status-phase">
        <span className="game-status-phase-label">
          {gameStatusLabel(phase, cycle)}
        </span>
      </span>
      <div className="game-status-right">
        <span className="game-status-chip" data-testid="game-status-remaining">
          {joinedLabel ?? `${remaining} left`}
        </span>
        <GameConnectionStatus
          status={connectionStatus === 'connected' ? 'online' : connectionStatus}
        />
        {onOpenNotes && (
          <button
            className="quiet-action game-status-notes"
            type="button"
            data-testid="button-open-notes"
            onClick={onOpenNotes}
          >
            {en.game.notesButton}
          </button>
        )}
        {menuContent && (
          <details
            className="game-status-menu"
            data-testid="game-status-menu"
          >
            <summary>{en.nav.menu}</summary>
            <div className="game-status-menu__content">{menuContent}</div>
          </details>
        )}
      </div>
    </div>
  );
}

export function WhatIsHappeningCard({
  children,
  accent = false,
}: {
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <section
      className={`game-happening-card${accent ? ' game-happening-card--accent' : ''}`}
      data-testid="game-happening-card"
      aria-label="What is happening"
    >
      <p className="game-screen-label">{en.game.whatIsHappening}</p>
      <div className="game-happening-copy">{children}</div>
    </section>
  );
}

export function GameHelpDisclosure({
  children,
  screenLockNotice,
}: {
  children: ReactNode;
  screenLockNotice?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const details = detailsRef.current;
    const content = contentRef.current;
    if (!details || !content) return;
    if (!isOpen) {
      content.style.removeProperty('max-height');
      return;
    }

    let attemptedInitialScroll = false;
    const measureAvailableSpace = () => {
      const currentDetails = detailsRef.current;
      const currentContent = contentRef.current;
      if (!currentDetails?.open || !currentContent) return;

      const bottomEdges = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.game-action-bar, [data-testid="game-action-dock"], [data-testid="game-bottom-bar"], .game-brand-footer',
        ),
      )
        .filter((element) => {
          const style = window.getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            box.height > 0
          );
        })
        .map((element) => element.getBoundingClientRect().top);
      const dockTop =
        bottomEdges.length > 0
          ? Math.min(...bottomEdges)
          : window.innerHeight;
      const contentTop = currentContent.getBoundingClientRect().top;
      const available = Math.max(0, dockTop - contentTop - 8);
      currentContent.style.maxHeight = `${available}px`;

      if (available >= 96 || attemptedInitialScroll) return;
      attemptedInitialScroll = true;
      const maxScroll = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      const scrollAmount = Math.min(
        96 - available,
        Math.max(0, maxScroll - window.scrollY),
      );
      if (scrollAmount > 0) {
        window.scrollBy(0, scrollAmount);
        window.requestAnimationFrame(measureAvailableSpace);
      }
    };

    measureAvailableSpace();
    window.addEventListener('resize', measureAvailableSpace);
    window.addEventListener('scroll', measureAvailableSpace, {
      passive: true,
    });
    const observer = new ResizeObserver(measureAvailableSpace);
    for (const element of document.querySelectorAll<HTMLElement>(
      '.game-action-bar, [data-testid="game-action-dock"], [data-testid="game-bottom-bar"], .game-brand-footer',
    )) {
      observer.observe(element);
    }

    return () => {
      content.style.removeProperty('max-height');
      window.removeEventListener('resize', measureAvailableSpace);
      window.removeEventListener('scroll', measureAvailableSpace);
      observer.disconnect();
    };
  }, [isOpen]);

  return (
    <details
      ref={detailsRef}
      className="game-help-disclosure"
      data-testid="game-help-disclosure"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary>What&apos;s this?</summary>
      <div ref={contentRef} className="game-help-disclosure__content">
        {children}
        {screenLockNotice && (
          <p data-testid="wake-lock-notice" role="status">
            {screenLockNotice}
          </p>
        )}
      </div>
    </details>
  );
}

export function GameBottomBar({ active }: { active: 'game' | 'players' }) {
  const [current, setCurrent] = useState(active);
  useEffect(() => {
    const update = () =>
      setCurrent(window.location.hash === '#game-players' ? 'players' : 'game');
    update();
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  return (
    <nav
      className="game-bottom-bar"
      data-testid="game-bottom-bar"
      aria-label="Game navigation"
    >
      <a
        href="#main"
        aria-current={current === 'game' ? 'page' : undefined}
        className={current === 'game' ? 'game-bottom-bar__active' : undefined}
        onClick={() => setCurrent('game')}
      >
        {en.game.tabGame}
      </a>
      <a
        href="#game-players"
        aria-current={current === 'players' ? 'page' : undefined}
        className={
          current === 'players' ? 'game-bottom-bar__active' : undefined
        }
        onClick={() => setCurrent('players')}
      >
        {en.game.tabPlayers}
      </a>
    </nav>
  );
}

export function PlayerTile({
  name,
  state = 'available',
  statusText,
  onSelect,
  disabled = false,
  testId,
  dataChoiceId,
  ariaLabel,
  ariaDescribedBy,
  statusId,
  statusTestId,
}: {
  name: string;
  state?: 'available' | 'selected' | 'disabled' | 'out';
  statusText?: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  testId?: string;
  dataChoiceId?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  statusId?: string;
  statusTestId?: string;
}) {
  const stateLabel =
    state === 'selected'
      ? en.game.tileSelected
      : state === 'out'
        ? en.game.tileOut
        : null;
  const contents = (
    <>
      <span className="player-tile__name">{name}</span>
      <span className="player-tile__end">
        {(onSelect || state === 'selected') && state !== 'out' && (
          <span className="player-tile__radio" aria-hidden="true" />
        )}
        {statusText && (
          <span
            className="player-tile__status"
            id={statusId}
            data-testid={statusTestId}
          >
            {statusText}
          </span>
        )}
        {stateLabel && (
          <span className="player-tile__status">{stateLabel}</span>
        )}
      </span>
    </>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        className={`player-tile player-tile--${state} choice-action${disabled ? ' choice-action--unavailable' : ''}`}
        data-testid={testId}
        data-choice-id={dataChoiceId}
        aria-pressed={state === 'selected'}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        disabled={disabled || state === 'out'}
        onClick={onSelect}
      >
        {contents}
      </button>
    );
  }

  return (
    <div
      className={`player-tile player-tile--${state}`}
      data-testid={testId}
      data-choice-id={dataChoiceId}
      data-state={state}
    >
      {contents}
    </div>
  );
}
