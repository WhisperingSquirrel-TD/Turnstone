import { en } from '@/locale/en-GB';

type PhaseProgressStatusProps = {
  phase: string;
  paused: boolean;
  done: number;
  total: number;
  compact?: boolean;
};

export function PhaseProgressStatus({
  phase,
  paused,
  done,
  total,
}: PhaseProgressStatusProps) {
  const message = paused
    ? en.game.paused
    : phase === 'VOTE' || phase === 'FINAL_BANISH'
      ? en.game.votesProgress(done, total)
      : ['DEAL', 'FINAL_VOTE'].includes(phase)
        ? en.game.readyProgress(done, total)
        : null;

  if (!message) return null;

  return (
    <div data-testid="game-progress-commentary">
      <p
        role="status"
        className="max-w-xl text-base text-ash"
        data-testid="phase-progress-status"
      >
        {message}
      </p>
    </div>
  );
}
