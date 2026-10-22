import { useEffect, useState } from 'react';
import type { FullView } from '@workspace/api-client-react';
import { en } from './locale/en-GB';
import { PendingPlayerControls } from './PendingPlayerControls';
import { getAdvanceControlState, isAdvanceConflict } from './advance-control';
import { secondsUntilServerDeadline, serverClockOffset } from './server-clock';

export type CoordinatorCommand =
  | { type: 'AdvancePhase' }
  | { type: 'Pause' }
  | { type: 'Resume' }
  | { type: 'ExtendPhase'; minutes: 1 | 5 | 15 }
  | { type: 'MarkDeparted'; seatId: string }
  | { type: 'SkipPendingAction'; seatId: string }
  | { type: 'UndoPendingActionSkip'; seatId: string }
  | { type: 'RemoveDisconnectedSeat'; seatId: string }
  | { type: 'ReinstateDisconnectedSeat'; seatId: string }
  | { type: 'EndGameEarly' }
  | { type: 'UndoCoordinatorAction' };

export interface CoordinatorConsoleView {
  phase: FullView['phase'];
  revote: boolean;
  paused: boolean;
  deadline: number | null;
  serverNow: number;
  coordinatorMinimumAdvanceAt?: number | null;
  progress: FullView['progress'];
  actionStatus: FullView['actionStatus'];
  coordinatorPendingSeats?: FullView['coordinatorPendingSeats'];
  coordinatorSkippedSeats?: FullView['coordinatorSkippedSeats'];
  coordinatorRestorableSeats?: FullView['coordinatorRestorableSeats'];
  seats: FullView['seats'];
  publicLog: FullView['publicLog'];
  coordinatorAlerts: FullView['coordinatorAlerts'];
  coordinatorUndo: FullView['coordinatorUndo'];
}

