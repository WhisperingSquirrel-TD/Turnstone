import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { gameConfigSchema } from '@workspace/shared';
import { BOT_STRATEGIES, runCompleteGame } from './simulate';
import type { BotStrategy } from './simulate';
import type { ScenarioJob, ScenarioWorkerResult } from './scenario-worker';
import { generateConstrainedArray } from './covering-array';
import { verifyThreeWayCoverage } from './coverage-checker';
import { generateHighSeatPairwiseArray } from './high-seat-covering-array';
import { verifyHighSeatPairwiseCoverage } from './high-seat-coverage-checker';
import { loadGoldenScenarios } from './golden';
import { runFuzzBatch } from './fuzz';
import {
  formatScenarioReport,
  resolveScenarioReportPath,
  type ScenarioReport,
} from './report';

export type ScenarioRunOptions = {
  mode: 'sample' | 'full';
  suite?: ScenarioSuiteName;
  limits?: {
    sweepCells?: number;
    coveringRows?: number;
    fuzzGames?: number;
    gamesPerSweepCell?: number;
    gamesPerCoveringRow?: number;
    highSeatRows?: number;
  };
};

export const SCENARIO_SUITE_NAMES = [
  'core-sweep',
  'three-way',
  'high-seat-pairwise',
  'fuzz-and-golden',
] as const;

export type ScenarioSuiteName = (typeof SCENARIO_SUITE_NAMES)[number];

export type ScenarioSuitePlan = {
  name: ScenarioSuiteName;
  jobs: ScenarioJob[];
  sweepCells: number;
  coveringRows: number;
  highSeatCoveringRows: number;
  fuzzSeed: number;
  fuzzGames: number;
  goldenScenarios: ReturnType<typeof loadGoldenScenarios>;
  coverageFailures: string[];
};

export const SAMPLE_SCENARIO_LIMITS = {
  gamesPerSweepCell: 1,
  gamesPerCoveringRow: 1,
  fuzzGames: 32,
} as const;

export const SCENARIO_PENDING_LAYERS = [
  'Independent pot validation — pending Milestone 7',
  'HTTP/socket scenarios, real restart and network-fault integration (Milestone 4)',
  'Complete phone, tablet and installed-mode browser games (Milestone 5)',
  'Production-scale capacity, soak, chaos and mutation suites (Milestone 10)',
];

export type ScenarioBatchResult = {
  completed: number;
  failureSeeds: number[];
  failures: string[];
};

export async function runScenarioJobs(
  jobs: readonly ScenarioJob[],
): Promise<ScenarioBatchResult> {
  if (!jobs.length) return { completed: 0, failureSeeds: [], failures: [] };
  const workerCount = Math.min(availableParallelism(), 8, jobs.length);
  const chunks = Array.from({ length: workerCount }, () => [] as ScenarioJob[]);
  jobs.forEach((job, index) => chunks[index % workerCount]!.push(job));
  const results = await Promise.all(
    chunks.map(
      (chunk) =>
        new Promise<ScenarioWorkerResult>((resolve, reject) => {
          const worker = new Worker(
            new URL('./scenario-worker.ts', import.meta.url),
            {
              execArgv: process.execArgv,
              workerData: { jobs: chunk },
            },
          );
          worker.once('message', (result: ScenarioWorkerResult) => {
            void worker.terminate();
            resolve(result);
          });
          worker.once('error', reject);
          worker.once('exit', (code) => {
            if (code !== 0)
              reject(new Error(`Scenario worker exited with code ${code}`));
          });
        }),
    ),
  );
  return {
    completed: results.reduce((total, result) => total + result.completed, 0),
    failureSeeds: results.flatMap((result) =>
      result.failures.map((failure) => failure.seed),
    ),
    failures: results.flatMap((result) =>
      result.failures.map(
        (failure) => `Seed ${failure.seed}: ${failure.reason}`,
      ),
    ),
  };
}

function sweepConfigs() {
  const cells: {
    players: number;
    traitors: number | 'auto';
    format: string;
  }[] = [];
  for (let players = 5; players <= 40; players++) {
    const traitors: (number | 'auto')[] = ['auto'];
    for (let count = 1; count <= Math.min(8, players - 1); count++)
      traitors.push(count);
    for (const number of traitors)
      for (const format of ['quick', 'day', 'multi-day'])
        cells.push({ players, traitors: number, format });
  }
  return cells;
}

export function coreConfig(
  players: number,
  traitors: number | 'auto',
  format: string,
) {
  return gameConfigSchema.parse({
    players: { count: players, lateJoining: 'never' },
    traitors: {
      number: traitors,
      sleeper: false,
      recruitment: 'off',
      murders: 1,
    },
    missions: { enabled: false, shields: 'off' },
    tasks: { enabled: false },
    schedule: { format },
  });
}

