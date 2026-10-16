import { describe, expect, it } from 'vitest';
import { Phase as ApiPhase } from '../lib/api-client-react/src/generated/api.schemas';
import { gameViewResponseSchema } from '../lib/shared/src/contracts';

describe('shared phase contract', () => {
  it('accepts both explicit endgame phases', () => {
    for (const phase of ['FINAL_VOTE', 'FINAL_BANISH']) {
      expect(
        gameViewResponseSchema.safeParse({
          serverNow: 1_800_000_000_000,
          version: 1,
          view: { exists: true, phase, lobbyOpen: false, seatCount: 5 },
        }).success,
      ).toBe(true);
      expect(Object.values(ApiPhase)).toContain(phase);
    }
  });

  it('requires a server timestamp on every view response', () => {
    const response = {
      serverNow: 1_800_000_000_000,
      version: 1,
      view: {
        exists: true as const,
        phase: 'DRAFT' as const,
        lobbyOpen: false,
        seatCount: 5,
      },
    };
    expect(gameViewResponseSchema.safeParse(response).success).toBe(true);
    expect(
      gameViewResponseSchema.safeParse({
        version: response.version,
        view: response.view,
      }).success,
    ).toBe(false);
  });
});
