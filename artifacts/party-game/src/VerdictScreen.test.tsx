import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VerdictScreen } from './VerdictScreen';

describe('VerdictScreen public wording', () => {
  it.each([
    ['traitor', 'Jordan has been banished. They were Traitor.'],
    ['faithful', 'Jordan has been banished. They were Faithful.'],
  ] as const)(
    'announces a banished %s by name and public role',
    (role, text) => {
      const markup = renderToStaticMarkup(
        <VerdictScreen
          announcement={{
            kind: 'verdict',
            seat: { name: 'Jordan', role },
          }}
        />,
      );

      expect(markup).toContain(text);
    },
  );

  it('says nobody was banished when no votes were cast', () => {
    const markup = renderToStaticMarkup(
      <VerdictScreen announcement={{ kind: 'no_votes', cycle: 2 }} />,
    );

    expect(markup).toContain('No votes were cast. Nobody is banished.');
    expect(markup).not.toContain('Traitor');
    expect(markup).not.toContain('Faithful');
  });
});
