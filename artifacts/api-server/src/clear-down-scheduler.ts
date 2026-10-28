import type {
  ClearDownMode,
  ClearDownOptions,
  ClearDownResult,
} from '@workspace/db/clear-down';

// One in-process clear-down job on the single Reserved VM (D115, D117). It
// runs hourly: practice games on every run, real games only from 04:00 UK,
// so a late-night game is never cut off on its last evening.

const HOUR_MS = 60 * 60 * 1000;
const NIGHTLY_HOUR_UK = 4;

const ukHour = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  hour: '2-digit',
  hourCycle: 'h23',
});

export function isNightlyClearDownTime(now: number): boolean {
  return Number(ukHour.format(new Date(now))) >= NIGHTLY_HOUR_UK;
}

export type ClearDownLogEntry = {
  mode: ClearDownMode;
  expiredGames: number;
  practiceGames: number;
  deleted: number;
  failed: number;
};

export function createClearDownScheduler(options: {
  mode: ClearDownMode;
  run: (options: ClearDownOptions) => Promise<ClearDownResult>;
  /** Receives counts only: never game ids, names, codes or content. */
  log: (entry: ClearDownLogEntry) => void;
  onError?: () => void;
  now?: () => number;
  intervalMs?: number;
}) {
  const now = options.now ?? Date.now;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running: Promise<void> | null = null;

  async function runOnce(): Promise<void> {
    if (options.mode === 'off' || running) return;
    running = (async () => {
      try {
        const at = now();
        const result = await options.run({
          now: at,
          mode: options.mode,
          realGames: isNightlyClearDownTime(at),
        });
        if (result.ran)
          options.log({
            mode: result.mode,
            expiredGames: result.expiredGames,
            practiceGames: result.practiceGames,
            deleted: result.deleted,
            failed: result.failed,
          });
      } catch {
        options.onError?.();
      } finally {
        running = null;
      }
    })();
    await running;
  }

  return {
    runOnce,
    start(): void {
      if (options.mode === 'off' || timer) return;
      timer = setInterval(() => void runOnce(), options.intervalMs ?? HOUR_MS);
      timer.unref?.();
    },
    async stop(): Promise<void> {
      if (timer) clearInterval(timer);
      timer = null;
      await running;
    },
  };
}
