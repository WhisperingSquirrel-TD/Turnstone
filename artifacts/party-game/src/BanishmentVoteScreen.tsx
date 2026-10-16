import { en } from '@/locale/en-GB';
import {
  PrivateChoiceControls,
  type PrivateChoiceControlsProps,
} from './PrivateChoiceControls';

type BanishmentVoteScreenProps = PrivateChoiceControlsProps & {
  revote?: boolean;
  tieCandidateNames?: string[];
};

export function BanishmentVoteScreen({
  revote = false,
  tieCandidateNames = [],
  ...props
}: BanishmentVoteScreenProps) {
  const alphabeticalChoices = [...props.choices].sort((left, right) =>
    left.name.localeCompare(right.name, 'en-GB', { sensitivity: 'base' }),
  );
  const alphabeticalTieCandidates = [...tieCandidateNames].sort((left, right) =>
    left.localeCompare(right, 'en-GB', { sensitivity: 'base' }),
  );

  return (
    <div className="enter">
      {revote && alphabeticalTieCandidates.length >= 2 && (
        <p
          className="text-left text-sm text-ash"
          data-testid="tie-revote-prompt"
        >
          {en.game.tieRevotePrompt(alphabeticalTieCandidates)}
        </p>
      )}
      <p className="display text-2xl">{en.game.votePrompt}</p>
      <PrivateChoiceControls
        {...props}
        choices={alphabeticalChoices}
        voteProgressRows={props.voteProgressRows}
        viewerSeatId={props.viewerSeatId}
      />
    </div>
  );
}
