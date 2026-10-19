import { describe, expect, it } from 'vitest';
import {
  coordinatorTakeoverPath,
  isCoordinatorUnavailableForAction,
  livingSeatMajorityReached,
} from '../artifacts/api-server/src/coordinator-takeover-policy';

describe('coordinator takeover policy', () => {
  it('requires an action and two full minutes without coordinator activity', () => {
    expect(
      isCoordinatorUnavailableForAction({
        now: 180_000,
        lastSeenAt: 60_001,
        actionNeeded: true,
      }),
    ).toBe(false);
    expect(
      isCoordinatorUnavailableForAction({
        now: 180_000,
        lastSeenAt: 60_000,
        actionNeeded: false,
      }),
    ).toBe(false);
    expect(
      isCoordinatorUnavailableForAction({
        now: 180_000,
        lastSeenAt: 60_000,
        actionNeeded: true,
      }),
    ).toBe(true);
  });

  it('prompts the designated co-coordinator before opening majority takeover', () => {
    expect(coordinatorTakeoverPath([])).toBe('majority');
    expect(coordinatorTakeoverPath(['seat-1'])).toBe('co-coordinator');
    expect(coordinatorTakeoverPath(['seat-1', 'seat-2'])).toBe(
      'co-coordinator',
    );
  });

  it('requires a strict majority of living seats, counting each seat once', () => {
    const livingSeats = ['a', 'b', 'c', 'd', 'e'];
    expect(livingSeatMajorityReached(livingSeats, ['a', 'b'])).toBe(false);
    expect(livingSeatMajorityReached(livingSeats, ['a', 'b', 'c'])).toBe(true);
    expect(
      livingSeatMajorityReached(livingSeats, ['a', 'a', 'b', 'dead-seat']),
    ).toBe(false);
    expect(
      livingSeatMajorityReached(livingSeats, ['a', 'b', 'c', 'dead-seat']),
    ).toBe(true);
  });
});
