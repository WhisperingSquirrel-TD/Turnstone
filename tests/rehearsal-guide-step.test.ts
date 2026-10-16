import { describe, expect, it } from 'vitest';
import {
  rehearsalGuideStepKey,
  shouldShowRehearsalGuide,
} from '../artifacts/party-game/src/rehearsal-guide-step';

describe('rehearsal guide step identity', () => {
  it('uses the same guide for a re-vote within the vote step', () => {
    const initialVote = rehearsalGuideStepKey({
      phase: 'VOTE',
      cycle: 1,
      deadline: null,
      shadowRound: 0,
      shadowSlot: 0,
      notesOpen: false,
      revote: false,
    });
    const tiedReVote = rehearsalGuideStepKey({
      phase: 'VOTE',
      cycle: 1,
      deadline: null,
      shadowRound: 0,
      shadowSlot: 0,
      notesOpen: false,
      revote: true,
    });

    expect(tiedReVote).toBe(initialVote);
    expect(
      shouldShowRehearsalGuide({
        rehearsal: true,
        started: true,
        explanationAvailable: true,
        stepKey: tiedReVote,
        dismissedStepKeys: new Set([initialVote]),
      }),
    ).toBe(false);
  });

  it('uses one night guide across slots, rounds, and cycles', () => {
    const firstChoice = rehearsalGuideStepKey({
      phase: 'SHADOW',
      cycle: 1,
      deadline: null,
      revote: false,
      shadowRound: 1,
      shadowSlot: 1,
      notesOpen: false,
    });
    const secondChoice = rehearsalGuideStepKey({
      phase: 'SHADOW',
      cycle: 1,
      deadline: 30_000,
      revote: false,
      shadowRound: 2,
      shadowSlot: 2,
      notesOpen: false,
    });
    const laterNight = rehearsalGuideStepKey({
      phase: 'SHADOW',
      cycle: 2,
      deadline: 60_000,
      revote: false,
      shadowRound: 1,
      shadowSlot: 1,
      notesOpen: false,
    });

    expect(secondChoice).toBe(firstChoice);
    expect(laterNight).toBe(firstChoice);
    expect(
      shouldShowRehearsalGuide({
        rehearsal: true,
        started: true,
        explanationAvailable: true,
        stepKey: laterNight,
        dismissedStepKeys: new Set([firstChoice]),
      }),
    ).toBe(false);
  });
});

describe('rehearsal guide visibility', () => {
  it('shows a new phase guide after the previous phase was dismissed', () => {
    expect(
      shouldShowRehearsalGuide({
        rehearsal: true,
        started: true,
        explanationAvailable: true,
        stepKey: 'DEBATE',
        dismissedStepKeys: new Set(['DEBATE']),
      }),
    ).toBe(false);

    expect(
      shouldShowRehearsalGuide({
        rehearsal: true,
        started: true,
        explanationAvailable: true,
        stepKey: 'VOTE',
        dismissedStepKeys: new Set(['DEBATE']),
      }),
    ).toBe(true);

    expect(
      shouldShowRehearsalGuide({
        rehearsal: true,
        started: true,
        explanationAvailable: true,
        stepKey: 'DEBATE',
        dismissedStepKeys: new Set(['DEBATE', 'VOTE']),
      }),
    ).toBe(false);
  });

  it('shows the start card before any phase guide and hides guides in real games', () => {
    expect(
      shouldShowRehearsalGuide({
        rehearsal: true,
        started: false,
        explanationAvailable: false,
        stepKey: 'start',
        dismissedStepKeys: new Set(),
      }),
    ).toBe(true);

    expect(
      shouldShowRehearsalGuide({
        rehearsal: false,
        started: true,
        explanationAvailable: true,
        stepKey: 'VOTE',
        dismissedStepKeys: new Set(),
      }),
    ).toBe(false);
  });
});
