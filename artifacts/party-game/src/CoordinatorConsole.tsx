import { useEffect, useState } from 'react';
import type { FullView } from '@workspace/api-client-react';
import { en } from './locale/en-GB';
import { secondsUntilServerDeadline, serverClockOffset } from './server-clock';

export type CoordinatorCommand =
  | { type: 'AdvancePhase' }
  | { type: 'Pause' }
  | { type: 'Resume' }
  | { type: 'ExtendPhase'; minutes: 1 | 5 | 15 }
  | { type: 'EndGameEarly' };

export interface CoordinatorConsoleView {
  phase: FullView['phase'];
  revote: boolean;
  paused: boolean;
  deadline: number | null;
  serverNow: number;
  progress: FullView['progress'];
}

export function getCoordinatorMoveConfirmation(progress: {
  done: number;
  total: number;
}): string | null {
  const unfinished = Math.max(0, progress.total - progress.done);
  if (unfinished === 0) return null;
  return en.coordinator.moveConfirmation(unfinished);
}

export function getCoordinatorEndConfirmation(): string {
  return en.coordinator.endConfirmation;
}

export function formatCoordinatorPhase(
  phase: FullView['phase'],
  revote: boolean,
): string {
  const labels: Record<FullView['phase'], string> = {
    DRAFT: 'Setup',
    LOBBY: 'Lobby',
    DEAL: 'Role reveal',
    MISSION: 'Mission',
    DEBATE: 'The conversation',
    VOTE: revote ? 'The re-vote' : 'The vote',
    VERDICT: 'The verdict',
    SHADOW: 'Night',
    DAWN: 'Dawn',
    ENDGAME: 'End or continue',
    FINAL_VOTE: 'Endgame vote',
    FINAL_BANISH: 'Endgame verdict',
    FINISHED: 'Game complete',
    ARCHIVED: 'Archived game',
  };
  return labels[phase];
}

