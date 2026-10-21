import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  fitVoteCardNameFontSize,
  VotingCircleScreen,
} from './VotingCircleScreen';

const voteCardStyles = readFileSync(
  new URL('./VotingCircleScreen.css', import.meta.url),
  'utf8',
);

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
    expect(html).toContain(
      'Expand the card below to full screen and show it to the group when it is your turn.',
    );
    expect(html).toContain('Show your vote card full screen');
    expect(html).toMatch(
      /<button(?=[^>]*data-testid="vote-circle-card")(?=[^>]*aria-label="You voted for Lena\. Show your vote card full screen")/,
    );
    expect(html).not.toContain('button-open-vote-card');
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
    expect(html).not.toContain('Show your vote card full screen');
  });

  it('fits long and emoji names in portrait and landscape viewports', () => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      const shortName = fitVoteCardNameFontSize(
        'Mina',
        viewport.width,
        viewport.height,
      );
      const longName = fitVoteCardNameFontSize(
        'A very long practice player name 👩🏽‍🚀',
        viewport.width,
        viewport.height,
      );

      expect(shortName).toBeGreaterThan(longName);
      expect(longName).toBeGreaterThanOrEqual(16);
      expect(longName).toBeLessThanOrEqual(
        Math.min(viewport.width, viewport.height) * 0.2,
      );
    }
  });

  it('keeps the vote-card contrast tokens at 7:1 or higher in both themes', () => {
    const readToken = (name: string) =>
      voteCardStyles.match(
        new RegExp(`--${name}:\\s*(#[\\da-f]{6})`, 'i'),
      )?.[1];
    const luminance = (hex: string) => {
      const [red, green, blue] = hex
        .slice(1)
        .match(/.{2}/g)!
        .map((channel) => parseInt(channel, 16) / 255)
        .map((channel) =>
          channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4,
        );
      return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
    };
    const ratio = (foreground: string, background: string) => {
      const foregroundLuminance = luminance(foreground);
      const backgroundLuminance = luminance(background);
      return (
        (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
        (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
      );
    };

    for (const theme of ['light', 'dark']) {
      const foreground = readToken(`vote-card-${theme}-ink`);
      const background = readToken(`vote-card-${theme}-surface`);
      expect(foreground, `missing ${theme} foreground token`).toBeDefined();
      expect(background, `missing ${theme} background token`).toBeDefined();
      expect(ratio(foreground!, background!)).toBeGreaterThanOrEqual(7);
    }
  });
});
