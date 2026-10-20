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
      className="mb-6 border border-stone bg-black/10 p-4"
      data-testid="while-away-card"
    >
      <h2 id="while-away-heading" className="display text-xl">
        {title}
      </h2>
      {updates.length ? (
        <ul className="mt-2 space-y-2 text-sm text-ash">
          {updates.map((update, index) => (
            <li key={`${index}-${update}`}>{update}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ash">{noUpdates}</p>
      )}
      <button className="quiet-action mt-4" type="button" onClick={onDismiss}>
        {returnLabel}
      </button>
    </aside>
  );
}
