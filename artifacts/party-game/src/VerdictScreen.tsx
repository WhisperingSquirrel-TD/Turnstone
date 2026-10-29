import { en } from '@/locale/en-GB';

type VerdictSeat = {
  name: string;
  role?: 'traitor' | 'faithful' | null;
};

type VerdictAnnouncement =
  | { kind: 'verdict'; seat: VerdictSeat; chosenAtRandom?: true }
  | { kind: 'no_votes'; cycle: number };

type VoteSeat = {
  id: string;
  name: string;
};

type VerdictScreenProps = {
  announcement: VerdictAnnouncement | null;
  ballots?: Record<string, string>;
  seats?: VoteSeat[];
  showVoteReveal?: boolean;
  animateReveal?: boolean;
  aliveCount?: number;
  coachingTip?: string;
};

type VoteRevealRow = {
  id: string;
  text: string;
  anonymous: boolean;
};

function makeVoteRevealRows(
  ballots: Record<string, string>,
  seats: VoteSeat[],
): VoteRevealRow[] {
  const rows: VoteRevealRow[] = [];
  const ballotIds = Object.keys(ballots);

  if (ballotIds.every((id) => id.startsWith('anonymous-vote-'))) {
    for (const targetId of new Set(Object.values(ballots))) {
      const target = seats.find((seat) => seat.id === targetId);
      if (!target) continue;
      const count = Object.values(ballots).filter(
        (id) => id === targetId,
      ).length;
      rows.push({
        id: targetId,
        text: en.game.voteTally(count, target.name),
        anonymous: true,
      });
    }
    return rows;
  }

  for (const [voterId, targetId] of Object.entries(ballots)) {
    const voter = seats.find((seat) => seat.id === voterId);
    const target = seats.find((seat) => seat.id === targetId);
    if (!voter || !target) continue;
    rows.push({
      id: voterId,
      text: en.game.voteReveal(voter.name, target.name),
      anonymous: false,
    });
  }
  return rows;
}

export function VerdictScreen({
  announcement,
  ballots = {},
  seats = [],
  showVoteReveal = false,
  animateReveal = false,
  aliveCount,
  coachingTip,
}: VerdictScreenProps) {
  const voteRows = showVoteReveal ? makeVoteRevealRows(ballots, seats) : [];

  return (
    <>
      {announcement?.kind === 'no_votes' && (
        <section
          className="mt-2 mb-6 border-l-2 border-gilt pl-5"
          aria-live="polite"
          aria-atomic="true"
          data-testid="shared-announcement"
        >
          <h1 className="display text-3xl text-candle">
            {en.game.noVotesAnnouncement}
          </h1>
        </section>
      )}
      {voteRows.length > 0 && (
        <section className="mt-6" aria-label={en.game.voteResults}>
          <h3 className="text-lg text-candle">{en.game.voteResults}</h3>
          <ul
            className="mt-2 divide-y divide-stone"
            data-testid="list-vote-reveal"
          >
            {voteRows.map((row, index) => (
              <li
                key={row.id}
                className={
                  animateReveal
                    ? 'vote-reveal-item py-3 text-ash'
                    : 'py-3 text-ash'
                }
                data-testid={
                  row.anonymous ? 'anonymous-ballot-tally' : undefined
                }
                data-vote-reveal-index={index}
              >
                {row.text}
              </li>
            ))}
          </ul>
        </section>
      )}
      {announcement?.kind === 'verdict' && (
        <section
          className={
            animateReveal
              ? 'verdict-result mt-6 mb-6 border-l-2 border-gilt pl-5'
              : 'mt-6 mb-6 border-l-2 border-gilt pl-5'
          }
          aria-live="polite"
          aria-atomic="true"
          data-testid="shared-announcement"
        >
          <h1 className="display text-3xl text-candle">
            {en.game.banishedResult(
              announcement.seat.name,
              announcement.seat.role,
            )}
          </h1>
          {announcement.chosenAtRandom && (
            <p className="mt-2 text-base text-ash" data-testid="verdict-random">
              {en.game.verdictChosenAtRandom}
            </p>
          )}
        </section>
      )}
      {announcement && aliveCount !== undefined && (
        <div className={animateReveal ? 'verdict-result mt-3' : 'mt-3'}>
          <p className="text-base text-ash" data-testid="verdict-commentary">
            {en.game.commentary.afterVerdict(aliveCount)}
          </p>
          {coachingTip && (
            <p
              className="mt-1 text-sm text-ash"
              data-testid="rehearsal-coaching"
            >
              {coachingTip}
            </p>
          )}
        </div>
      )}
    </>
  );
}
