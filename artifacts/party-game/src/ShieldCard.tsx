import { forwardRef, type ReactNode } from 'react';
import { en } from '@/locale/en-GB';
import { PendingCommandNotice } from './PendingCommandNotice';

type ShieldCardProps = {
  countdown: number;
  pending: boolean;
  waitingToSend?: boolean;
  message?: string;
  hasToken: boolean;
  showNotesDone: boolean;
  onAcknowledge: () => void;
  onNotesDone: () => void;
  header: ReactNode;
  footer?: ReactNode;
};

export const ShieldCard = forwardRef<HTMLDialogElement, ShieldCardProps>(
  function ShieldCard(
    {
      countdown,
      pending,
      waitingToSend = false,
      message,
      hasToken,
      showNotesDone,
      onAcknowledge,
      onNotesDone,
      header,
      footer,
    },
    ref,
  ) {
    return (
      <dialog
        ref={ref}
        className="privacy-shield"
        aria-labelledby="privacy-shield-title"
        onCancel={(event) => event.preventDefault()}
      >
        {header}
        <div className="privacy-shield-content">
          <div className="mx-auto w-full max-w-md text-center">
            <h1
              id="privacy-shield-title"
              className="display text-3xl sm:text-4xl"
            >
              {en.game.shieldHeading}
            </h1>
            <p className="mt-4 text-ash">{en.game.shieldDetail}</p>
            {waitingToSend ? (
              <PendingCommandNotice
                disabled={pending}
                onResend={onAcknowledge}
              />
            ) : (
              <button
                autoFocus
                className="primary-action mt-8 min-h-14 w-full"
                type="button"
                disabled={!hasToken || pending || countdown > 0}
                aria-disabled={!hasToken || pending || countdown > 0}
                onClick={onAcknowledge}
              >
                {pending
                  ? en.game.shieldConfirming
                  : countdown > 0
                    ? en.game.countdown(countdown)
                    : en.game.shieldConfirm}
              </button>
            )}
            {message && !waitingToSend && (
              <p role="alert" className="mt-3 text-sm text-ash">
                {message}
              </p>
            )}
            {showNotesDone && (
              <button
                className="quiet-action mt-3 w-full"
                type="button"
                onClick={onNotesDone}
              >
                {en.game.notesDone}
              </button>
            )}
          </div>
        </div>
        {footer}
      </dialog>
    );
  },
);
