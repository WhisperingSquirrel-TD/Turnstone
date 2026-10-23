import { useEffect, useState } from 'react';
import { en } from '@/locale/en-GB';

type PendingCommandNoticeProps = {
  disabled?: boolean;
  retryAfterUntil?: number | null;
  onResend: () => void;
};

export function PendingCommandNotice({
  disabled = false,
  retryAfterUntil = null,
  onResend,
}: PendingCommandNoticeProps) {
  const [now, setNow] = useState(() => Date.now());
  const retryAfterSeconds =
    retryAfterUntil === null
      ? 0
      : Math.max(0, Math.ceil((retryAfterUntil - now) / 1_000));

  useEffect(() => {
    if (retryAfterUntil === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (currentTime >= retryAfterUntil) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [retryAfterUntil]);

  return (
    <div
      className="mt-4 grid gap-2 rounded border border-stone p-3 text-left"
      data-testid="pending-command-notice"
    >
      <p role="status" aria-live="polite" className="text-sm text-ash">
        {en.game.waitingToSend}
      </p>
      {retryAfterSeconds > 0 && (
        <p role="status" aria-live="polite" className="text-sm text-ash">
          {en.game.resendAvailableIn(retryAfterSeconds)}
        </p>
      )}
      <button
        type="button"
        className="quiet-action w-full"
        disabled={disabled || retryAfterSeconds > 0}
        onClick={onResend}
      >
        {en.game.resend}
      </button>
    </div>
  );
}
