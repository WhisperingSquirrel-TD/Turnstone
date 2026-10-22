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
  type ScenarioGameProfile,
} from './report';
import {
  projectScenarioShardDurationMs,
  SCENARIO_SHARD_BUDGET_MS,
  SCENARIO_SHARD_COUNT,
} from './scenario-budget';
import type { ScenarioShardPartial } from './shard-report';

export type ScenarioRunOptions = {
  mode: 'sample' | 'full';
  suite?: ScenarioSuiteName;
  shardIndex?: number;
  shardCount?: number;
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
  coverageRowIds: string[];
  sweepCells: number;
  coveringRows: number;
  highSeatCoveringRows: number;
  fuzzSeed: number;
  fuzzGames: number;
  goldenScenarios: ReturnType<typeof loadGoldenScenarios>;
  coverageFailures: string[];
};

export { SCENARIO_SHARD_BUDGET_MS, SCENARIO_SHARD_COUNT };
export { projectScenarioShardDurationMs };

function schedulingTieBreak(seed: number): number {
  // Avalanche the seed rather than using row order: row strategies repeat
  // every nine rows, which aliases with six shards despite equal seat² loads.
  let value = seed >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return (value ^ (value >>> 15)) >>> 0;
}

function schedulingWork(job: ScenarioJob): number {
  // Inactive bots accumulate substantially longer public histories than
  // active eliminators at the same seat count. This is an ordering heuristic,
  // never a reported/projected duration or a change to the budget estimator.
  const inactivity =
    job.strategy === 'never-acts' || job.strategy === 'non-voter' ? 4 : 1;
  const reveals = job.config.roundTable.revealStyle === 'one-by-one' ? 2 : 1;
  return job.config.players.count ** 2 * inactivity * reveals;
}

export function partitionScenarioJobs(
  jobs: ScenarioJob[],
  shardCount: number,
): ScenarioJob[][] {
  if (!Number.isSafeInteger(shardCount) || shardCount < 1) {
    throw new RangeError('Scenario shard count must be a positive integer');
  }

  const groupById = new Map<
    string,
    {
      jobs: ScenarioJob[];
      originalIndex: number;
      estimatedCost: number;
      schedulingWork: number;
    }
  >();
  jobs.forEach((job, originalIndex) => {
    const groupId = job.coverageRowId ?? `job:${job.seed}:${originalIndex}`;
    const group = groupById.get(groupId) ?? {
      jobs: [],
      originalIndex,
      estimatedCost: 0,
      schedulingWork: 0,
    };
    group.jobs.push(job);
    group.estimatedCost += job.config.players.count ** 2;
    group.schedulingWork += schedulingWork(job);
    groupById.set(groupId, group);
  });
  const groups = [...groupById.values()].sort(
    (left, right) =>
      right.estimatedCost - left.estimatedCost ||
      right.schedulingWork - left.schedulingWork ||
      schedulingTieBreak(left.jobs[0]!.seed) -
        schedulingTieBreak(right.jobs[0]!.seed) ||
      left.originalIndex - right.originalIndex,
  );
  const shardCapacity = Array.from(
    { length: shardCount },
    (_, index) =>
      Math.floor(groups.length / shardCount) +
      (index < groups.length % shardCount ? 1 : 0),
  );
  const shardGroups = Array.from({ length: shardCount }, () => 0);
  const shardJobs = Array.from(
    { length: shardCount },
    () => [] as ScenarioJob[],
  );
  const shardLoads = Array.from({ length: shardCount }, () => 0);
  const schedulingLoads = Array.from({ length: shardCount }, () => 0);

  for (const group of groups) {
    let selectedShard = -1;
    for (let index = 0; index < shardCount; index++) {
      if (shardGroups[index]! >= shardCapacity[index]!) continue;
      if (
        selectedShard === -1 ||
        shardLoads[index]! < shardLoads[selectedShard]! ||
        (shardLoads[index] === shardLoads[selectedShard] &&
          schedulingLoads[index]! < schedulingLoads[selectedShard]!)
      ) {
        selectedShard = index;
      }
    }
    if (selectedShard === -1)
      throw new Error('Scenario shard partition did not assign every row');
    shardJobs[selectedShard]!.push(...group.jobs);
    shardGroups[selectedShard]++;
    shardLoads[selectedShard] += group.estimatedCost;
    schedulingLoads[selectedShard] += group.schedulingWork;
  }

  return shardJobs.map((shard) =>
    shard.sort((left, right) => left.seed - right.seed),
  );
}

