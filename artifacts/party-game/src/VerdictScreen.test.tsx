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

  // Owner phone screenshot (27 October 2026): the revealed votes sat under
  // "Tally so far" with no visible heading, reading as an orphan list.
  it('gives the revealed votes a visible heading', () => {
    const markup = renderToStaticMarkup(
      <VerdictScreen
        announcement={null}
        ballots={{ a: 'b' }}
        seats={[
          { id: 'a', name: 'Alex' } as never,
          { id: 'b', name: 'Sam' } as never,
        ]}
        showVoteReveal
      />,
    );

    expect(markup).toMatch(/<h3[^>]*>Votes revealed<\/h3>/);
    expect(markup).toContain('Alex voted to banish Sam.');
  });

  it('says a random pick beside, never inside, the shared announcement (D120)', () => {
    const markup = renderToStaticMarkup(
      <VerdictScreen
        announcement={{
          kind: 'verdict',
          seat: { name: 'Jordan', role: 'traitor' },
          chosenAtRandom: true,
        }}
      />,
    );
    const shared = markup.match(
      /<section[^>]*data-testid="shared-announcement"[^>]*>([\s\S]*?)<\/section>/,
    );
    expect(shared?.[1]?.replace(/<[^>]+>/g, '')).toBe(
      'Jordan has been banished. They were Traitor.',
    );
    expect(markup).toContain(
      'It was a draw again, so the app chose at random.',
    );
  });
});
