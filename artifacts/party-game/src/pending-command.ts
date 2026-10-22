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

export class PendingCommandStore<T> {
  private readonly attempts = new Map<string, PendingCommandAttempt<T>>();

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

  confirm(operation: string, stepKey: string) {
    if (this.get(operation, stepKey)) this.attempts.delete(operation);
  }

  clearForStep(stepKey: string) {
    for (const [operation, attempt] of this.attempts) {
      if (attempt.stepKey !== stepKey) this.attempts.delete(operation);
    }
  }
}