export function partitionScenarioPlan(
  plan: readonly ScenarioSuitePlan[],
  shardIndex: number,
  shardCount: number,
): ScenarioSuitePlan[] {
  if (
    !Number.isSafeInteger(shardCount) ||
    shardCount < 1 ||
    !Number.isSafeInteger(shardIndex) ||
    shardIndex < 0 ||
    shardIndex >= shardCount
  )
    throw new RangeError('Invalid scenario shard index or count');

  const assignedJobs = new Set(
    partitionScenarioJobs(
      plan.flatMap((suite) => suite.jobs),
      shardCount,
    )[shardIndex]!,
  );
  return plan.map((suite) => {
    const jobs = suite.jobs
      .filter((job) => assignedJobs.has(job))
      .sort((left, right) => left.seed - right.seed);
    const coverageRowIds = [
      ...new Set(
        jobs.flatMap((job) => (job.coverageRowId ? [job.coverageRowId] : [])),
      ),
    ].sort();
    const includeNonCoverage = shardIndex === 0;
    return {
      ...suite,
      jobs,
      coverageRowIds,
      sweepCells: suite.name === 'core-sweep' ? coverageRowIds.length : 0,
      coveringRows: suite.name === 'three-way' ? coverageRowIds.length : 0,
      highSeatCoveringRows:
        suite.name === 'high-seat-pairwise' ? coverageRowIds.length : 0,
      fuzzGames: includeNonCoverage ? suite.fuzzGames : 0,
      goldenScenarios: includeNonCoverage ? suite.goldenScenarios : [],
      coverageFailures: includeNonCoverage ? suite.coverageFailures : [],
    };
  });
}

export function scenarioShardProjectionMs(
  suites: readonly ScenarioSuitePlan[],
): number {
  const workloadUnits = suites.reduce((total, suite) => {
    const jobs = suite.jobs.reduce(
      (jobTotal, job) => jobTotal + job.config.players.count ** 2,
      0,
    );
    const fuzz = suite.fuzzGames * 8 ** 2;
    const golden = suite.goldenScenarios.reduce(
      (scenarioTotal, scenario) =>
        scenarioTotal + scenario.config.players.count ** 2,
      0,
    );
    return total + jobs + fuzz + golden;
  }, 0);
  return projectScenarioShardDurationMs(workloadUnits);
}

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
  gameProfiles: ScenarioGameProfile[];
};

