import { en } from './locale/en-GB';

type WatchPhase = keyof typeof en.game.rehearsalWatch;

export function rehearsalWatchMessage(phase: string): string | null {
  return Object.prototype.hasOwnProperty.call(en.game.rehearsalWatch, phase)
    ? en.game.rehearsalWatch[phase as WatchPhase]
    : null;
}

export function RehearsalWatchCommentary({ phase }: { phase: string }) {
  const message = rehearsalWatchMessage(phase);
  if (!message) return null;
  return (
    <p
      className="mb-4 text-sm text-ash"
      data-testid="rehearsal-watch-commentary"
      role="status"
    >
      {message}
    </p>
  );
}

export function RehearsalWatchAction({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="secondary-action mb-2 w-full"
      data-testid="button-practise-again"
      type="button"
      onClick={onClick}
    >
      {en.game.rehearseAgain}
    </button>
  );
}
