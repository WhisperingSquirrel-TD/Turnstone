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
        className="mt-2 grid min-h-12 grid-rows-2 gap-1 whitespace-pre-wrap text-left text-sm text-ash"
        data-testid="shadow-status"
        aria-live="polite"
      >
        {statusLines.map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
      <PrivateChoiceControls {...choiceControls} />
    </div>
  );
}
