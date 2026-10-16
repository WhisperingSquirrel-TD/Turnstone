import { en } from '@/locale/en-GB';

export type PrivateChoiceOption = {
  id: string;
  name: string;
};

export type VoteProgressRow = {
  id: string;
  name: string;
  hasVoted: boolean;
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
  voteProgressRows?: VoteProgressRow[];
  viewerSeatId?: string;
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
  voteProgressRows,
  viewerSeatId,
}: PrivateChoiceControlsProps) {
  const selectedOption = choices.find((choice) => choice.id === selected);
  const choiceById = new Map(choices.map((choice) => [choice.id, choice]));
  const orderedVoteProgressRows = voteProgressRows
    ? [...voteProgressRows].sort((left, right) =>
        left.name.localeCompare(right.name, 'en-GB', { sensitivity: 'base' }),
      )
    : null;

  return (
    <>
      <div
        className={`mt-3 grid ${orderedVoteProgressRows ? 'gap-1' : 'gap-2'}`}
        data-testid="private-choice-list"
      >
        {orderedVoteProgressRows
          ? orderedVoteProgressRows.map((row) => {
              const choice = choiceById.get(row.id);
              const status = row.hasVoted
                ? en.game.voteVoted
                : en.game.voteWaiting;
              const statusId = `vote-status-${row.id}`;

              if (!choice) {
                if (row.id === viewerSeatId) {
                  return (
                    <p
                      key={row.id}
                      className="flex items-center gap-2 text-sm text-ash"
                      data-testid="vote-self-status"
                    >
                      <span>{row.name}</span>
                      <span aria-hidden="true">·</span>
                      <span data-testid={statusId}>{status}</span>
                    </p>
                  );
                }
                return (
                  <div
                    key={row.id}
                    className="vote-status-row flex min-h-10 items-center justify-between gap-3 border border-stone px-3 py-2 text-candle"
                    data-testid={
                      row.id === viewerSeatId
                        ? 'vote-self-status'
                        : `vote-progress-row-${row.id}`
                    }
                  >
                    <span>{row.name}</span>
                    <span
                      className="ml-auto shrink-0 text-sm text-ash"
                      data-testid={statusId}
                    >
                      {status}
                    </span>
                  </div>
                );
              }

              return (
                <button
                  key={choice.id}
                  type="button"
                  className="choice-action justify-between gap-3"
                  aria-label={choice.name}
                  aria-describedby={statusId}
                  aria-pressed={selected === choice.id}
                  onClick={() => onSelect(choice.id)}
                >
                  <span>{choice.name}</span>
                  <span
                    id={statusId}
                    className="ml-auto shrink-0 text-sm text-ash"
                    data-testid={statusId}
                  >
                    {status}
                  </span>
                </button>
              );
            })
          : choices.map((choice) => (
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
      {selectedOption && (
        <p
          className="mt-3 text-candle"
          data-testid="selected-choice"
          aria-live="polite"
        >
          {en.game.yourPick(selectedOption.name)}
        </p>
      )}
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
