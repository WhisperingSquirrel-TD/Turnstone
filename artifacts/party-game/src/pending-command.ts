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
  return error.status >= 400 && error.status < 500 && error.status !== 408;
}

export class PendingCommandStore<T> {
  private readonly attempts = new Map<string, PendingCommandAttempt<T>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

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

  send<TResult>(
    operation: string,
    stepKey: string,
    createPayload: () => T,
    send: (payload: T) => Promise<TResult>,
  ): Promise<TResult> {
    const key = this.requestKey(operation, stepKey);
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<TResult>;

    const attempt = this.getOrCreate(operation, stepKey, createPayload);
    const request = Promise.resolve()
      .then(() => send(attempt.payload))
      .finally(() => {
        if (this.inFlight.get(key) === request) this.inFlight.delete(key);
      });
    this.inFlight.set(key, request);
    return request;
  }

  confirm(operation: string, stepKey: string) {
    if (this.get(operation, stepKey)) this.attempts.delete(operation);
  }

  reject(operation: string, stepKey: string) {
    if (this.get(operation, stepKey)) this.attempts.delete(operation);
  }

  clearForStep(stepKey: string) {
    for (const [operation, attempt] of this.attempts) {
      if (attempt.stepKey !== stepKey) this.attempts.delete(operation);
    }
  }
}
