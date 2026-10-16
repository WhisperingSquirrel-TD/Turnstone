import { describe, expect, it } from 'vitest';
import { rehearsalGuideStepKey } from './rehearsal-guide-step';

describe('rehearsal guide step identity', () => {
  it('treats a same-phase re-vote as a new guide step', () => {
    const step = {
      phase: 'VOTE',
      cycle: 2,
      revote: false,
      shadowRound: 0,
      shadowSlot: 1,
      notesOpen: false,
    };

    expect(rehearsalGuideStepKey({ ...step, deadline: 20_000 })).not.toBe(
      rehearsalGuideStepKey({ ...step, deadline: 30_000 }),
    );
  });
});
