import {
  PrivateChoiceControls,
  type PrivateChoiceControlsProps,
} from './PrivateChoiceControls';

type NightChoiceScreenProps = PrivateChoiceControlsProps & {
  taskInstruction?: string;
  slotLabel: string;
  prompt: string;
  statusLines: string[];
};

export function NightChoiceScreen({
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
      <div
        className="mt-2 grid h-20 grid-rows-4 overflow-hidden text-left text-xs leading-5 text-ash"
        data-testid="shadow-status"
        aria-live="polite"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <p
            key={index}
            className="truncate"
            title={statusLines[index] ?? ''}
            aria-label={statusLines[index] ?? ''}
          >
            {statusLines[index] ?? ''}
          </p>
        ))}
      </div>
      <PrivateChoiceControls {...choiceControls} />
    </div>
  );
}
