export function serverClockOffset(serverNow: number, localNow: number): number {
  return serverNow - localNow;
}

export function serverTimeNow(localNow: number, offsetMs: number): number {
  return localNow + offsetMs;
}

export function secondsUntilServerDeadline(
  deadline: number,
  localNow: number,
  offsetMs: number,
): number {
  return Math.max(
    0,
    Math.ceil((deadline - serverTimeNow(localNow, offsetMs)) / 1_000),
  );
}
