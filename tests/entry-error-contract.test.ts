import { describe, expect, it } from 'vitest';
import { entryFailureMessages } from '../lib/shared/src/entry-failure-messages';
import { apiErrorResponseSchema } from '../lib/shared/src/contracts';

describe('entry API error responses', () => {
  it('accepts every actionable entry message within the bounded error field', () => {
    for (const error of Object.values(entryFailureMessages)) {
      expect(() => apiErrorResponseSchema.parse({ error })).not.toThrow();
    }
  });

  it('gives every entry failure a specific reason and a next step', () => {
    for (const error of Object.values(entryFailureMessages)) {
      expect(error).not.toMatch(
        /^(?:join|recovery) could not be completed\.?$/i,
      );
      expect(error).toMatch(
        /\b(check|try|wait|ask|reload|choose|start again|return)\b/i,
      );
    }
  });
});
