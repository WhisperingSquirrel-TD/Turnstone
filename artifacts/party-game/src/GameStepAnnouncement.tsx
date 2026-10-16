import { en } from '@/locale/en-GB';

type GameStepAnnouncementProps = {
  aliveCount: number;
  endRule: 'unanimous' | 'majority';
  murderSlots: number;
  phase: string;
  shadowRound: number;
};

export function GameStepAnnouncement({
  aliveCount,
  endRule,
  murderSlots,
  phase,
  shadowRound,
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

  if (!message) return null;

  return (
    <p
      className="mb-4 text-sm text-ash"
      data-testid="game-context-line"
      aria-live="polite"
    >
      {message}
    </p>
  );
}
