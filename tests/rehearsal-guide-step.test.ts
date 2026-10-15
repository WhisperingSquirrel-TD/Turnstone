import { describe, expect, it } from 'vitest';
import { shouldShowRehearsalGuide } from '../artifacts/party-game/src/rehearsal-guide-step';

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
