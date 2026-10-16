import { en } from '@/locale/en-GB';
import {
  PrivateChoiceControls,
  type PrivateChoiceControlsProps,
} from './PrivateChoiceControls';

export function BanishmentVoteScreen(props: PrivateChoiceControlsProps) {
  const alphabeticalChoices = [...props.choices].sort((left, right) =>
    left.name.localeCompare(right.name, 'en-GB', { sensitivity: 'base' }),
  );

  return (
    <div className="enter">
      <p className="display text-2xl">{en.game.votePrompt}</p>
      <PrivateChoiceControls {...props} choices={alphabeticalChoices} />
    </div>
  );
}