export async function runScenarioJobs(
  jobs: readonly ScenarioJob[],
): Promise<ScenarioBatchResult> {
  if (!jobs.length)
    return { completed: 0, failureSeeds: [], failures: [], gameProfiles: [] };
  const workerCount = Math.min(availableParallelism(), 8, jobs.length);
  const queue = [...jobs].sort(
    (left, right) =>
      schedulingWork(right) - schedulingWork(left) ||
      schedulingTieBreak(left.seed) - schedulingTieBreak(right.seed),
  );
  let nextJob = 0;
  const workers: Worker[] = [];
  let results: ScenarioWorkerResult[];
  try {
    const batches = await Promise.all(
      Array.from(
        { length: workerCount },
        () =>
          new Promise<ScenarioWorkerResult[]>((resolve, reject) => {
            const worker = new Worker(
              new URL('./scenario-worker.ts', import.meta.url),
              {
                execArgv: process.execArgv,
                workerData: { jobs: [queue[nextJob++]!] },
              },
            );
            workers.push(worker);
            const completed: ScenarioWorkerResult[] = [];
            let finished = false;
            worker.on('message', (result: ScenarioWorkerResult) => {
              completed.push(result);
              if (nextJob < queue.length)
                worker.postMessage([queue[nextJob++]!]);
              else {
                finished = true;
                resolve(completed);
              }
            });
            worker.once('error', reject);
            worker.once('exit', (code) => {
              if (!finished)
                reject(new Error(`Scenario worker exited with code ${code}`));
            });
          }),
      ),
    );
    results = batches.flat();
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
  const profileByPlayers = new Map<number, ScenarioGameProfile>();
  for (const profile of results.flatMap((result) => result.gameProfiles)) {
    const existing = profileByPlayers.get(profile.players) ?? {
      players: profile.players,
      games: 0,
      totalMs: 0,
      maxMs: 0,
    };
    existing.games += profile.games;
    existing.totalMs += profile.totalMs;
    existing.maxMs = Math.max(existing.maxMs, profile.maxMs);
    profileByPlayers.set(profile.players, existing);
  }
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
    gameProfiles: [...profileByPlayers.values()].sort(
      (left, right) => left.players - right.players,
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
  const shardIndex = options.shardIndex ?? 0;
  const shardCount = options.shardCount ?? 1;
  if (
    !Number.isSafeInteger(shardCount) ||
    shardCount < 1 ||
    !Number.isSafeInteger(shardIndex) ||
    shardIndex < 0 ||
    shardIndex >= shardCount
  ) {
    throw new RangeError(
      'Scenario shard index must be a non-negative integer less than its positive shard count',
    );
  }
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
          coverageRowId: `core-sweep:${cellIndex}`,
          strategy:
            BOT_STRATEGIES[(cellIndex + repeat) % BOT_STRATEGIES.length]!,
          config,
        });
      }
    }
    plan.push({
      name: 'core-sweep',
      jobs,
      coverageRowIds: jobs.map((job) => job.coverageRowId!),
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
          coverageRowId: `three-way:${rowIndex}`,
          strategy:
            BOT_STRATEGIES[(rowIndex + repeat) % BOT_STRATEGIES.length]!,
          config: covering[rowIndex]!,
        });
      }
    }
    plan.push({
      name: 'three-way',
      jobs,
      coverageRowIds: jobs.map((job) => job.coverageRowId!),
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
          coverageRowId: `high-seat-pairwise:${rowIndex}`,
          strategy:
            BOT_STRATEGIES[(rowIndex + repeat) % BOT_STRATEGIES.length]!,
          config: highSeatCovering[rowIndex]!,
        });
      }
    }
    plan.push({
      name: 'high-seat-pairwise',
      jobs,
      coverageRowIds: jobs.map((job) => job.coverageRowId!),
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
      coverageRowIds: [],
      sweepCells: 0,
      coveringRows: 0,
      highSeatCoveringRows: 0,
      fuzzSeed: seed + 2_000_000,
      fuzzGames,
      goldenScenarios,
      coverageFailures: [],
    });
  }

  return partitionScenarioPlan(plan, shardIndex, shardCount);
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
    gameProfiles: [],
  };

  const plan = buildScenarioSuitePlan(options);
  const projectedDurationMs = scenarioShardProjectionMs(plan);
  if (
    options.shardCount !== undefined &&
    projectedDurationMs >= SCENARIO_SHARD_BUDGET_MS
  )
    throw new Error(
      `Projected scenario shard time ${projectedDurationMs} ms exceeds the five-minute budget`,
    );
  const coverageRowIds = [
    ...new Set(plan.flatMap((suite) => suite.coverageRowIds)),
  ].sort();
  // One work-conserving pool spans all coverage suites. A slow last game in
  // one suite must not leave the other workers idle behind a suite barrier.
  const batch = await runScenarioJobs(plan.flatMap((suite) => suite.jobs));
  report.failures.push(...batch.failures);
  report.failureSeeds.push(...batch.failureSeeds);
  report.gameProfiles = batch.gameProfiles;
  for (const suite of plan) {
    report.sweepCells += suite.sweepCells;
    report.sweepGames += suite.name === 'core-sweep' ? suite.jobs.length : 0;
    report.coveringRows += suite.coveringRows;
    report.coveringGames += suite.name === 'three-way' ? suite.jobs.length : 0;
    report.highSeatCoveringRows += suite.highSeatCoveringRows;
    report.highSeatCoveringGames +=
      suite.name === 'high-seat-pairwise' ? suite.jobs.length : 0;
    report.failures.push(...suite.coverageFailures);

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
  report.coverageRowIds = coverageRowIds;
  report.projectedDurationMs = projectedDurationMs;
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
  const shardIndexArgument = process.argv.find((argument) =>
    argument.startsWith('--shard-index='),
  );
  const shardCountArgument = process.argv.find((argument) =>
    argument.startsWith('--shard-count='),
  );
  const shardIndex = shardIndexArgument
    ? Number(shardIndexArgument.slice('--shard-index='.length))
    : undefined;
  const shardCount = shardCountArgument
    ? Number(shardCountArgument.slice('--shard-count='.length))
    : undefined;
  const partialReportArgument = process.argv.find((argument) =>
    argument.startsWith('--partial-report='),
  );
  const partialReportPath = partialReportArgument?.slice(
    '--partial-report='.length,
  );
  if (suiteArgument && !suite)
    throw new Error(`Unknown scenario suite: ${requestedSuite}`);

  const report = await runEngineScenarioSuite({
    mode,
    suite,
    shardIndex,
    shardCount,
  });
  if (partialReportPath) {
    const partial: ScenarioShardPartial = {
      shardIndex: shardIndex ?? 0,
      shardCount: shardCount ?? 1,
      durationMs: report.durationMs,
      projectedDurationMs: report.projectedDurationMs ?? 0,
      coverageRowIds: report.coverageRowIds ?? [],
      report,
    };
    const resolvedPartialPath = resolveScenarioReportPath(partialReportPath);
    writeFileSync(
      resolvedPartialPath,
      JSON.stringify(partial, null, 2),
      'utf8',
    );
    console.log(
      `Scenario shard ${partial.shardIndex}/${partial.shardCount}: ${report.failures.length} failures across ${report.sweepGames + report.coveringGames + report.highSeatCoveringGames + report.fuzzGames + report.goldenGames} games; ${report.durationMs} ms actual, ${partial.projectedDurationMs} ms projected.`,
    );
    if (report.failures.length) process.exitCode = 1;
    return report;
  }
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
