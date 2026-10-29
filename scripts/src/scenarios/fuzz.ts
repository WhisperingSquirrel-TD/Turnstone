import { BOT_STRATEGIES, runCompleteGame } from './simulate';
import { gameConfigSchema } from '@workspace/shared';

export type FuzzBatchOptions = {
  seed: number;
  games: number;
};

export type FuzzBatchSummary = {
  games: number;
  finished: number;
  rejectedInvalidCommands: number;
  failureSeeds: number[];
  failureReasons: string[];
};

export function fuzzFailureReason(seed: number, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `Fuzz game failed at seed ${seed}: ${detail}`;
}

function randomSource(seed: number) {
  let state = seed >>> 0;
  return (upperExclusive: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 0x1_0000_0000) * upperExclusive);
  };
}

export function runFuzzBatch(options: FuzzBatchOptions): FuzzBatchSummary {
  if (!Number.isInteger(options.games) || options.games < 0)
    throw new Error('Fuzz game count must be a non-negative integer');
  const random = randomSource(options.seed);
  const summary: FuzzBatchSummary = {
    games: 0,
    finished: 0,
    rejectedInvalidCommands: 0,
    failureSeeds: [],
    failureReasons: [],
  };
  for (let gameIndex = 0; gameIndex < options.games; gameIndex++) {
    const seed = options.seed + gameIndex + 1;
    const strategy = BOT_STRATEGIES[random(BOT_STRATEGIES.length)]!;
    const count = [5, 6, 8][random(3)]!;
    const config = gameConfigSchema.parse({
      players: { count, lateJoining: ['never', 'first-vote'][random(2)] },
      traitors: {
        number: 1 + random(Math.min(2, count - 1)),
        sleeper: false,
        recruitment: 'off',
        murders: random(2),
        victimDecision: ['majority', 'unanimous', 'first'][random(3)],
        timeoutChoice: ['leading', 'random', 'none'][random(3)],
      },
      missions: { enabled: false, shields: 'off' },
      tasks: { enabled: false },
      roundTable: {
        tieRule: ['revote-random', 'revote-none'][random(2)],
        contendersOnDraw: Boolean(random(2)),
        banishments: 1,
      },
      endgame: {
        size: 3,
        parity: Boolean(random(2)),
      },
      schedule: { format: 'quick', plannedCycles: 1 },
    });
    try {
      const result = runCompleteGame({
        seed,
        strategy,
        config,
        injectFaults: true,
      });
      summary.finished++;
      summary.rejectedInvalidCommands += result.checks.rejectedFaultCommands;
    } catch (error) {
      summary.failureSeeds.push(seed);
      summary.failureReasons.push(fuzzFailureReason(seed, error));
    }
    summary.games++;
  }
  return summary;
}
