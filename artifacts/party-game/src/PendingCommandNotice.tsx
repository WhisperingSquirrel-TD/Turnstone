import { en } from '@/locale/en-GB';

type PendingCommandNoticeProps = {
  disabled?: boolean;
  onResend: () => void;
};

export function PendingCommandNotice({
  disabled = false,
  onResend,
}: PendingCommandNoticeProps) {
  return (
    <div
      className="mt-4 grid gap-2 rounded border border-stone p-3 text-left"
      data-testid="pending-command-notice"
    >
      <p role="status" aria-live="polite" className="text-sm text-ash">
        {en.game.waitingToSend}
      </p>
      <button
        type="button"
        className="quiet-action w-full"
        disabled={disabled}
        onClick={onResend}
      >
        {en.game.resend}
      </button>
    </div>
  );
}