function formatPublicUpdate(entry: FullView['publicLog'][number]): string {
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
  offsetMs = serverClockOffset(serverNow, localNow),
): string {
  if (deadline === null) return en.coordinator.noTimer;
  const seconds = secondsUntilServerDeadline(deadline, localNow, offsetMs);
  if (seconds === 0) return en.coordinator.movingOn;
  return `${en.coordinator.timeLeft}: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function sampleCoordinatorClock(serverNow: number) {
  const localNow = Date.now();
  return {
    localNow,
    offsetMs: serverClockOffset(serverNow, localNow),
  };
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
  presenterPath,
  onCreatePresenterPairing,
  onLoadCoordinatorDelegates,
  onSaveCoordinatorDelegates,
  onHeartbeat,
}: {
  view: CoordinatorConsoleView;
  onCommand: (command: CoordinatorCommand) => Promise<void>;
  presenterPath: string;
  onCreatePresenterPairing: () => Promise<{
    code: string;
    expiresAt: number;
  }>;
  onLoadCoordinatorDelegates: () => Promise<{
    limit: number;
    seatIds: string[];
  }>;
  onSaveCoordinatorDelegates: (seatIds: string[]) => Promise<{
    limit: number;
    seatIds: string[];
  }>;
  onHeartbeat: () => Promise<void>;
}) {
  const [clockSample, setClockSample] = useState(() =>
    sampleCoordinatorClock(view.serverNow),
  );
  const { localNow, offsetMs: serverClockOffsetMs } = clockSample;
  const [confirmMove, setConfirmMove] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [departingSeatId, setDepartingSeatId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [presenterPairing, setPresenterPairing] = useState<{
    code: string;
    expiresAt: number;
  } | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingError, setPairingError] = useState('');
  const [delegateLimit, setDelegateLimit] = useState(0);
  const [selectedDelegateIds, setSelectedDelegateIds] = useState<string[]>([]);
  const [delegateSelectionDirty, setDelegateSelectionDirty] = useState(false);
  const [delegateBusy, setDelegateBusy] = useState(false);
  const [delegateError, setDelegateError] = useState('');
  const [delegateSaved, setDelegateSaved] = useState(false);
  const active = !nonActivePhases.has(view.phase);
  const minimumWaitSeconds = getAdvanceControlState({
    minimumAdvanceAt: view.coordinatorMinimumAdvanceAt,
    localNow,
    serverClockOffsetMs,
  }).waitSeconds;

  useEffect(() => {
    setClockSample(sampleCoordinatorClock(view.serverNow));
  }, [view.serverNow]);

  useEffect(() => {
    let mounted = true;
    async function refreshCoordinatorAccess() {
      try {
        await onHeartbeat();
        const result = await onLoadCoordinatorDelegates();
        if (!mounted) return;
        setDelegateLimit(result.limit);
        if (!delegateSelectionDirty) setSelectedDelegateIds(result.seatIds);
        setDelegateError('');
      } catch {
        if (mounted) setDelegateError(en.coordinator.coCoordinatorError);
      }
    }
    void refreshCoordinatorAccess();
    const interval = window.setInterval(
      () => void refreshCoordinatorAccess(),
      30_000,
    );
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [delegateSelectionDirty, onHeartbeat, onLoadCoordinatorDelegates]);

  useEffect(() => {
    if (
      !active ||
      view.paused ||
      (view.deadline === null && minimumWaitSeconds === 0)
    )
      return;
    const timer = window.setInterval(
      () => {
        const nextLocalNow = Date.now();
        setClockSample((current) => ({ ...current, localNow: nextLocalNow }));
      },
      minimumWaitSeconds > 0 ? 100 : 1_000,
    );
    return () => window.clearInterval(timer);
  }, [active, view.deadline, view.paused, minimumWaitSeconds]);

  const remaining =
    view.deadline === null
      ? 'No timer'
      : view.paused
        ? 'Paused'
        : formatCoordinatorCountdown(
            view.deadline,
            view.serverNow,
            localNow,
            serverClockOffsetMs,
          );
  const movePrompt = getCoordinatorMoveConfirmation(view.progress);

  async function run(command: CoordinatorCommand): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError('');
    try {
      await onCommand(command);
      return true;
    } catch (error) {
      setError(
        command.type === 'AdvancePhase' && isAdvanceConflict(error)
          ? en.coordinator.advanceTooEarly
          : en.coordinator.error,
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createPresenterPairing() {
    if (pairingBusy) return;
    setPairingBusy(true);
    setPairingError('');
    try {
      setPresenterPairing(await onCreatePresenterPairing());
    } catch {
      setPairingError(en.coordinator.presenterPairingError);
    } finally {
      setPairingBusy(false);
    }
  }

  async function saveCoordinatorDelegates() {
    if (delegateBusy) return;
    setDelegateBusy(true);
    setDelegateError('');
    setDelegateSaved(false);
    try {
      const result = await onSaveCoordinatorDelegates(selectedDelegateIds);
      setDelegateLimit(result.limit);
      setSelectedDelegateIds(result.seatIds);
      setDelegateSelectionDirty(false);
      setDelegateSaved(true);
    } catch {
      setDelegateError(en.coordinator.coCoordinatorError);
    } finally {
      setDelegateBusy(false);
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
      <section
        className="mt-6 grid gap-3 border-b border-stone pb-6"
        aria-labelledby="coordinator-delegates-heading"
        data-testid="coordinator-delegates"
      >
        <h2 className="display text-2xl" id="coordinator-delegates-heading">
          {en.coordinator.coCoordinatorHeading}
        </h2>
        <p className="text-ash">
          {delegateLimit > 0
            ? en.coordinator.coCoordinatorDescription
            : en.coordinator.coCoordinatorMajority}
        </p>
        {delegateLimit > 0 && (
          <>
            <p className="text-sm text-ash">
              {en.coordinator.coCoordinatorLimit(delegateLimit)}
            </p>
            <fieldset className="grid gap-2">
              <legend className="sr-only">
                {en.coordinator.coCoordinatorHeading}
              </legend>
              {view.seats
                .filter((seat) => seat.status === 'alive')
                .map((seat) => (
                  <label
                    key={seat.id}
                    className="flex min-h-11 items-center gap-3 border-b border-stone py-2"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDelegateIds.includes(seat.id)}
                      disabled={
                        delegateBusy ||
                        (!selectedDelegateIds.includes(seat.id) &&
                          selectedDelegateIds.length >= delegateLimit)
                      }
                      onChange={(event) => {
                        setDelegateSaved(false);
                        setDelegateSelectionDirty(true);
                        setSelectedDelegateIds((current) =>
                          event.target.checked
                            ? [...current, seat.id]
                            : current.filter((id) => id !== seat.id),
                        );
                      }}
                    />
                    <span>{seat.name}</span>
                  </label>
                ))}
            </fieldset>
            <button
              className="entry-secondary-action"
              type="button"
              disabled={delegateBusy}
              onClick={() => void saveCoordinatorDelegates()}
            >
              {delegateBusy
                ? en.coordinator.presenterPairingPending
                : en.coordinator.coCoordinatorSave}
            </button>
            {delegateSaved && (
              <p role="status" className="text-sm text-ash">
                {en.coordinator.coCoordinatorSaved}
              </p>
            )}
          </>
        )}
        {delegateError && (
          <p role="alert" className="entry-error">
            {delegateError}
          </p>
        )}
      </section>
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
      <PendingPlayerControls
        pendingSeats={view.coordinatorPendingSeats ?? []}
        skippedSeats={view.coordinatorSkippedSeats ?? []}
        restorableSeats={view.coordinatorRestorableSeats ?? []}
        busy={busy}
        onCommand={run}
      />
      <section
        className="mt-7 grid gap-3"
        aria-labelledby="coordinator-seats-heading"
        data-testid="coordinator-seats"
      >
        <h2 id="coordinator-seats-heading" className="display text-2xl">
          {en.coordinator.manageSeats}
        </h2>
        <ul className="divide-y divide-stone">
          {view.seats.map((seat) => (
            <li
              key={seat.id}
              className="flex min-h-14 items-center justify-between gap-3 py-2"
            >
              <span>{seat.name}</span>
              <span className="text-sm text-ash">
                {en.coordinator.seatStatus(seat.status)}
              </span>
              {seat.status === 'alive' && (
                <button
                  className="entry-secondary-action"
                  data-testid={`button-mark-departed-${seat.id}`}
                  type="button"
                  disabled={busy}
                  onClick={() => setDepartingSeatId(seat.id)}
                >
                  {en.coordinator.markDeparted}
                </button>
              )}
            </li>
          ))}
          {view.seats.length === 0 && (
            <li className="py-3 text-sm text-ash">{en.coordinator.noSeats}</li>
          )}
        </ul>
        {departingSeatId && (
          <div
            className="grid gap-3 border border-stone bg-hearth p-4"
            role="alertdialog"
            aria-labelledby="coordinator-departure-confirmation"
          >
            <p id="coordinator-departure-confirmation">
              {en.coordinator.confirmDeparted(
                view.seats.find((seat) => seat.id === departingSeatId)?.name ??
                  '',
              )}
            </p>
            <div className="flex gap-3">
              <button
                className="entry-secondary-action"
                type="button"
                disabled={busy}
                onClick={() => setDepartingSeatId(null)}
              >
                {en.coordinator.cancel}
              </button>
              <button
                className="entry-primary-action"
                data-testid="button-confirm-departed"
                type="button"
                disabled={busy}
                onClick={async () => {
                  const confirmedSeatId = departingSeatId;
                  if (
                    await run({
                      type: 'MarkDeparted',
                      seatId: confirmedSeatId,
                    })
                  )
                    setDepartingSeatId(null);
                }}
              >
                {en.coordinator.markDeparted}
              </button>
            </div>
          </div>
        )}
      </section>
      <section
        className="mt-7"
        aria-labelledby="coordinator-public-log-heading"
        data-testid="coordinator-public-log"
      >
        <h2 id="coordinator-public-log-heading" className="display text-2xl">
          {en.game.latestUpdates}
        </h2>
        <ul className="mt-2 divide-y divide-stone">
          {view.publicLog
            .slice()
            .sort((first, second) => second.seq - first.seq)
            .slice(0, 5)
            .map((entry) => (
              <li key={entry.seq} className="py-3 text-sm text-ash">
                {formatPublicUpdate(entry)}
              </li>
            ))}
          {view.publicLog.length === 0 && (
            <li className="py-3 text-sm text-ash">{en.game.noPublicUpdates}</li>
          )}
        </ul>
      </section>
      {view.coordinatorAlerts.length > 0 && (
        <section
          className="mt-7"
          aria-labelledby="coordinator-pin-lockouts-heading"
          data-testid="coordinator-pin-lockouts"
        >
          <h2
            id="coordinator-pin-lockouts-heading"
            className="display text-2xl"
          >
            {en.coordinator.pinLockoutsHeading}
          </h2>
          <ul className="mt-2 divide-y divide-stone">
            {view.coordinatorAlerts.map((alert) => (
              <li key={alert.seq} className="py-3 text-sm text-ash">
                {en.coordinator.seatPinLocked(
                  alert.name,
                  new Date(alert.lockedUntil).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section
        className="mt-7 grid gap-3"
        aria-labelledby="coordinator-presenter-heading"
        data-testid="coordinator-presenter"
      >
        <h2 id="coordinator-presenter-heading" className="display text-2xl">
          {en.coordinator.presenterHeading}
        </h2>
        <p className="text-ash">{en.coordinator.presenterDescription}</p>
        {pairingError && (
          <p className="entry-error" role="alert">
            {pairingError}
          </p>
        )}
        <button
          className="entry-secondary-action"
          data-testid="button-create-presenter-pairing"
          type="button"
          disabled={pairingBusy}
          onClick={() => void createPresenterPairing()}
        >
          {pairingBusy
            ? en.coordinator.presenterPairingPending
            : en.coordinator.createPresenterPairing}
        </button>
        {presenterPairing && (
          <div className="grid gap-2 border border-stone bg-hearth p-4">
            <a
              className="entry-secondary-action"
              data-testid="link-presenter-screen"
              href={presenterPath}
              target="_blank"
              rel="noreferrer"
            >
              {en.coordinator.openPresenterScreen}
            </a>
            <label className="entry-label" htmlFor="coordinator-presenter-code">
              {en.coordinator.presenterPairingCode}
            </label>
            <input
              className="entry-field"
              data-testid="text-presenter-pairing-code"
              id="coordinator-presenter-code"
              type="text"
              readOnly
              value={presenterPairing.code}
              onFocus={(event) => event.currentTarget.select()}
            />
            <p className="entry-help">
              {new Date(presenterPairing.expiresAt).toLocaleTimeString(
                'en-GB',
                { hour: '2-digit', minute: '2-digit' },
              )}
            </p>
          </div>
        )}
      </section>
      {error && (
        <p className="entry-error" role="alert">
          {error}
        </p>
      )}
      {active && (
        <div className="grid gap-3">
          {view.coordinatorUndo && (
            <button
              className="entry-secondary-action"
              data-testid="button-coordinator-undo"
              type="button"
              disabled={busy}
              onClick={() => void run({ type: 'UndoCoordinatorAction' })}
            >
              {en.coordinator.undoLastAction}
            </button>
          )}
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
            aria-label={en.game.organiserMoveOn}
            aria-describedby={
              minimumWaitSeconds > 0
                ? 'coordinator-move-on-wait-status'
                : undefined
            }
            aria-live="polite"
            disabled={
              busy ||
              view.paused ||
              minimumWaitSeconds > 0 ||
              view.actionStatus.waiting > 0
            }
            onClick={() => {
              if (movePrompt) setConfirmMove(true);
              else void run({ type: 'AdvancePhase' });
            }}
          >
            {view.actionStatus.waiting > 0
              ? en.coordinator.waitingForPlayers(view.actionStatus.waiting)
              : minimumWaitSeconds > 0
                ? en.coordinator.minimumMoveOnWait(minimumWaitSeconds)
                : en.game.organiserMoveOn}
          </button>
          {minimumWaitSeconds > 0 && (
            <span
              id="coordinator-move-on-wait-status"
              className="sr-only"
              role="status"
              aria-live="polite"
            >
              {en.coordinator.minimumMoveOnStatus(minimumWaitSeconds)}
            </span>
          )}
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
            disabled={
              busy ||
              view.paused ||
              minimumWaitSeconds > 0 ||
              view.actionStatus.waiting > 0
            }
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
    </section>
  );
}
