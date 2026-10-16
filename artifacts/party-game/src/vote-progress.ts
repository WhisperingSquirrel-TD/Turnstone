import type { FullView } from '@workspace/shared';
import { en } from '@/locale/en-GB';

export function voteCompletionMessage(
  view: Pick<FullView, 'phase' | 'progress' | 'rehearsal' | 'canAdvancePhase'>,
): string | null {
  if (
    !['VOTE', 'FINAL_BANISH'].includes(view.phase) ||
    view.progress.total === 0 ||
    view.progress.done < view.progress.total
  ) {
    return null;
  }

  if (view.rehearsal) return en.game.everyoneVotedRehearsal;
  if (view.canAdvancePhase) return en.game.everyoneVotedOrganiser;
  return en.game.everyoneVotedPlayer;
}
