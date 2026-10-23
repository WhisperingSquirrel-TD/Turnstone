import { describe, expect, it } from 'vitest';
import { gameplayCommandRateLimits } from './gameplay-command-limits';

describe('gameplay command rate limits', () => {
  it.each([
    [6, 120, 30],
    [15, 120, 30],
    [40, 320, 80],
    [60, 400, 100],
  ])(
    'derives the shared and per-seat budgets for %i stored seats',
    (seatCount, sharedIpPerMinute, perSeatAggregatePerMinute) => {
      const limits = gameplayCommandRateLimits(seatCount);

      expect(limits.sharedIpPerMinute).toBe(sharedIpPerMinute);
      expect(limits.perSeatAggregatePerMinute).toBe(perSeatAggregatePerMinute);
      expect(limits.perSeatCommandPerMinute).toBe(60);
      expect(3 * limits.perSeatAggregatePerMinute).toBeLessThan(
        limits.sharedIpPerMinute,
      );
      expect(4 * limits.perSeatAggregatePerMinute).toBeLessThanOrEqual(
        limits.sharedIpPerMinute,
      );
    },
  );
});
