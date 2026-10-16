import { en } from '@/locale/en-GB';
import {
  PrivateChoiceControls,
  type PrivateChoiceControlsProps,
} from './PrivateChoiceControls';

export function BanishmentVoteScreen(props: PrivateChoiceControlsProps) {
  return (
    <div className="enter">
      <p className="display text-2xl">{en.game.votePrompt}</p>
      <PrivateChoiceControls {...props} />
    </div>
  );
}
