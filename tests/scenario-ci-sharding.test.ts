import { readFileSync } from 'node:fs';
import { beforeAll, expect, it } from 'vitest';
import {
  buildScenarioSuitePlan,
  partitionScenarioJobs,
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
    0, 0, 0, 13,
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
  const configuredShard = buildScenarioSuitePlan({
    mode: 'sample',
    suite: 'high-seat-pairwise',
    shardIndex: 0,
    shardCount: 4,
  })[0]!;

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

it('keeps the GitHub Actions scenario matrix in sync with the suite plan', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/verify.yml', import.meta.url),
    'utf8',
  );
  const scenarioJob = workflow
    .split(/^[ ]{2}scenarios:\s*$/m)[1]
    ?.split(/^[ ]{2}browsers:\s*$/m)[0];
  const matrixRows = [
    ...(scenarioJob?.matchAll(
      /^[ ]{10}- suite: ([\w-]+)\n[ ]{12}shardIndex: (\d+)\n[ ]{12}shardCount: (\d+)$/gm,
    ) ?? []),
  ].map(([, suite, shardIndex, shardCount]) => ({
    suite,
    shardIndex: Number(shardIndex),
    shardCount: Number(shardCount),
  }));
  const expectedRows = [
    { suite: 'core-sweep', shardIndex: 0, shardCount: 1 },
    { suite: 'three-way', shardIndex: 0, shardCount: 1 },
    ...Array.from({ length: 4 }, (_, shardIndex) => ({
      suite: 'high-seat-pairwise',
      shardIndex,
      shardCount: 4,
    })),
    { suite: 'fuzz-and-golden', shardIndex: 0, shardCount: 1 },
  ];

  expect(matrixRows.map(({ suite }) => suite)).toEqual([
    SCENARIO_SUITE_NAMES[0],
    SCENARIO_SUITE_NAMES[1],
    ...Array.from({ length: 4 }, () => SCENARIO_SUITE_NAMES[2]),
    SCENARIO_SUITE_NAMES[3],
  ]);
  expect(matrixRows).toEqual(expectedRows);
  expect(scenarioJob).toContain('--shard-index="${{ matrix.shardIndex }}"');
  expect(scenarioJob).toContain('--shard-count="${{ matrix.shardCount }}"');
});
