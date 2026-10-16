import { describe, expect, it } from 'vitest';
import { requiresPrivacyShield } from './privacy-shield-policy';

describe('privacy shield policy', () => {
  it.each([
    ['DEAL', false, true],
    ['SHADOW', false, true],
    ['VOTE', false, false],
    ['FINAL_VOTE', false, false],
    ['FINAL_BANISH', false, false],
    ['DEBATE', true, false],
  ])(
    'requires a shield only for role reveal and night choices (%s)',
    (phase, notesOpen, expected) => {
      expect(requiresPrivacyShield(phase, notesOpen)).toBe(expected);
    },
  );
});
