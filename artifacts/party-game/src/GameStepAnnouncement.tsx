import { en } from '@/locale/en-GB';

type GameStepAnnouncementProps = {
  aliveCount: number;
  endRule: 'unanimous' | 'majority';
  murderSlots: number;
  phase: string;
  shadowRound: number;
  progress?: { done: number; total: number };
};

export function GameStepAnnouncement({
  aliveCount,
  endRule,
  murderSlots,
  phase,
  shadowRound,
  progress,
}: GameStepAnnouncementProps) {
  let message: string | null = null;

  if (phase === 'SHADOW') {
    if (shadowRound === 2) message = en.game.unanimousNoDecision;
    else if (murderSlots === 2) message = en.game.doubleMurderReason;
  } else if (phase === 'FINAL_VOTE') {
    message =
      endRule === 'unanimous'
        ? en.game.finalDecisionUnanimous(aliveCount)
        : en.game.finalDecisionMajority(aliveCount);
  } else if (phase === 'FINAL_BANISH') {
    message = en.game.finalContinue;
  }

  const votes =
    progress && ['VOTE', 'FINAL_BANISH'].includes(phase)
      ? en.game.votesProgress(progress.done, progress.total)
      : null;
  if (!message && !votes) return null;

  return (
    <p
      className="mb-4 text-base text-ash"
      data-testid="game-commentary"
      aria-live="polite"
    >
      {message && <span data-testid="game-context-line">{message}</span>}
      {message && votes && ' '}
      {votes && <span data-testid="vote-progress-commentary">{votes}</span>}
    </p>
  );
}
