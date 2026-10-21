import { secondsUntilServerDeadline } from './server-clock';

export function getAdvanceControlState(input: {
  minimumAdvanceAt: number | null | undefined;
  localNow: number;
  serverClockOffsetMs: number;
  busy?: boolean;
  paused?: boolean;
}): { disabled: boolean; waitSeconds: number } {
  const waitSeconds =
    input.minimumAdvanceAt == null
      ? 0
      : secondsUntilServerDeadline(
          input.minimumAdvanceAt,
          input.localNow,
          input.serverClockOffsetMs,
        );

  return {
    disabled: Boolean(input.busy || input.paused || waitSeconds > 0),
    waitSeconds,
  };
}

export function isAdvanceConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as {
    status?: unknown;
    response?: { status?: unknown } | null;
  };

  return (
    candidate.status === 409 ||
    (typeof candidate.response === 'object' &&
      candidate.response !== null &&
      candidate.response.status === 409)
  );
}
