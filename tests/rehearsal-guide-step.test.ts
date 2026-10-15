import { describe, expect, it } from 'vitest';
import {
  rehearsalGuideStepKey,
  shouldShowRehearsalGuide,
} from '../artifacts/party-game/src/rehearsal-guide-step';

describe('rehearsal guide step identity', () => {
  it('treats a public re-vote as a new occurrence of the vote step', () => {
    const initialVote = rehearsalGuideStepKey({
      phase: 'VOTE',
      cycle: 1,
      deadline: null,
      shadowRound: 0,
      notesOpen: false,
      revote: false,
    });
    const tiedReVote = rehearsalGuideStepKey({
      phase: 'VOTE',
      cycle: 1,
      deadline: null,
      shadowRound: 0,
      notesOpen: false,
      revote: true,
    });

    expect(tiedReVote).not.toBe(initialVote);
    expect(
      shouldShowRehearsalGuide({
        rehearsal: true,
        started: true,
        explanationAvailable: true,
        stepKey: tiedReVote,
        dismissedStepKey: initialVote,
      }),
    ).toBe(true);
  });
});

describe('rehearsal guide visibility', () => {
  it('shows a new phase guide after the previous phase was dismissed', () => {
    expect(
      shouldShowRehearsalGuide({
        rehearsal: true,
        started: true,
        explanationAvailable: true,
        stepKey: 'DEBATE:1',
        dismissedStepKey: 'DEBATE:1',
      }),
    ).toBe(false);

    expect(
      shouldShowRehearsalGuide({
        rehearsal: true,
        started: true,
        explanationAvailable: true,
        stepKey: 'VOTE:1',
        dismissedStepKey: 'DEBATE:1',
      }),
    ).toBe(true);
  });

  it('shows the start card before any phase guide and hides guides in real games', () => {
    expect(
      shouldShowRehearsalGuide({
        rehearsal: true,
        started: false,
        explanationAvailable: false,
        stepKey: 'LOBBY:0',
        dismissedStepKey: null,
      }),
    ).toBe(true);

    expect(
      shouldShowRehearsalGuide({
        rehearsal: false,
        started: true,
        explanationAvailable: true,
        stepKey: 'VOTE:1',
        dismissedStepKey: null,
      }),
    ).toBe(false);
  });
});
