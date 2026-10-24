import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { en } from './locale/en-GB';
import { GameStepAnnouncement } from './GameStepAnnouncement';

type AnnouncementInput = {
  aliveCount: number;
  endRule: 'unanimous' | 'majority';
  murderSlots: number;
  phase: string;
  shadowRound: number;
};

const base: AnnouncementInput = {
  aliveCount: 6,
  endRule: 'unanimous' as const,
  murderSlots: 1,
  phase: 'SHADOW',
  shadowRound: 1,
};

function announcement(props: Partial<AnnouncementInput>) {
  return renderToStaticMarkup(<GameStepAnnouncement {...base} {...props} />);
}

describe('GameStepAnnouncement', () => {
  it('gives role-neutral guidance during the sealed role reveal', () => {
    const html = announcement({ phase: 'DEAL' });

    expect(html).toContain('Look at your role in private, then hide it.');
    expect(html).not.toMatch(/\b(?:Traitor|Faithful)\b/);
  });

  it('puts the actual vote count in normal-size commentary before choices', () => {
    const html = renderToStaticMarkup(
      <GameStepAnnouncement
        {...base}
        phase="VOTE"
        progress={{ done: 4, total: 6 }}
      />,
    );
    expect(html).toContain('4 of 6 have voted');
    expect(html).toContain('game-commentary');
    expect(html).not.toContain('text-sm');
  });
  it('explains a double-murder night before its first choice', () => {
    const html = renderToStaticMarkup(
      <>
        <GameStepAnnouncement {...base} murderSlots={2} />
        <button data-testid="choice-start" type="button">
          First choice
        </button>
      </>,
    );

    expect(html).toContain(
      'Tonight the Traitors take two players, so everyone answers two questions.',
    );
    expect(html.indexOf('data-testid="game-context-line"')).toBeLessThan(
      html.indexOf('data-testid="choice-start"'),
    );
  });

  it('explains the unanimous re-choice without identifying disagreement', () => {
    const html = announcement({ shadowRound: 2 });

    expect(html).toContain(
      'No decision yet. One more round of choosing tonight.',
    );
    expect(html).not.toMatch(/disagree|who disagreed/i);
  });

  it('explains the endgame stakes using the configured end rule', () => {
    const unanimous = announcement({ phase: 'FINAL_VOTE' });
    const majority = announcement({
      endRule: 'majority',
      phase: 'FINAL_VOTE',
      aliveCount: 5,
    });

    expect(unanimous).toContain(
      '6 players remain. If everyone chooses End the game, it ends now: the Faithful win if no Traitor is left, otherwise the Traitors win. If anyone chooses Continue, you vote to banish one more.',
    );
    expect(majority).toContain(
      '5 players remain. If a majority chooses End the game, it ends now: the Faithful win if no Traitor is left, otherwise the Traitors win. Otherwise, you vote to banish one more.',
    );
  });

  it('explains why the next banishment vote follows a continue decision', () => {
    expect(announcement({ phase: 'FINAL_BANISH' })).toContain(
      'Not everyone chose to end the game, so one more player will be banished. Vote now.',
    );
  });

  it('uses first/final pick labels rather than round numbers', () => {
    expect(en.game.murderSlotPick('Alex', 'Blair', 1)).toBe(
      'Alex · First pick: Blair',
    );
    expect(en.game.murderSlotPick('Alex', 'Blair', 2)).toBe(
      'Alex · Final pick: Blair',
    );
    expect(announcement({ murderSlots: 2 })).not.toMatch(/round [12]/i);
  });
});
