import { useEffect, useId, useRef, useState } from 'react';
import { en } from './locale/en-GB';

type Seat = { id: string; name: string };
type PendingSeat = Seat & { disconnected: boolean };
type ConfirmationType = 'SkipPendingAction' | 'RemoveDisconnectedSeat';
type Confirmation = { type: ConfirmationType; seatId: string };

export type PendingPlayerCommand = {
  type:
    ConfirmationType | 'UndoPendingActionSkip' | 'ReinstateDisconnectedSeat';
  seatId: string;
};

export type PendingPlayerControlsProps = {
  pendingSeats: PendingSeat[];
  skippedSeats: Seat[];
  restorableSeats: Seat[];
  busy: boolean;
  onCommand: (command: PendingPlayerCommand) => Promise<boolean>;
};

const secondaryAction = 'entry-secondary-action min-h-[44px] min-w-[44px]';
const primaryAction = 'entry-primary-action min-h-[44px] min-w-[44px]';
const waitingHelp =
  'Waiting does not change the game. It dismisses any confirmation and keeps their action pending.';

export function getPendingPlayerConfirmation(
  confirmation: Confirmation | null,
  pendingSeats: PendingSeat[],
) {
  if (!confirmation) return null;
  const seat = pendingSeats.find(
    (candidate) =>
      candidate.id === confirmation.seatId && candidate.disconnected,
  );
  return seat ? { ...confirmation, seat } : null;
}

export function PendingPlayerConfirmation({
  seat,
  type,
  busy,
  onWait,
  onConfirm,
}: {
  seat: Seat;
  type: ConfirmationType;
  busy: boolean;
  onWait: () => void;
  onConfirm: () => void;
}) {
  const skip = type === 'SkipPendingAction';
  return (
    <div
      role="group"
      aria-label={`${skip ? en.coordinator.confirmSkip : en.coordinator.confirmRemove}: ${seat.name}`}
      className="grid gap-3 rounded border border-stone p-3"
      data-testid={`confirmation-pending-${seat.id}`}
    >
      <p role="status" data-testid={`text-confirmation-${seat.id}`}>
        {skip
          ? en.coordinator.skipActionConfirmation(seat.name)
          : en.coordinator.removeSeatConfirmation(seat.name)}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={secondaryAction}
          data-testid={`button-wait-confirmation-${seat.id}`}
          onClick={onWait}
        >
          {en.coordinator.waitLonger}
        </button>
        <button
          type="button"
          className={primaryAction}
          data-testid={`button-confirm-${skip ? 'skip' : 'remove'}-${seat.id}`}
          disabled={busy}
          onClick={onConfirm}
        >
          {skip ? en.coordinator.confirmSkip : en.coordinator.confirmRemove}
        </button>
      </div>
      <p className="text-sm text-ash">{waitingHelp}</p>
    </div>
  );
}

