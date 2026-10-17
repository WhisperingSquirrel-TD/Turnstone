import { en } from '@/locale/en-GB';
import {
  publicStepCommentary,
  type CommentaryContext,
} from './game-commentary';

type GameStepAnnouncementProps = {
  aliveCount: number;
  endRule: 'unanimous' | 'majority';
  murderSlots: number;
  phase: string;
  shadowRound: number;
  progress?: { done: number; total: number };
  context?: CommentaryContext;
  coachingTip?: string;
};

export function GameStepAnnouncement({
  aliveCount,
  endRule,
  murderSlots,
  phase,
  shadowRound,
  progress,
  context,
  coachingTip,
}: GameStepAnnouncementProps) {
  let message: string | null = null;

  if (phase === 'SHADOW') {
    if (shadowRound === 2) message = en.game.unanimousNoDecision;
    else if (murderSlots === 2) message = en.game.doubleMurderReason;
  } else if (phase === 'FINAL_VOTE' || phase === 'ENDGAME') {
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
  // VerdictScreen owns its ordered reveal; never announce its result early.
  const summary =
    context && phase !== 'VERDICT' ? publicStepCommentary(context) : null;
  if (!message && !votes && !summary) return null;

  return (
    <div className="mb-4" data-testid="game-commentary">
      <p className="text-base text-ash" aria-live="polite">
        {summary && message && <>{summary} </>}
        {(message || summary) && (
          <span data-testid="game-context-line">{message ?? summary}</span>
        )}
        {(message || summary) && votes && ' '}
        {votes && <span data-testid="vote-progress-commentary">{votes}</span>}
      </p>
      {coachingTip && (
        <p className="mt-1 text-sm text-ash" data-testid="rehearsal-coaching">
          {coachingTip}
        </p>
      )}
    </div>
  );
}
