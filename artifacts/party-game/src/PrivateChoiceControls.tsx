import { en } from '@/locale/en-GB';

export type PrivateChoiceOption = {
  id: string;
  name: string;
};

export type PrivateChoiceControlsProps = {
  choices: PrivateChoiceOption[];
  selected: string;
  confirmChoice: boolean;
  isPending: boolean;
  hasToken: boolean;
  commandMessage: string;
  onSelect: (choiceId: string) => void;
  onReview: () => void;
  onConfirm: () => void;
  onChooseAgain: () => void;
};

export function PrivateChoiceControls({
  choices,
  selected,
  confirmChoice,
  isPending,
  hasToken,
  commandMessage,
  onSelect,
  onReview,
  onConfirm,
  onChooseAgain,
}: PrivateChoiceControlsProps) {
  return (
    <>
      <div className="mt-3 grid gap-2" data-testid="private-choice-list">
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            className="choice-action"
            aria-pressed={selected === choice.id}
            onClick={() => onSelect(choice.id)}
          >
            {choice.name}
          </button>
        ))}
      </div>
      {selected && !confirmChoice && (
        <button
          className="quiet-action mt-4 w-full"
          type="button"
          onClick={onReview}
        >
          {en.game.reviewChoice}
        </button>
      )}
      {selected && confirmChoice && (
        <div className="mt-4 border-t border-stone pt-4">
          <p className="text-candle">{en.game.confirmChoice}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              className="primary-action flex-1"
              disabled={isPending || !hasToken}
              onClick={onConfirm}
            >
              {isPending ? en.game.recording : en.game.confirm}
            </button>
            <button
              type="button"
              className="quiet-action flex-1"
              onClick={onChooseAgain}
            >
              {en.game.chooseAgain}
            </button>
          </div>
        </div>
      )}
      {commandMessage && (
        <p role="status" className="mt-4 text-sm text-ash">
          {commandMessage}
        </p>
      )}
    </>
  );
}
