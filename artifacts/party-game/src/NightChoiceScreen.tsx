import {
  PrivateChoiceControls,
  type PrivateChoiceControlsProps,
} from './PrivateChoiceControls';

type NightChoiceScreenProps = PrivateChoiceControlsProps & {
  actionDone?: boolean;
  taskInstruction?: string;
  slotLabel: string;
  prompt: string;
  statusLines: string[];
};

export function NightChoiceScreen({
  actionDone = false,
  taskInstruction,
  slotLabel,
  prompt,
  statusLines,
  ...choiceControls
}: NightChoiceScreenProps) {
  return (
    <div className="enter">
      {taskInstruction && (
        <p className="mb-4 text-left text-candle">{taskInstruction}</p>
      )}
      <p className="display text-2xl" data-testid="shadow-slot-label">
        {slotLabel}
      </p>
      <p className="mt-2 text-left text-candle">{prompt}</p>
      <section
        className="night-status-card mt-3"
        data-testid="shadow-status"
        aria-label="Night status"
        aria-live="polite"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <p
            key={index}
            className="night-status-card__line"
            title={statusLines[index] ?? ''}
            aria-label={statusLines[index] ?? ''}
          >
            {statusLines[index] ?? ''}
          </p>
        ))}
      </section>
      <PrivateChoiceControls {...choiceControls} choiceSubmitted={actionDone} />
    </div>
  );
}
