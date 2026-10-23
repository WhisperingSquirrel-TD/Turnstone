const sharedIpMinimumPerMinute = 120;
const sharedIpMaximumPerMinute = 400;
const sharedIpPerSeatPerMinute = 8;

export function gameplayCommandRateLimits(seatCount: number) {
  if (!Number.isSafeInteger(seatCount) || seatCount < 0)
    throw new RangeError('Stored game seat count is invalid');

  const sharedIpPerMinute = Math.min(
    sharedIpMaximumPerMinute,
    Math.max(sharedIpMinimumPerMinute, sharedIpPerSeatPerMinute * seatCount),
  );

  return {
    sharedIpPerMinute,
    perSeatAggregatePerMinute: Math.floor(sharedIpPerMinute / 4),
    perSeatCommandPerMinute: 60,
  } as const;
}
