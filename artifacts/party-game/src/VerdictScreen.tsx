import { en } from '@/locale/en-GB';

type VerdictSeat = {
  name: string;
  role?: 'traitor' | 'faithful' | null;
};

type VerdictAnnouncement =
  { kind: 'verdict'; seat: VerdictSeat } | { kind: 'no_votes'; cycle: number };

type VerdictScreenProps = {
  announcement: VerdictAnnouncement | null;
};

export function VerdictScreen({ announcement }: VerdictScreenProps) {
  return (
    <>
      {announcement?.kind === 'verdict' && (
        <section
          className="mb-6 border-l-2 border-gilt pl-5"
          aria-live="polite"
          aria-atomic="true"
          data-testid="shared-announcement"
        >
          <h1 className="display text-3xl text-candle">
            {en.game.banished(announcement.seat.name)}
          </h1>
          {announcement.seat.role && (
            <p className="mt-2 text-lg text-ash">
              {en.game.banishedRole(announcement.seat.role)}
            </p>
          )}
        </section>
      )}
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
    </>
  );
}
