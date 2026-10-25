import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WhileAwayCard } from './WhileAwayCard';

const render = (updates: string[]) =>
  renderToStaticMarkup(
    <WhileAwayCard
      title="While you were away"
      noUpdates="Nothing changed."
      updates={updates}
      returnLabel="Back to the game"
      onDismiss={() => undefined}
    />,
  );

describe('WhileAwayCard', () => {
  it('renders a compact notice with heading and dismiss in one row', () => {
    const html = render(['A long public update that must wrap fully.']);

    expect(html).toContain('data-testid="while-away-card"');
    expect(html).toContain('aria-labelledby="while-away-heading"');
    expect(html).toContain('While you were away');
    expect(html).toContain('Back to the game');
    expect(html).toContain('p-3');
    expect(html).not.toContain('p-4');
    expect(html).toContain('flex items-start justify-between');
    expect(html).toContain('text-base');
    expect(html).not.toContain('text-xl');
    expect(html).toContain('min-h-[44px]');
  });

  it('keeps every public update, wrapping and untruncated', () => {
    const html = render(['First update.', 'Second update.']);

    expect(html.match(/<li\b/g)).toHaveLength(2);
    expect(html).toContain('First update.');
    expect(html).toContain('Second update.');
    expect(html).toContain('break-words');
    expect(html).not.toMatch(/truncate|line-clamp|overflow-hidden|sr-only/);
  });

  it('shows the empty copy when there are no updates', () => {
    const html = render([]);

    expect(html).toContain('Nothing changed.');
    expect(html).not.toContain('<li');
  });
});
