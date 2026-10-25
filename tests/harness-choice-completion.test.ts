import { describe, expect, it } from 'vitest';
import { choiceCompletionScope } from '../e2e/support/choice-completion';

describe('night choice completion scope', () => {
  it('distinguishes a new night round and slot without using versions or private data', () => {
    const first = choiceCompletionScope({
      phase: 'SHADOW',
      round: '1',
      slot: '1',
    });
    expect(first).not.toBe(
      choiceCompletionScope({ phase: 'SHADOW', round: '2', slot: '1' }),
    );
    expect(first).not.toBe(
      choiceCompletionScope({ phase: 'SHADOW', round: '1', slot: '2' }),
    );
    expect(first).not.toContain('version');
  });
  it('preserves the existing non-night scope', () => {
    expect(
      choiceCompletionScope({ phase: 'VOTE', round: '0', slot: '0' }),
    ).toBe('body');
  });
});