export function formatCoordinatorCountdown(
  deadline: number | null,
  serverNow: number,
  localNow = Date.now(),
): string {
  if (deadline === null) return en.coordinator.noTimer;
  const seconds = secondsUntilServerDeadline(
    deadline,
    localNow,
    serverClockOffset(serverNow, localNow),
  );
  if (seconds === 0) return en.coordinator.movingOn;
  return `${en.coordinator.timeLeft}: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const nonActivePhases = new Set<FullView['phase']>([
  'DRAFT',
  'LOBBY',
  'FINISHED',
  'ARCHIVED',
]);

export function CoordinatorConsole({
  view,
  onCommand,
  onReturnToGame,
}: {
  view: CoordinatorConsoleView;
  onCommand: (command: CoordinatorCommand) => Promise<void>;
  onReturnToGame: () => void;
}) {
  const [localNow, setLocalNow] = useState(() => Date.now());
  const [confirmMove, setConfirmMove] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = !nonActivePhases.has(view.phase);

  useEffect(() => {
    if (!active || view.paused || view.deadline === null) return;
    const timer = window.setInterval(() => setLocalNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active, view.deadline, view.paused]);

  const remaining =
    view.deadline === null
      ? 'No timer'
      : view.paused
        ? 'Paused'
        : formatCoordinatorCountdown(view.deadline, view.serverNow, localNow);
  const movePrompt = getCoordinatorMoveConfirmation(view.progress);

  async function run(command: CoordinatorCommand): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError('');
    try {
      await onCommand(command);
      return true;
    } catch {
      setError(en.coordinator.error);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="entry-lobby enter coordinator-console"
      aria-labelledby="coordinator-console-title"
      data-testid="coordinator-console"
    >
      <h1 className="entry-heading" id="coordinator-console-title">
        {en.coordinator.heading}
      </h1>
      <dl className="coordinator-console-summary">
        <div className="flex justify-between border-b border-stone py-3">
          <dt>{en.coordinator.currentStep}</dt>
          <dd data-testid="coordinator-current-step">
            {formatCoordinatorPhase(view.phase, view.revote)}
          </dd>
        </div>
        <div className="flex justify-between border-b border-stone py-3">
          <dt>{en.coordinator.timeLeft}</dt>
          <dd data-testid="coordinator-time-left">{remaining}</dd>
        </div>
        <div className="flex justify-between border-b border-stone py-3">
          <dt>{en.coordinator.privateProgress}</dt>
          <dd data-testid="coordinator-progress">
            {en.coordinator.progress(view.progress.done, view.progress.total)}
          </dd>
        </div>
      </dl>
      {error && (
        <p className="entry-error" role="alert">
          {error}
        </p>
      )}
      {active && (
        <div className="grid gap-3">
          <button
            className="entry-secondary-action"
            data-testid="button-coordinator-pause"
            type="button"
            disabled={busy}
            onClick={() => void run({ type: view.paused ? 'Resume' : 'Pause' })}
          >
            {view.paused ? en.coordinator.resume : en.coordinator.pause}
          </button>
          <div
            className="grid gap-2"
            role="group"
            aria-label={en.coordinator.extend}
          >
            {([1, 5, 15] as const).map((minutes) => (
              <button
                className="entry-secondary-action"
                data-testid={`button-extend-${minutes}`}
                type="button"
                key={minutes}
                disabled={busy || view.paused || view.deadline === null}
                onClick={() => void run({ type: 'ExtendPhase', minutes })}
              >
                {minutes === 1
                  ? en.coordinator.addMinute
                  : en.coordinator.addMinutes(minutes)}
              </button>
            ))}
          </div>
          <button
            className="entry-primary-action"
            data-testid="button-coordinator-move-on"
            type="button"
            disabled={busy || view.paused}
            onClick={() => {
              if (movePrompt) setConfirmMove(true);
              else void run({ type: 'AdvancePhase' });
            }}
          >
            {en.game.organiserMoveOn}
          </button>
          <button
            className="entry-secondary-action"
            data-testid="button-coordinator-end-early"
            type="button"
            disabled={busy}
            onClick={() => setConfirmEnd(true)}
          >
            {en.coordinator.endEarly}
          </button>
        </div>
      )}
      {confirmMove && movePrompt && (
        <section
          className="grid gap-3 border border-stone bg-hearth p-4"
          role="group"
          aria-labelledby="coordinator-move-confirmation"
          aria-live="polite"
        >
          <p id="coordinator-move-confirmation">{movePrompt}</p>
          <button
            className="entry-primary-action"
            type="button"
            disabled={busy || view.paused}
            onClick={async () => {
              if (await run({ type: 'AdvancePhase' })) setConfirmMove(false);
            }}
          >
            {en.coordinator.moveAnyway}
          </button>
          <button
            className="entry-secondary-action"
            type="button"
            onClick={() => setConfirmMove(false)}
          >
            {en.coordinator.cancel}
          </button>
        </section>
      )}
      {confirmEnd && (
        <section
          className="grid gap-3 border border-stone bg-hearth p-4"
          role="group"
          aria-labelledby="coordinator-end-confirmation"
          aria-live="polite"
        >
          <p id="coordinator-end-confirmation">
            {getCoordinatorEndConfirmation()}
          </p>
          <button
            className="entry-primary-action"
            type="button"
            disabled={busy}
            onClick={async () => {
              if (await run({ type: 'EndGameEarly' })) setConfirmEnd(false);
            }}
          >
            {en.coordinator.endNow}
          </button>
          <button
            className="entry-secondary-action"
            type="button"
            onClick={() => setConfirmEnd(false)}
          >
            {en.coordinator.keepPlaying}
          </button>
        </section>
      )}
      <button
        className="entry-secondary-action"
        data-testid="button-return-to-game"
        type="button"
        onClick={onReturnToGame}
      >
        {en.entry.backToGame}
      </button>
    </section>
  );
}
