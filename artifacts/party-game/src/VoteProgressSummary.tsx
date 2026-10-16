import { en } from '@/locale/en-GB';
import type { VoteProgressRow } from './PrivateChoiceControls';

type VoteProgressSummaryProps = {
  rows: VoteProgressRow[];
};

export function VoteProgressSummary({ rows }: VoteProgressSummaryProps) {
  const orderedRows = [...rows].sort((left, right) =>
    left.name.localeCompare(right.name, 'en-GB', { sensitivity: 'base' }),
  );

  return (
    <ul
      className="mt-5 grid gap-2"
      aria-label={en.game.voteProgressLabel}
      data-testid="vote-progress-list"
    >
      {orderedRows.map((row) => (
        <li
          key={row.id}
          className="flex min-h-12 items-center justify-between gap-3 border border-stone px-4 py-3 text-candle"
          data-testid={`vote-progress-row-${row.id}`}
        >
          <span>{row.name}</span>
          <span
            className="shrink-0 text-sm text-ash"
            data-testid={`vote-status-${row.id}`}
          >
            {row.hasVoted ? en.game.voteVoted : en.game.voteWaiting}
          </span>
        </li>
      ))}
    </ul>
  );
}
