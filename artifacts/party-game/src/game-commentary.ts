import type { FullView } from '@workspace/shared';
import { en } from './locale/en-GB';

export type CommentaryContext = {
  phase: string;
  cycle: number;
  aliveCount: number;
} & Pick<FullView, 'publicLog' | 'seats' | 'winner'>;

/** Only public state is accepted: private choices can never enter this copy. */
export function publicStepCommentary(
  context: CommentaryContext,
): string | null {
  const { phase, cycle, aliveCount, publicLog, seats, winner } = context;
  const copy = en.game.commentary;
  const last = publicLog
    .slice()
    .reverse()
    .find((entry) => ['banishment', 'dawn', 'no_votes'].includes(entry.action));
  switch (phase) {
    case 'DEBATE': {
      const lastEvent =
        last?.action === 'banishment'
          ? copy.lastBanished(last.seat.name)
          : last?.action === 'dawn'
            ? copy.taken(last.victims.map((seat) => seat.name))
            : last?.action === 'no_votes'
              ? en.game.noVotesAnnouncement
              : copy.noBanishment;
      return copy.conversation(cycle, aliveCount, lastEvent);
    }
    case 'VOTE':
      return copy.vote;
    case 'SHADOW':
      return copy.night(cycle);
    case 'DAWN': {
      const dawn = publicLog
        .slice()
        .reverse()
        .find((entry) => entry.action === 'dawn');
      return copy.morning(dawn?.victims.map((seat) => seat.name) ?? []);
    }
    case 'VERDICT': {
      const result =
        last?.action === 'no_votes'
          ? en.game.noVotesAnnouncement
          : last?.action === 'banishment'
            ? copy.banished(
                last.seat.name,
                seats.find((seat) => seat.id === last.seat.id)?.role,
              )
            : null;
      return result ? `${result} ${copy.afterVerdict(aliveCount)}` : null;
    }
    case 'FINISHED':
      return winner ? copy.result(winner) : copy.complete;
    case 'MISSION':
      return copy.mission;
    default:
      return null;
  }
}
