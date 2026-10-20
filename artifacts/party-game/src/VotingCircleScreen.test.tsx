import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { VotingCircleScreen } from './VotingCircleScreen';

const seats = [
  { id: 'seat-speaker', name: 'Rory' },
  { id: 'seat-viewer', name: 'Mina' },
  { id: 'seat-target', name: 'Lena' },
];

describe('VotingCircleScreen', () => {
  it('shows the player’s own vote card and reveal action only on their turn', () => {
    const html = renderToStaticMarkup(
      <VotingCircleScreen
        speakerSeatId="seat-speaker"
        viewerSeatId="seat-speaker"
        ownVoteTargetName="Lena"
        ballots={{}}
        seats={seats}
        onReveal={vi.fn()}
        isPending={false}
      />,
    );

    expect(html).toContain('You voted for');
    expect(html).toContain('Lena');
    expect(html).toContain('I’ve said who I voted for and why');
    expect(html).toContain('It’s your turn.');
  });

  it('shows the growing tally while other players wait without a reveal action', () => {
    const html = renderToStaticMarkup(
      <VotingCircleScreen
        speakerSeatId="seat-viewer"
        viewerSeatId="seat-speaker"
        ownVoteTargetName="Lena"
        ballots={{ 'seat-speaker': 'seat-target' }}
        seats={seats}
        onReveal={vi.fn()}
        isPending={false}
      />,
    );

    expect(html).toContain('1 vote for Lena.');
    expect(html).toContain('Mina');
    expect(html).not.toContain('<button');
  });
});
