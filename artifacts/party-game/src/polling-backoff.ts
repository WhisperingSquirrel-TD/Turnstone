import { retryAfterMilliseconds } from './pending-command';

export interface AdaptivePollerOptions {
  baseIntervalMs: number;
  maxIntervalMs: number;
  random?: () => number;
  onError?: (error: unknown) => void;
}

export interface AdaptivePoller {
  start(): void;
  refresh(): void;
  stop(): void;
}

export function createAdaptivePoller(
  task: () => Promise<unknown>,
  options: AdaptivePollerOptions,
): AdaptivePoller {
  const baseIntervalMs = Math.max(1, options.baseIntervalMs);
  const maxIntervalMs = Math.max(baseIntervalMs, options.maxIntervalMs);
  const random = options.random ?? Math.random;
  let active = false;
  let started = false;
  let inFlight = false;
  let refreshQueued = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const randomUnit = () => {
    const value = random();
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
  };

  const failureDelay = (error: unknown) => {
    failures += 1;
    const exponent = Math.min(failures - 1, 30);
    const ceiling = Math.min(maxIntervalMs, baseIntervalMs * 2 ** exponent);
    const jittered = Math.min(
      maxIntervalMs,
      Math.round(ceiling * (0.8 + randomUnit() * 0.4)),
    );
    const retryAfterMs = retryAfterMilliseconds(error);
    if (retryAfterMs === null || retryAfterMs <= 0) return jittered;

    const retryAfterJitter = Math.min(5_000, Math.ceil(retryAfterMs * 0.1));
    return (
      Math.max(jittered, retryAfterMs) +
      Math.floor(randomUnit() * retryAfterJitter)
    );
  };

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const schedule = (delayMs: number) => {
    if (!active) return;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, delayMs);
  };

  const run = async () => {
    if (!active) return;
    if (inFlight) {
      refreshQueued = true;
      return;
    }
    inFlight = true;
    let nextDelay = baseIntervalMs;
    try {
      await task();
      failures = 0;
    } catch (error) {
      nextDelay = failureDelay(error);
      options.onError?.(error);
    } finally {
      inFlight = false;
      if (active) {
        if (refreshQueued) {
          refreshQueued = false;
          schedule(0);
        } else {
          schedule(nextDelay);
        }
      }
    }
  };

  return {
    start() {
      if (started) return;
      started = true;
      active = true;
      void run();
    },
    refresh() {
      if (!active) return;
      if (inFlight) {
        refreshQueued = true;
        return;
      }
      clearTimer();
      void run();
    },
    stop() {
      active = false;
      refreshQueued = false;
      clearTimer();
    },
  };
}
