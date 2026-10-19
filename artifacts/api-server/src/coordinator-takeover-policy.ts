export const coordinatorInactivityWindowMs = 2 * 60_000;

export type CoordinatorTakeoverPath = 'co-coordinator' | 'majority';

export function isCoordinatorUnavailableForAction(input: {
  now: number;
  lastSeenAt: number | null;
  actionNeeded: boolean;
}): boolean {
  return (
    input.actionNeeded &&
    input.lastSeenAt !== null &&
    input.now - input.lastSeenAt >= coordinatorInactivityWindowMs
  );
}

export function coordinatorTakeoverPath(
  coCoordinatorSeatIds: readonly string[],
): CoordinatorTakeoverPath {
  return coCoordinatorSeatIds.length > 0 ? 'co-coordinator' : 'majority';
}

export function livingSeatMajorityReached(
  livingSeatIds: readonly string[],
  approvedSeatIds: readonly string[],
): boolean {
  const living = new Set(livingSeatIds);
  if (living.size === 0) return false;
  const approvals = new Set(
    approvedSeatIds.filter((seatId) => living.has(seatId)),
  );
  return approvals.size >= Math.floor(living.size / 2) + 1;
}
