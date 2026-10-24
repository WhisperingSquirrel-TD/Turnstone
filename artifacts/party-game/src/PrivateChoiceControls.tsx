import { en } from '@/locale/en-GB';
import { PendingCommandNotice } from './PendingCommandNotice';
import { PlayerTile } from './GameChrome';

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
  choiceSelectionLocked?: boolean;
  choiceSubmitted?: boolean;
  isPending: boolean;
  waitingToSend?: boolean;
  retryAfterUntil?: number | null;
  onResend?: () => void;
  hasToken: boolean;
  commandMessage: string;
  onSelect: (choiceId: string) => void;
  onReview: () => void;
  onConfirm: () => void;
  onChooseAgain: () => void;
  voteProgressRows?: VoteProgressRow[];
  viewerSeatId?: string;
  disabledChoiceIds?: string[];
};

export function PrivateChoiceControls({
  choices,
  selected,
  confirmChoice,
  choiceSelectionLocked = false,
  choiceSubmitted = false,
  isPending,
  waitingToSend = false,
  retryAfterUntil = null,
  onResend,
  hasToken,
  commandMessage,
  onSelect,
  onReview,
  onConfirm,
  onChooseAgain,
  voteProgressRows,
  viewerSeatId,
  disabledChoiceIds = [],
}: PrivateChoiceControlsProps) {
  const selectedOption = choices.find((choice) => choice.id === selected);
  const choiceById = new Map(choices.map((choice) => [choice.id, choice]));
  const disabledChoiceIdSet = new Set(disabledChoiceIds);
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
              const isViewer = row.id === viewerSeatId;

              if (!choice) {
                return (
                  <PlayerTile
                    key={row.id}
                    name={row.name}
                    statusText={isViewer ? en.game.voteYou : undefined}
                    testId={
                      isViewer
                        ? 'vote-self-status'
                        : `vote-progress-row-${row.id}`
                    }
                  />
                );
              }

              return (
                <PlayerTile
                  key={choice.id}
                  name={choice.name}
                  state={selected === choice.id ? 'selected' : 'available'}
                  dataChoiceId={choice.id}
                  disabled={
                    choiceSelectionLocked || disabledChoiceIdSet.has(choice.id)
                  }
                  ariaLabel={choice.name}
                  onSelect={() => onSelect(choice.id)}
                />
              );
            })
          : choices.map((choice) => (
              <PlayerTile
                key={choice.id}
                name={choice.name}
                state={
                  disabledChoiceIdSet.has(choice.id)
                    ? 'disabled'
                    : selected === choice.id
                      ? 'selected'
                      : 'available'
                }
                dataChoiceId={choice.id}
                disabled={
                  choiceSelectionLocked || disabledChoiceIdSet.has(choice.id)
                }
                onSelect={() => onSelect(choice.id)}
              />
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
      {selected && !confirmChoice && !choiceSubmitted && (
        <div className="game-action-dock" data-testid="game-action-dock">
          <button
            className="primary-action w-full"
            type="button"
            onClick={onReview}
          >
            {en.game.reviewChoice}
          </button>
        </div>
      )}
      {selected && confirmChoice && !choiceSubmitted && (
        <div className="game-action-dock" data-testid="game-action-dock">
          <div className="mx-auto w-full max-w-[480px]">
            <p className="mb-1 text-candle">{en.game.confirmChoice}</p>
            {waitingToSend && onResend ? (
              <PendingCommandNotice
                disabled={isPending}
                retryAfterUntil={retryAfterUntil}
                onResend={onResend}
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="primary-action flex-1"
                  disabled={isPending || !hasToken}
                  onClick={onConfirm}
                >
                  {isPending
                    ? en.game.recording
                    : choiceSelectionLocked
                      ? en.game.retryChoice
                      : en.game.confirm}
                </button>
                {!choiceSelectionLocked && (
                  <button
                    type="button"
                    className="quiet-action flex-1"
                    onClick={onChooseAgain}
                  >
                    {en.game.chooseAgain}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {!selected && !choiceSubmitted && (
        <div className="game-action-dock" data-testid="game-action-dock">
          <button className="primary-action w-full" type="button" disabled>
            {choices.length ? en.game.choosePlayer : en.game.noChoiceAvailable}
          </button>
        </div>
      )}
      {commandMessage && !waitingToSend && (
        <p role="status" className="mt-4 text-sm text-ash">
          {commandMessage}
        </p>
      )}
    </>
  );
}
