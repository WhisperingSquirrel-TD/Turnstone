import { en } from '@/locale/en-GB';
import './VotingCircleScreen.css';

type VoteSeat = { id: string; name: string };

type VotingCircleScreenProps = {
  speakerSeatId: string | null;
  viewerSeatId: string | null;
  ownVoteTargetName: string | null;
  ballots: Record<string, string>;
  seats: VoteSeat[];
  onReveal: () => void;
  isPending: boolean;
};

export function VotingCircleScreen({
  speakerSeatId,
  viewerSeatId,
  ownVoteTargetName,
  ballots,
  seats,
  onReveal,
  isPending,
}: VotingCircleScreenProps) {
  const speaker = seats.find((seat) => seat.id === speakerSeatId);
  const viewerHasRevealed =
    viewerSeatId !== null && ballots[viewerSeatId] !== undefined;
  const isMyTurn = speakerSeatId !== null && speakerSeatId === viewerSeatId;
  const tally = new Map<string, { name: string; count: number }>();

  for (const targetId of Object.values(ballots)) {
    const target = seats.find((seat) => seat.id === targetId);
    if (!target) continue;
    const current = tally.get(target.id);
    tally.set(target.id, {
      name: target.name,
      count: (current?.count ?? 0) + 1,
    });
  }

  return (
    <section
      className="voting-circle mt-6"
      aria-labelledby="voting-circle-heading"
      data-testid="voting-circle"
    >
      <h2
        id="voting-circle-heading"
        className="display text-2xl text-candle sm:text-3xl"
      >
        {en.game.voteCircleHeading}
      </h2>
      <p className="mt-2 text-base text-ash">{en.game.voteCircleInstruction}</p>

      {ownVoteTargetName && (
        <div
          className="vote-circle-card border-2 border-gilt bg-stone text-candle"
          aria-label={en.game.voteCircleCardLabel}
          data-testid="vote-circle-card"
        >
          <span className="text-base">{en.game.voteCircleCardLabel}</span>
          <strong className="display">{ownVoteTargetName}</strong>
        </div>
      )}

      <p className="mt-4 text-base text-ash" role="status" aria-live="polite">
        {isMyTurn
          ? en.game.voteCircleYourTurn
          : speaker
            ? en.game.voteCircleWaitingFor(speaker.name)
            : en.game.voteCircleEveryoneDone}
      </p>

      {isMyTurn && !viewerHasRevealed && (
        <button
          className="primary-action mt-4 min-h-11 w-full"
          type="button"
          onClick={onReveal}
          disabled={isPending}
        >
          {en.game.voteCircleRevealButton}
        </button>
      )}

      <section className="mt-6" aria-label={en.game.voteCircleTally}>
        <h3 className="text-lg text-candle">{en.game.voteCircleTally}</h3>
        {tally.size ? (
          <ul className="mt-2 grid gap-2">
            {[...tally.values()]
              .sort((left, right) => left.name.localeCompare(right.name))
              .map(({ name, count }) => (
                <li
                  className="border-b border-stone py-2 text-base text-ash"
                  key={name}
                >
                  {en.game.voteTally(count, name)}
                </li>
              ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ash">
            {en.game.voteCircleNoVotesYet}
          </p>
        )}
      </section>
    </section>
  );
}