export function PendingPlayerControls({
  pendingSeats,
  skippedSeats,
  restorableSeats,
  busy,
  onCommand,
}: PendingPlayerControlsProps) {
  const headingId = useId();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const activeConfirmation = getPendingPlayerConfirmation(
    confirmation,
    pendingSeats,
  );
  const disabled = busy || sending;

  useEffect(() => {
    if (
      confirmation &&
      !getPendingPlayerConfirmation(confirmation, pendingSeats)
    ) {
      setConfirmation(null);
    }
  }, [confirmation, pendingSeats]);

  async function send(command: PendingPlayerCommand) {
    if (busy || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError('');
    try {
      if (await onCommand(command)) {
        setConfirmation((current) =>
          current?.seatId === command.seatId && current.type === command.type
            ? null
            : current,
        );
      } else {
        setError(
          'The action could not be completed. Check the game state and try again.',
        );
      }
    } catch {
      setError(
        'The action could not be completed. Check your connection and try again.',
      );
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  if (!pendingSeats.length && !skippedSeats.length && !restorableSeats.length) {
    return null;
  }

  return (
    <section
      className="grid min-w-0 gap-3"
      aria-labelledby={headingId}
      aria-busy={disabled}
      data-testid="pending-player-controls"
    >
      <h3 id={headingId} className="display text-xl">
        {en.coordinator.pendingActionsHeading}
      </h3>
      {pendingSeats.length > 0 && (
        <p data-testid="text-pending-count">
          {en.coordinator.pendingActionsCount(pendingSeats.length)}
        </p>
      )}
      <ul className="grid min-w-0 gap-3">
        {pendingSeats.map((seat) => (
          <li
            key={seat.id}
            className="grid min-w-0 gap-3 rounded border border-stone p-3"
            data-testid={`row-pending-${seat.id}`}
          >
            <p
              className="break-words font-semibold"
              data-testid={`text-pending-name-${seat.id}`}
            >
              {seat.name}
            </p>
            {!seat.disconnected ? (
              <p className="text-sm text-ash">
                {en.coordinator.pendingActionsGrace}
              </p>
            ) : (
              <>
                <p className="text-sm text-ash">
                  {en.coordinator.pendingActionDisconnected}
                </p>
                <div
                  role="group"
                  aria-label={seat.name}
                  className="flex flex-wrap gap-3"
                >
                  <button
                    type="button"
                    className={secondaryAction}
                    data-testid={`button-wait-${seat.id}`}
                    onClick={() => setConfirmation(null)}
                  >
                    {en.coordinator.waitLonger}
                  </button>
                  <button
                    type="button"
                    className={secondaryAction}
                    data-testid={`button-skip-${seat.id}`}
                    disabled={disabled}
                    onClick={() =>
                      setConfirmation({
                        type: 'SkipPendingAction',
                        seatId: seat.id,
                      })
                    }
                  >
                    {en.coordinator.skipPendingAction}
                  </button>
                  <button
                    type="button"
                    className={secondaryAction}
                    data-testid={`button-remove-${seat.id}`}
                    disabled={disabled}
                    onClick={() =>
                      setConfirmation({
                        type: 'RemoveDisconnectedSeat',
                        seatId: seat.id,
                      })
                    }
                  >
                    {en.coordinator.removeDisconnectedPlayer}
                  </button>
                </div>
                {activeConfirmation?.seatId === seat.id ? (
                  <PendingPlayerConfirmation
                    seat={seat}
                    type={activeConfirmation.type}
                    busy={disabled}
                    onWait={() => setConfirmation(null)}
                    onConfirm={() =>
                      void send({
                        type: activeConfirmation.type,
                        seatId: seat.id,
                      })
                    }
                  />
                ) : (
                  <p className="text-sm text-ash">{waitingHelp}</p>
                )}
              </>
            )}
          </li>
        ))}
        {skippedSeats.map((seat) => (
          <li
            key={`skipped-${seat.id}`}
            className="grid min-w-0 gap-2"
            data-testid={`row-skipped-${seat.id}`}
          >
            <p
              className="break-words"
              data-testid={`text-skipped-name-${seat.id}`}
            >
              {seat.name}
            </p>
            <button
              type="button"
              className={secondaryAction}
              aria-label={`Undo skip: ${seat.name}`}
              data-testid={`button-undo-skip-${seat.id}`}
              disabled={disabled}
              onClick={() =>
                void send({ type: 'UndoPendingActionSkip', seatId: seat.id })
              }
            >
              Undo skip
            </button>
          </li>
        ))}
        {restorableSeats.map((seat) => (
          <li
            key={`restorable-${seat.id}`}
            className="grid min-w-0 gap-2"
            data-testid={`row-restorable-${seat.id}`}
          >
            <p
              className="break-words"
              data-testid={`text-restorable-name-${seat.id}`}
            >
              {seat.name}
            </p>
            <button
              type="button"
              className={secondaryAction}
              aria-label={`${en.coordinator.restorePendingSeat}: ${seat.name}`}
              data-testid={`button-reinstate-${seat.id}`}
              disabled={disabled}
              onClick={() =>
                void send({
                  type: 'ReinstateDisconnectedSeat',
                  seatId: seat.id,
                })
              }
            >
              {en.coordinator.restorePendingSeat}
            </button>
            <p className="text-sm text-ash">
              {en.coordinator.restorePendingSeatHelp}
            </p>
          </li>
        ))}
      </ul>
      {error && (
        <p
          role="alert"
          className="entry-error"
          data-testid="text-pending-error"
        >
          {error}
        </p>
      )}
    </section>
  );
}
