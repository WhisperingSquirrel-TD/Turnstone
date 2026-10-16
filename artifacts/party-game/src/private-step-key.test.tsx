import { describe, expect, it } from 'vitest';
import {
  privateStepKeyFor,
  shouldPreserveShadowChoice,
} from './private-step-key';

const shadowStep = {
  phase: 'SHADOW',
  cycle: 3,
  deadline: 0,
  shadowSlot: 1,
  shadowRound: 1,
  notesOpen: false,
};

describe('privateStepKeyFor', () => {
  it('keeps a unanimous re-choice inside the same night step', () => {
    expect(privateStepKeyFor({ ...shadowStep, shadowRound: 2 })).toBe(
      privateStepKeyFor(shadowStep),
    );
  });

  it('starts a distinct choice state for the second murder slot', () => {
    expect(privateStepKeyFor({ ...shadowStep, shadowSlot: 2 })).not.toBe(
      privateStepKeyFor(shadowStep),
    );
  });

  it('preserves the submitted pick only for a same-slot unanimous re-choice', () => {
    const previous = { gameId: 'game-a', cycle: 3, slot: 1, round: 1 };
    expect(
      shouldPreserveShadowChoice(previous, { ...previous, round: 2 }),
    ).toBe(true);
    expect(
      shouldPreserveShadowChoice(previous, { ...previous, slot: 2, round: 2 }),
    ).toBe(false);
    expect(
      shouldPreserveShadowChoice(previous, {
        ...previous,
        cycle: 4,
        round: 2,
      }),
    ).toBe(false);
  });
});
