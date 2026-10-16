import { en } from '@/locale/en-GB';

type VerdictSeat = {
  name: string;
  role?: 'traitor' | 'faithful' | null;
};

type VerdictAnnouncement =
  { kind: 'verdict'; seat: VerdictSeat } | { kind: 'no_votes'; cycle: number };

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
}: VerdictScreenProps) {
  const voteRows = showVoteReveal ? makeVoteRevealRows(ballots, seats) : [];

  return (
    <>
      {announcement?.kind === 'no_votes' && (
        <section
          className="mb-6 border-l-2 border-gilt pl-5"
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
          <ul className="divide-y divide-stone" data-testid="list-vote-reveal">
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
        </section>
      )}
    </>
  );
}