export function buildScenarioSuitePlan(
  options: ScenarioRunOptions,
): ScenarioSuitePlan[] {
  const seed = 20261013;
  const includes = (name: ScenarioSuiteName) =>
    !options.suite || options.suite === name;
  const plan: ScenarioSuitePlan[] = [];

  if (includes('core-sweep')) {
    const cells = sweepConfigs();
    const sweepLimit = Math.min(
      options.limits?.sweepCells ?? cells.length,
      cells.length,
    );
    const perCell =
      options.limits?.gamesPerSweepCell ??
      (options.mode === 'full' ? 20 : SAMPLE_SCENARIO_LIMITS.gamesPerSweepCell);
    const jobs: ScenarioJob[] = [];
    for (let cellIndex = 0; cellIndex < sweepLimit; cellIndex++) {
      const cell = cells[cellIndex]!;
      const config = coreConfig(cell.players, cell.traitors, cell.format);
      for (let repeat = 0; repeat < perCell; repeat++) {
        const caseSeed = seed + cellIndex * 101 + repeat;
        jobs.push({
          seed: caseSeed,
          strategy:
            BOT_STRATEGIES[(cellIndex + repeat) % BOT_STRATEGIES.length]!,
          config,
        });
      }
    }
    plan.push({
      name: 'core-sweep',
      jobs,
      sweepCells: sweepLimit,
      coveringRows: 0,
      highSeatCoveringRows: 0,
      fuzzSeed: 0,
      fuzzGames: 0,
      goldenScenarios: [],
      coverageFailures: [],
    });
  }

  if (includes('three-way')) {
    const covering = generateConstrainedArray(seed);
    const coverage = verifyThreeWayCoverage(covering);
    const rowLimit = Math.min(
      options.limits?.coveringRows ?? covering.length,
      covering.length,
    );
    const perRow =
      options.limits?.gamesPerCoveringRow ??
      (options.mode === 'full'
        ? 50
        : SAMPLE_SCENARIO_LIMITS.gamesPerCoveringRow);
    const jobs: ScenarioJob[] = [];
    for (let rowIndex = 0; rowIndex < rowLimit; rowIndex++) {
      for (let repeat = 0; repeat < perRow; repeat++) {
        const caseSeed = seed + 1_000_000 + rowIndex * 101 + repeat;
        jobs.push({
          seed: caseSeed,
          strategy:
            BOT_STRATEGIES[(rowIndex + repeat) % BOT_STRATEGIES.length]!,
          config: covering[rowIndex]!,
        });
      }
    }
    plan.push({
      name: 'three-way',
      jobs,
      sweepCells: 0,
      coveringRows: rowLimit,
      highSeatCoveringRows: 0,
      fuzzSeed: 0,
      fuzzGames: 0,
      goldenScenarios: [],
      coverageFailures: coverage.uncovered.length
        ? [
            `Independent three-way checker found ${coverage.uncovered.length} uncovered tuples`,
          ]
        : [],
    });
  }

  if (includes('high-seat-pairwise')) {
    const highSeatCovering = generateHighSeatPairwiseArray(seed + 3_000_000);
    const highSeatCoverage = verifyHighSeatPairwiseCoverage(highSeatCovering);
    const highSeatRowLimit = Math.min(
      options.limits?.highSeatRows ?? highSeatCovering.length,
      highSeatCovering.length,
    );
    const perRow =
      options.limits?.gamesPerCoveringRow ??
      (options.mode === 'full'
        ? 50
        : SAMPLE_SCENARIO_LIMITS.gamesPerCoveringRow);
    const jobs: ScenarioJob[] = [];
    for (let rowIndex = 0; rowIndex < highSeatRowLimit; rowIndex++) {
      for (let repeat = 0; repeat < perRow; repeat++) {
        const caseSeed = seed + 4_000_000 + rowIndex * 101 + repeat;
        jobs.push({
          seed: caseSeed,
          strategy:
            BOT_STRATEGIES[(rowIndex + repeat) % BOT_STRATEGIES.length]!,
          config: highSeatCovering[rowIndex]!,
        });
      }
    }
    plan.push({
      name: 'high-seat-pairwise',
      jobs,
      sweepCells: 0,
      coveringRows: 0,
      highSeatCoveringRows: highSeatRowLimit,
      fuzzSeed: 0,
      fuzzGames: 0,
      goldenScenarios: [],
      coverageFailures: highSeatCoverage.uncovered.length
        ? [
            `Independent high-seat pairwise checker found ${highSeatCoverage.uncovered.length} uncovered pairs`,
          ]
        : [],
    });
  }

  if (includes('fuzz-and-golden')) {
    const fuzzGames =
      options.limits?.fuzzGames ??
      (options.mode === 'full' ? 100_000 : SAMPLE_SCENARIO_LIMITS.fuzzGames);
    const goldenScenarios = loadGoldenScenarios();
    plan.push({
      name: 'fuzz-and-golden',
      jobs: [],
      sweepCells: 0,
      coveringRows: 0,
      highSeatCoveringRows: 0,
      fuzzSeed: seed + 2_000_000,
      fuzzGames,
      goldenScenarios,
      coverageFailures: [],
    });
  }

  return plan;
}

