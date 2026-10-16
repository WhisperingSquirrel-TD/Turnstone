import { readFileSync } from 'node:fs';
import { beforeAll, expect, it } from 'vitest';
import {
  buildScenarioSuitePlan,
  partitionScenarioPlan,
  partitionScenarioJobs,
  scenarioShardProjectionMs,
  SCENARIO_SHARD_BUDGET_MS,
  SCENARIO_SHARD_COUNT,
  SCENARIO_SUITE_NAMES,
} from '../scripts/src/scenarios/runner';

let fullSampleSuites: ReturnType<typeof buildScenarioSuitePlan> | undefined;

beforeAll(() => {
  fullSampleSuites = buildScenarioSuitePlan({ mode: 'sample' });
}, 120_000);

it('partitions the complete sample into disjoint scenario suites', () => {
  const suites = fullSampleSuites!;

  expect(suites.map((suite) => suite.name)).toEqual(SCENARIO_SUITE_NAMES);
  expect(suites.map((suite) => suite.jobs.length)).toEqual([942, 788, 792, 0]);
  expect(suites.map((suite) => suite.fuzzGames)).toEqual([0, 0, 0, 32]);
  expect(suites.map((suite) => suite.goldenScenarios.length)).toEqual([
    0, 0, 0, 15,
  ]);
  expect(suites.flatMap((suite) => suite.coverageFailures)).toEqual([]);

  const seeds = suites.flatMap((suite) => suite.jobs.map((job) => job.seed));
  expect(new Set(seeds).size).toBe(seeds.length);
}, 120_000);

it('builds only the requested suite for a matrix job', () => {
  const suites = buildScenarioSuitePlan({
    mode: 'sample',
    suite: 'core-sweep',
  });

  expect(suites.map((suite) => suite.name)).toEqual(['core-sweep']);
  expect(suites[0]?.jobs).toHaveLength(942);
}, 120_000);

it('balances the high-seat sample across four disjoint workload shards', () => {
  const fullSuite = fullSampleSuites!.find(
    (suite) => suite.name === 'high-seat-pairwise',
  )!;
  const shards = partitionScenarioJobs(fullSuite.jobs, 4);
  const configuredShard = partitionScenarioPlan([fullSuite], 0, 4)[0]!;

  expect(shards.map((shard) => shard.length)).toEqual([198, 198, 198, 198]);
  expect(
    shards
      .flatMap((shard) => shard)
      .map((job) => job.seed)
      .sort((left, right) => left - right),
  ).toEqual(
    fullSuite.jobs.map((job) => job.seed).sort((left, right) => left - right),
  );
  expect(configuredShard.coverageFailures).toEqual([]);
  expect(configuredShard.jobs.map((job) => job.seed)).toEqual(
    shards[0]!.map((job) => job.seed),
  );

  const loads = shards.map((shard) =>
    shard.reduce((total, job) => total + job.config.players.count ** 2, 0),
  );
  expect(Math.max(...loads) / Math.min(...loads)).toBeLessThan(1.02);
}, 120_000);

it('distributes fuzz and golden samples once, and projects every shard under five minutes', () => {
  const shards = Array.from({ length: SCENARIO_SHARD_COUNT }, (_, shardIndex) =>
    partitionScenarioPlan(fullSampleSuites!, shardIndex, SCENARIO_SHARD_COUNT),
  );
  const completeCounts = fullSampleSuites!.map((suite) => ({
    name: suite.name,
    rows: suite.sweepCells + suite.coveringRows + suite.highSeatCoveringRows,
    seeds: suite.jobs.map((job) => job.seed),
    fuzzGames: suite.fuzzGames,
    goldenIds: suite.goldenScenarios.map((scenario) => scenario.id),
  }));

  for (const full of completeCounts) {
    const distributed = shards.map((shard) =>
      shard.find((suite) => suite.name === full.name)!,
    );
    const unionSeeds = distributed.flatMap((suite) =>
      suite.jobs.map((job) => job.seed),
    );
    expect(new Set(unionSeeds).size).toBe(full.seeds.length);
    expect(unionSeeds.sort((left, right) => left - right)).toEqual(
      full.seeds.sort((left, right) => left - right),
    );
    expect(
      distributed.reduce(
        (total, suite) =>
          total +
          suite.sweepCells +
          suite.coveringRows +
          suite.highSeatCoveringRows,
        0,
      ),
    ).toBe(full.rows);
    const expectedRows = new Set(
      fullSampleSuites!.find((suite) => suite.name === full.name)!
        .coverageRowIds,
    );
    const shardRows = distributed.flatMap((suite) => suite.coverageRowIds);
    expect(new Set(shardRows)).toEqual(expectedRows);
    expect(shardRows).toHaveLength(expectedRows.size);
  }
  const fuzzCount = shards
    .flat()
    .reduce((total, suite) => total + suite.fuzzGames, 0);
  const goldenIds = shards.flatMap((shard) =>
    shard.flatMap((suite) =>
      suite.goldenScenarios.map((scenario) => scenario.id),
    ),
  );

  expect(fuzzCount).toBe(32);
  expect(new Set(goldenIds).size).toBe(15);
  expect(goldenIds).toHaveLength(15);
  expect(
    Math.max(...shards.map((shard) => scenarioShardProjectionMs(shard))),
  ).toBeLessThan(SCENARIO_SHARD_BUDGET_MS);
}, 120_000);

it('keeps the six-shard GitHub Actions scenario matrix in sync with the suite plan', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/verify.yml', import.meta.url),
    'utf8',
  );
  const scenarioJob = workflow
    .split(/^[ ]{2}scenarios:\s*$/m)[1]
    ?.split(/^[ ]{2}merge-scenario-reports:\s*$/m)[0];
  const matrixRows = [
    ...(scenarioJob?.matchAll(
      /^[ ]{10}- shardIndex: (\d+)\n[ ]{12}shardCount: (\d+)$/gm,
    ) ?? []),
  ].map(([, shardIndex, shardCount]) => ({
    shardIndex: Number(shardIndex),
    shardCount: Number(shardCount),
  }));
  const expectedRows = Array.from({ length: 6 }, (_, shardIndex) => ({
    shardIndex,
    shardCount: 6,
  }));

  expect(matrixRows).toEqual(expectedRows);
  expect(scenarioJob).toContain('--shard-index="${{ matrix.shardIndex }}"');
  expect(scenarioJob).toContain('--shard-count="${{ matrix.shardCount }}"');
  expect(scenarioJob).toContain('--partial-report=');
  expect(scenarioJob).toContain('timeout-minutes: 10');
  expect(workflow).toContain('merge-scenario-reports:');
});
