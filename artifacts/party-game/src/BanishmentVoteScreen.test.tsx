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

  it('keeps only tied candidates selectable and dims the rest of the re-vote list', () => {
    const props = {
      ...controls,
      choices: [
        { id: 'seat-a', name: 'Alex' },
        { id: 'seat-b', name: 'Blair' },
        { id: 'seat-c', name: 'Casey' },
      ],
      voteProgressRows: [
        { id: 'seat-a', name: 'Alex', hasVoted: false },
        { id: 'seat-b', name: 'Blair', hasVoted: false },
        { id: 'seat-c', name: 'Casey', hasVoted: false },
        { id: 'viewer', name: 'Morgan', hasVoted: false },
      ],
      viewerSeatId: 'viewer',
      revote: true,
      tieCandidateIds: ['seat-a', 'seat-b'],
      tieCandidateNames: ['Alex', 'Blair'],
    };

    const html = renderToString(<BanishmentVoteScreen {...props} />);

    expect(html).toMatch(
      /<button(?=[^>]*data-choice-id="seat-a")(?!(?:[^>]*disabled=""))[^>]*>/,
    );
    expect(html).toMatch(
      /<button(?=[^>]*data-choice-id="seat-b")(?!(?:[^>]*disabled=""))[^>]*>/,
    );
    expect(html).toMatch(
      /<button(?=[^>]*data-choice-id="seat-c")(?=[^>]*disabled="")(?=[^>]*choice-action--unavailable)[^>]*>/,
    );
    expect(html).toContain(
      'It&#x27;s a tie between Alex and Blair. Vote again, choosing between them.',
    );
  });
});
