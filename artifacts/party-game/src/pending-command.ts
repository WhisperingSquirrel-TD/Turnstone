export type PendingCommandAttempt<T> = Readonly<{
  stepKey: string;
  payload: T;
}>;

export type GameCommandStep = {
  gameId: string;
  viewerSeatId: string | null;
  phase: string;
  cycle: number;
  revote: boolean;
  shadowRound: number;
  shadowSlot: number;
};

export function gameCommandStepKey({
  gameId,
  viewerSeatId,
  phase,
  cycle,
  revote,
  shadowRound,
  shadowSlot,
}: GameCommandStep) {
  return JSON.stringify([
    gameId,
    viewerSeatId,
    phase,
    cycle,
    revote,
    shadowRound,
    shadowSlot,
  ]);
}

export function isDefinitiveCommandRejection(error: unknown) {
  if (
    !error ||
    typeof error !== 'object' ||
    !('status' in error) ||
    typeof error.status !== 'number'
  )
    return false;
  return (
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

export function retryAfterMilliseconds(
  error: unknown,
  now = Date.now(),
): number | null {
  if (!error || typeof error !== 'object' || !('status' in error)) return null;
  if (error.status !== 429) return null;

  if ('retryAfterMs' in error && typeof error.retryAfterMs === 'number')
    return Math.max(0, error.retryAfterMs);

  const headers =
    'headers' in error && error.headers instanceof Headers
      ? error.headers
      : 'response' in error &&
          error.response &&
          typeof error.response === 'object' &&
          'headers' in error.response &&
          error.response.headers instanceof Headers
        ? error.response.headers
        : null;
  const value = headers?.get('Retry-After');
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.ceil(seconds * 1_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

class RetryAfterActiveError extends Error {
  readonly status = 429;

  constructor(readonly retryAfterMs: number) {
    super('The server asked this command to wait before retrying.');
  }
}

export class PendingCommandStore<T> {
  private readonly attempts = new Map<string, PendingCommandAttempt<T>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly retryAfter = new Map<string, number>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  private requestKey(operation: string, stepKey: string) {
    return JSON.stringify([operation, stepKey]);
  }

  get(operation: string, stepKey: string) {
    const attempt = this.attempts.get(operation);
    return attempt?.stepKey === stepKey ? attempt : null;
  }

  getOrCreate(
    operation: string,
    stepKey: string,
    createPayload: () => T,
  ): PendingCommandAttempt<T> {
    const existing = this.get(operation, stepKey);
    if (existing) return existing;

    const attempt = Object.freeze({
      stepKey,
      payload: createPayload(),
    });
    this.attempts.set(operation, attempt);
    return attempt;
  }

  isSending(operation: string, stepKey: string) {
    return this.inFlight.has(this.requestKey(operation, stepKey));
  }

  isWaitingToSend(operation: string, stepKey: string) {
    return (
      Boolean(this.get(operation, stepKey)) &&
      !this.isSending(operation, stepKey)
    );
  }

  getRetryAfterUntil(operation: string, stepKey: string) {
    const retryAt = this.retryAfter.get(this.requestKey(operation, stepKey));
    if (retryAt === undefined || retryAt <= this.now()) return null;
    return retryAt;
  }

  send<TResult>(
    operation: string,
    stepKey: string,
    createPayload: () => T,
    send: (payload: T) => Promise<TResult>,
  ): Promise<TResult> {
    const key = this.requestKey(operation, stepKey);
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<TResult>;

    const retryAt = this.retryAfter.get(key);
    const retryAfterMs = retryAt === undefined ? 0 : retryAt - this.now();
    if (retryAfterMs > 0)
      return Promise.reject(new RetryAfterActiveError(retryAfterMs));
    if (retryAt !== undefined) this.retryAfter.delete(key);

    const attempt = this.getOrCreate(operation, stepKey, createPayload);
    const request = Promise.resolve()
      .then(() => send(attempt.payload))
      .catch((error: unknown) => {
        const retryAfterMs = retryAfterMilliseconds(error, this.now());
        if (retryAfterMs !== null && retryAfterMs > 0)
          this.retryAfter.set(key, this.now() + retryAfterMs);
        throw error;
      })
      .finally(() => {
        if (this.inFlight.get(key) === request) this.inFlight.delete(key);
      });
    this.inFlight.set(key, request);
    return request;
  }

  confirm(operation: string, stepKey: string) {
    if (this.get(operation, stepKey)) {
      this.attempts.delete(operation);
      this.retryAfter.delete(this.requestKey(operation, stepKey));
    }
  }

  reject(operation: string, stepKey: string) {
    if (this.get(operation, stepKey)) {
      this.attempts.delete(operation);
      this.retryAfter.delete(this.requestKey(operation, stepKey));
    }
  }

  clearForStep(stepKey: string) {
    for (const [operation, attempt] of this.attempts) {
      if (attempt.stepKey !== stepKey) {
        this.attempts.delete(operation);
        this.retryAfter.delete(this.requestKey(operation, attempt.stepKey));
      }
    }
  }
}
