import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { en } from '@/locale/en-GB';
import { DisplayPreferences } from './DisplayPreferences';

describe('DisplayPreferences', () => {
  const html = renderToStaticMarkup(
    <DisplayPreferences value="dark" onChange={() => undefined} />,
  );
  it('renders one fieldset with three shared tiles', () => {
    expect(html.match(/<fieldset/g)).toHaveLength(1);
    expect(html).toContain('game-display-settings');
    expect(html).toContain('data-testid="display-preferences"');
    expect(html).toContain(`<legend>${en.app.display}</legend>`);
    expect(html.match(/<button/g)).toHaveLength(3);
    for (const l of [en.app.matchPhone, en.app.light, en.app.dark]) {
      expect(html).toContain(l);
    }
    expect(html).not.toContain('checkbox');
  });
  it('marks only the chosen tile selected', () => {
    expect(html.match(/player-tile--selected/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('Selected');
    expect(html.match(/player-tile--available/g)).toHaveLength(2);
    expect(html).not.toMatch(/available</i);
    expect(html.match(/player-tile__status/g)).toHaveLength(1);
  });
  it('uses the shared tile class', () => {
    expect(html.match(/class="player-tile /g)).toHaveLength(3);
  });
});
