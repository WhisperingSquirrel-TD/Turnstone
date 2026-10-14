import { describe, expect, it } from 'vitest';
import { Phase as ApiPhase } from '../lib/api-client-react/src/generated/api.schemas';
import { gameViewResponseSchema } from '../lib/shared/src/contracts';

describe('shared phase contract', () => {
  it('accepts both explicit endgame phases', () => {
    for (const phase of ['FINAL_VOTE', 'FINAL_BANISH']) {
      expect(
        gameViewResponseSchema.safeParse({
          version: 1,
          view: { exists: true, phase, lobbyOpen: false, seatCount: 5 },
        }).success,
      ).toBe(true);
      expect(Object.values(ApiPhase)).toContain(phase);
    }
  });
});
