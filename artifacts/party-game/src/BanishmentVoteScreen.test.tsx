import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BanishmentVoteScreen } from './BanishmentVoteScreen';

const controls = {
  choices: [
    { id: 'seat-a', name: 'Alex' },
    { id: 'seat-b', name: 'Blair' },
  ],
  selected: '',
  confirmChoice: false,
  isPending: false,
  hasToken: true,
  commandMessage: '',
  onSelect: () => {},
  onReview: () => {},
  onConfirm: () => {},
  onChooseAgain: () => {},
};

describe('BanishmentVoteScreen', () => {
  it('explains the tied candidates on a re-vote', () => {
    const props = {
      ...controls,
      revote: true,
      tieCandidateNames: ['Blair', 'Alex'],
    };

    const html = renderToString(<BanishmentVoteScreen {...props} />);

    expect(html).toContain(
      'It&#x27;s a tie between Alex and Blair. Vote again, choosing between them.',
    );
  });

  it('does not show the tie explanation on an initial vote', () => {
    const html = renderToString(<BanishmentVoteScreen {...controls} />);

    expect(html).not.toContain("It's a tie between");
  });

  it('lists every candidate naturally for a multi-way tie', () => {
    const props = {
      ...controls,
      revote: true,
      tieCandidateNames: ['Casey', 'Alex', 'Blair'],
    };
    const html = renderToString(<BanishmentVoteScreen {...props} />);

    expect(html).toContain(
      'It&#x27;s a tie between Alex, Blair and Casey. Vote again, choosing between them.',
    );
  });
});
