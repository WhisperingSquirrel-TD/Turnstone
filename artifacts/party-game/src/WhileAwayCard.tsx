type WhileAwayCardProps = {
  title: string;
  noUpdates: string;
  updates: string[];
  returnLabel: string;
  onDismiss: () => void;
};

export function WhileAwayCard({
  title,
  noUpdates,
  updates,
  returnLabel,
  onDismiss,
}: WhileAwayCardProps) {
  return (
    <aside
      aria-labelledby="while-away-heading"
      className="game-return-notice mb-4 border border-stone p-3"
      data-testid="while-away-card"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="while-away-heading" className="min-w-0 break-words text-base">
          {title}
        </h2>
        <button
          className="quiet-action min-h-[44px] shrink-0 px-3 py-1 text-sm"
          type="button"
          onClick={onDismiss}
        >
          {returnLabel}
        </button>
      </div>
      {updates.length ? (
        <ul className="space-y-1 break-words text-sm text-ash">
          {updates.map((update, index) => (
            <li key={`${index}-${update}`}>{update}</li>
          ))}
        </ul>
      ) : (
        <p className="break-words text-sm text-ash">{noUpdates}</p>
      )}
    </aside>
  );
}
