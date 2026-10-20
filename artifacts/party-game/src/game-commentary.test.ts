import { describe, expect, it } from 'vitest';
import {
  publicStepCommentary,
  type CommentaryContext,
} from './game-commentary';
import { en } from './locale/en-GB';

const base: CommentaryContext = {
  phase: 'DEBATE',
  cycle: 2,
  aliveCount: 6,
  publicLog: [],
  seats: [],
  winner: null,
};

describe('public game commentary', () => {
  it('explains the day from public state, without inventing a previous event', () => {
    expect(publicStepCommentary(base)).toBe(
      'Day 2. 6 players remain. Nobody has been banished yet.',
    );
  });
  it('uses the latest public event, not a private choice', () => {
    expect(
      publicStepCommentary({
        ...base,
        publicLog: [
          {
            seq: 1,
            at: 1,
            action: 'banishment',
            seat: { id: 'a', name: 'Alex' },
          },
          {
            seq: 2,
            at: 2,
            action: 'dawn',
            victims: [{ id: 's', name: 'Sam' }],
          },
        ],
      }),
    ).toBe('Day 2. 6 players remain. Sam was taken in the night.');
  });
  it('leads the verdict with the banishment and publicly revealed role', () => {
    expect(
      publicStepCommentary({
        ...base,
        phase: 'VERDICT',
        seats: [
          { id: 'a', name: 'Alex', status: 'banished', role: 'faithful' },
        ],
        publicLog: [
          {
            seq: 1,
            at: 1,
            action: 'banishment',
            seat: { id: 'a', name: 'Alex' },
          },
        ],
      }),
    ).toBe(
      'Alex has been banished. They were one of the Faithful. 6 players remain. Night falls next.',
    );
  });
  it('never invents or exposes an unrevealed verdict role', () => {
    expect(
      publicStepCommentary({
        ...base,
        phase: 'VERDICT',
        publicLog: [
          {
            seq: 1,
            at: 1,
            action: 'banishment',
            seat: { id: 'a', name: 'Alex' },
          },
        ],
      }),
    ).toBe('Alex has been banished. 6 players remain. Night falls next.');
  });
  it('leads an abstained verdict with the required no-votes line', () => {
    expect(
      publicStepCommentary({
        ...base,
        phase: 'VERDICT',
        publicLog: [{ seq: 1, at: 1, action: 'no_votes' }],
      }),
    ).toBe(
      'No votes were cast. Nobody is banished. 6 players remain. Night falls next.',
    );
  });
  it.each([
    ['VOTE', 'Vote for the player you think is a Traitor.'],
    [
      'SHADOW',
      'Night 2. Everyone answers privately at the same moment, so nobody can tell who is choosing.',
    ],
    ['DAWN', 'Morning. Nobody was taken in the night.'],
  ])('explains %s without role-specific information', (phase, expected) => {
    expect(publicStepCommentary({ ...base, phase })).toBe(expected);
  });
  it('announces the winning team', () => {
    expect(
      publicStepCommentary({ ...base, phase: 'FINISHED', winner: 'faithful' }),
    ).toBe('The Faithful win.');
  });
});

describe('step explainer copy', () => {
  it('has a step-name title for every explainer', () => {
    expect(Object.keys(en.game.guideTitles).sort()).toEqual(
      Object.keys(en.game.rehearsalGuide).sort(),
    );
    expect(en.game.guideTitles.vote).toBe('The vote');
    expect(en.game.guideTitles.night).toBe('Night');
  });
  it('keeps first-time rehearsal cards brief and distinct from the details', () => {
    expect(Object.keys(en.game.rehearsalGuideCards).sort()).toEqual(
      Object.keys(en.game.rehearsalGuide).sort(),
    );
    for (const [step, cardCopy] of Object.entries(
      en.game.rehearsalGuideCards,
    )) {
      expect(cardCopy.length, `${step} card copy`).toBeLessThanOrEqual(100);
      expect(cardCopy, `${step} card copy`).not.toBe(
        en.game.rehearsalGuide[step as keyof typeof en.game.rehearsalGuide],
      );
    }
  });
  it('keeps the notes detail focused on use, not repeated privacy wording', () => {
    expect(en.game.rehearsalGuide.notes).not.toContain(
      'Only you can see your notes.',
    );
    expect(en.game.notesPrivateIntro).toBe('Only you can see your notes.');
  });
  it('keeps the role reveal instruction concise on the screen', () => {
    expect(en.game.holdInstructions).toBe('Hold to reveal. Let go to hide.');
  });
  it('uses the correct Faithful grammar for winning and losing', () => {
    expect(en.game.playerOutcome('faithful', 'faithful')).toBe(
      'You won as one of the Faithful.',
    );
    expect(en.game.playerOutcome('traitor', 'faithful')).toBe(
      'The Traitors won. You were one of the Faithful.',
    );
  });
});
