import { describe, expect, it } from 'vitest';
import { entryFailureMessages } from '../lib/shared/src/entry-failure-messages';
import { apiErrorResponseSchema } from '../lib/shared/src/contracts';

describe('entry API error responses', () => {
  it('accepts every actionable entry message within the bounded error field', () => {
    for (const error of Object.values(entryFailureMessages)) {
      expect(() => apiErrorResponseSchema.parse({ error })).not.toThrow();
    }
  });
});