export async function runEngineScenarioSuite(
  options: ScenarioRunOptions,
): Promise<ScenarioReport> {
  const seed = 20261013;
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const report: ScenarioReport = {
    mode: options.mode,
    seed,
    startedAt,
    durationMs: 0,
    sweepCells: 0,
    sweepGames: 0,
    coveringRows: 0,
    coveringGames: 0,
    highSeatCoveringRows: 0,
    highSeatCoveringGames: 0,
    fuzzGames: 0,
    goldenGames: 0,
    failures: [],
    failureSeeds: [],
    pendingLayers: [...SCENARIO_PENDING_LAYERS],
  };

  const plan = buildScenarioSuitePlan(options);
  for (const suite of plan) {
    report.sweepCells += suite.sweepCells;
    report.sweepGames += suite.name === 'core-sweep' ? suite.jobs.length : 0;
    report.coveringRows += suite.coveringRows;
    report.coveringGames += suite.name === 'three-way' ? suite.jobs.length : 0;
    report.highSeatCoveringRows += suite.highSeatCoveringRows;
    report.highSeatCoveringGames +=
      suite.name === 'high-seat-pairwise' ? suite.jobs.length : 0;
    report.failures.push(...suite.coverageFailures);

    const batch = await runScenarioJobs(suite.jobs);
    report.failures.push(...batch.failures);
    report.failureSeeds.push(...batch.failureSeeds);

    if (suite.fuzzGames > 0) {
      const fuzz = runFuzzBatch({
        seed: suite.fuzzSeed,
        games: suite.fuzzGames,
      });
      report.fuzzGames += fuzz.games;
      report.failureSeeds.push(...fuzz.failureSeeds);
      report.failures.push(...fuzz.failureReasons);
    }

    for (const scenario of suite.goldenScenarios) {
      try {
        const result = runCompleteGame({
          seed: scenario.seed,
          strategy: scenario.strategy as BotStrategy,
          config: scenario.config,
        });
        const actual = {
          phase: result.state.phase,
          winner: result.state.winner,
          reason: result.state.reason,
          alive: result.state.seats.filter((seat) => seat.status === 'alive')
            .length,
          eliminated: result.state.seats.filter(
            (seat) => seat.status !== 'alive',
          ).length,
        };
        if (JSON.stringify(actual) !== JSON.stringify(scenario.expected)) {
          report.failures.push(`Golden outcome mismatch: ${scenario.id}`);
          report.failureSeeds.push(scenario.seed);
        }
      } catch (error) {
        report.failures.push(
          `Golden scenario ${scenario.id}: ${error instanceof Error ? error.message : 'Unknown failure'}`,
        );
        report.failureSeeds.push(scenario.seed);
      }
      report.goldenGames++;
    }
  }

  report.failureSeeds = [...new Set(report.failureSeeds)].sort((a, b) => a - b);
  report.durationMs = Math.round(performance.now() - started);
  return report;
}

export async function writeScenarioReport(
  path = 'docs/SCENARIO_REPORT.md',
): Promise<ScenarioReport> {
  const mode = process.argv.includes('--full') ? 'full' : 'sample';
  const suiteArgument = process.argv.find((argument) =>
    argument.startsWith('--suite='),
  );
  const requestedSuite = suiteArgument?.slice('--suite='.length);
  const suite = SCENARIO_SUITE_NAMES.find((name) => name === requestedSuite);
  if (requestedSuite && !suite)
    throw new Error(`Unknown scenario suite: ${requestedSuite}`);

  const report = await runEngineScenarioSuite({ mode, suite });
  if (suite) {
    const games =
      report.sweepGames +
      report.coveringGames +
      report.highSeatCoveringGames +
      report.fuzzGames +
      report.goldenGames;
    console.log(
      `Scenario suite ${suite}: ${report.failures.length} failures across ${games} games.`,
    );
    if (report.failures.length) {
      console.error(report.failures.join('\n'));
      process.exitCode = 1;
    }
    return report;
  }

  const reportPath = resolveScenarioReportPath(path);
  writeFileSync(reportPath, formatScenarioReport(report), 'utf8');
  console.log(
    `Scenario report written to ${reportPath}: ${report.failures.length} failures across ${report.sweepGames + report.coveringGames + report.highSeatCoveringGames + report.fuzzGames + report.goldenGames} games.`,
  );
  if (report.failures.length) process.exitCode = 1;
  return report;
}

if (process.argv[1]?.endsWith('/runner.ts')) {
  void writeScenarioReport().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Scenario report failed',
    );
    process.exitCode = 1;
  });
}
