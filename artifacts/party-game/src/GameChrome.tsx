import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { config } from '@/config';
import {
  formatUkDate,
  gameDeletionDate,
} from '@workspace/shared/game-end-date';
import { en } from '@/locale/en-GB';
import type { GameConnectionState } from './game-socket';
import { GameConnectionStatus } from './GameConnectionStatus';

export type GameConnectionDisplayState =
  GameConnectionState | 'offline' | 'connected';

export type GameViewTab = 'game' | 'players';

export function gameStatusLabel(phase: string, cycle: number): string {
  if (phase === 'JOIN') return 'Join a game';
  if (phase === 'LOBBY') return 'Lobby';
  if (phase === 'LOADING') return en.game.tabGame;
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

/** Beta release marker shown beside the wordmark and in the game bar. */
export function BetaTag() {
  return (
    <span className="beta-tag" data-testid="beta-tag">
      {en.app.beta}
    </span>
  );
}

export function GameStatusBar({
  phase,
  cycle,
  remaining,
  showRemaining = true,
  showConnection = true,
  connectionStatus,
  joinedLabel,
  onOpenNotes,
  menuContent,
  showBeta = true,
}: {
  phase: string;
  cycle: number;
  remaining: number;
  showRemaining?: boolean;
  /** Off before a player has joined: there is no live game to report. */
  showConnection?: boolean;
  connectionStatus: GameConnectionDisplayState;
  joinedLabel?: string;
  onOpenNotes?: () => void;
  menuContent?: ReactNode;
  /** Off where the screen header already shows the beta tag. */
  showBeta?: boolean;
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
      {showBeta && <BetaTag />}
      <div className="game-status-right">
        {showRemaining && (
          <span
            className="game-status-chip"
            data-testid="game-status-remaining"
          >
            {joinedLabel ?? `${remaining} left`}
          </span>
        )}
        {showConnection && (
          <GameConnectionStatus
            status={
              connectionStatus === 'connected' ? 'online' : connectionStatus
            }
          />
        )}
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
          <details className="game-status-menu" data-testid="game-status-menu">
            <summary>{en.nav.menu}</summary>
            <div className="game-status-menu__content">
              {/* One row so the Menu keeps its height on 320px phones. */}
              <p className="game-menu-feedback">
                {showBeta && (
                  <span className="game-menu-beta" data-testid="menu-beta-note">
                    <BetaTag />
                  </span>
                )}
                <a
                  className="game-menu-report"
                  href={config.feedbackMailto}
                  data-testid="menu-report-issue"
                >
                  {en.app.reportIssue}
                </a>
              </p>
              {menuContent}
            </div>
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

const missionsNoticeHiddenKey = 'oathstone.missionsNoticeHidden';

function readMissionsNoticeHidden(): boolean {
  try {
    return window.localStorage.getItem(missionsNoticeHiddenKey) === '1';
  } catch {
    return false;
  }
}

/** Per-device notice while missions are switched off; holds no game data. */
export function MissionsComingNotice() {
  const [hidden, setHidden] = useState(readMissionsNoticeHidden);
  if (hidden) return null;
  return (
    <section
      className="game-happening-card"
      data-testid="missions-coming-notice"
      aria-labelledby="missions-coming-title"
    >
      <p id="missions-coming-title" className="game-screen-label">
        {en.game.missionsComing.title}
      </p>
      <p className="game-happening-copy">{en.game.missionsComing.body}</p>
      <button
        className="quiet-action"
        type="button"
        onClick={() => {
          try {
            window.localStorage.setItem(missionsNoticeHiddenKey, '1');
          } catch {
            // Storage can be unavailable; hiding still applies to this view.
          }
          setHidden(true);
        }}
      >
        {en.game.missionsComing.hide}
      </button>
    </section>
  );
}

/** Public line naming the round-table shield holder (D109). */
export function ShieldHolderLine({ names }: { names: string[] }) {
  if (!names.length) return null;
  return (
    <p className="game-shield-holder" data-testid="shield-holder">
      {en.game.shield.holder(names)}
    </p>
  );
}

/** Organiser records the shield holder the round table agreed (D109). */
export function RoundTableShield({
  seats,
  pending,
  message,
  onGive,
}: {
  seats: { id: string; name: string }[];
  pending: boolean;
  message: string;
  onGive: (seatId: string) => void;
}) {
  const [selected, setSelected] = useState('');
  const chosen = seats.find((seat) => seat.id === selected);
  return (
    <section
      className="game-happening-card"
      data-testid="round-table-shield"
      aria-labelledby="round-table-shield-title"
    >
      <p id="round-table-shield-title" className="game-screen-label">
        {en.game.shield.title}
      </p>
      <p className="game-happening-copy">{en.game.shield.prompt}</p>
      <fieldset className="game-shield-options">
        <legend className="sr-only">{en.game.shield.choose}</legend>
        {seats.map((seat) => (
          <label key={seat.id} className="game-shield-option">
            <input
              type="radio"
              name="round-table-shield"
              value={seat.id}
              checked={selected === seat.id}
              onChange={() => setSelected(seat.id)}
            />
            <span>{seat.name}</span>
          </label>
        ))}
      </fieldset>
      {chosen && (
        <button
          className="primary-action w-full"
          type="button"
          disabled={pending}
          onClick={() => onGive(chosen.id)}
        >
          {en.game.shield.give(chosen.name)}
        </button>
      )}
      {message && (
        <p role="status" className="game-happening-copy">
          {message}
        </p>
      )}
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
  const [, setIsOpen] = useState(false);

  return (
    <details
      className="game-help-disclosure"
      data-testid="game-help-disclosure"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary>What&apos;s this?</summary>
      <div className="game-help-disclosure__content">
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

export function GameBottomBar({
  active,
  onSelect,
}: {
  active: GameViewTab;
  onSelect: (tab: GameViewTab) => void;
}) {
  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    current: GameViewTab,
  ) => {
    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }
    event.preventDefault();
    const next: GameViewTab =
      event.key === 'Home'
        ? 'game'
        : event.key === 'End'
          ? 'players'
          : current === 'game'
            ? 'players'
            : 'game';
    onSelect(next);
    document.getElementById(`game-view-tab-${next}`)?.focus();
  };

  return (
    <nav
      className="game-bottom-bar"
      data-testid="game-bottom-bar"
      role="tablist"
      aria-label="Game views"
    >
      <button
        id="game-view-tab-game"
        type="button"
        role="tab"
        aria-controls="game-tab-panel"
        aria-selected={active === 'game'}
        tabIndex={active === 'game' ? 0 : -1}
        className={active === 'game' ? 'game-bottom-bar__active' : undefined}
        onClick={() => onSelect('game')}
        onKeyDown={(event) => handleKeyDown(event, 'game')}
      >
        {en.game.tabGame}
      </button>
      <button
        id="game-view-tab-players"
        type="button"
        role="tab"
        aria-controls="players-tab-panel"
        aria-selected={active === 'players'}
        tabIndex={active === 'players' ? 0 : -1}
        className={active === 'players' ? 'game-bottom-bar__active' : undefined}
        onClick={() => onSelect('players')}
        onKeyDown={(event) => handleKeyDown(event, 'players')}
      >
        {en.game.tabPlayers}
      </button>
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

/** Tells everyone when a real game is deleted (D117); practice games have none. */
export function GameEndDateNotice({ endDate }: { endDate: string }) {
  return (
    <p className="game-end-date-notice" data-testid="end-date-notice">
      {en.app.endDateNotice(formatUkDate(gameDeletionDate(endDate)))}
    </p>
  );
}

/** An old link to a game removed by the clear-down (D117): not an error. */
export function GameClearedNotice() {
  return (
    <section className="game-cleared" aria-live="polite">
      <p className="display text-2xl" data-testid="game-cleared">
        {en.app.gameCleared}
      </p>
      <a className="quiet-action mt-6" href={config.routes.home}>
        {en.notFound.back}
      </a>
    </section>
  );
}
