import { expect, it } from 'vitest';
import { BOT_STRATEGIES } from '../scripts/src/scenarios/simulate';
import {
  coreConfig,
  partitionScenarioJobs,
  partitionScenarioPlan,
  type ScenarioSuitePlan,
} from '../scripts/src/scenarios/runner';

it('breaks periodic bot/shard aliasing without changing any job or coverage-row membership', () => {
  const config = coreConfig(40, 1, 'quick');
  const jobs = Array.from({ length: 540 }, (_, index) => ({
    seed: 20261013 + index * 101,
    coverageRowId: `row:${index}`,
    strategy: BOT_STRATEGIES[index % BOT_STRATEGIES.length]!,
    config,
  })).flatMap((job) => [job, { ...job, seed: job.seed + 1 }]);
  const before = [...jobs];
  const shards = partitionScenarioJobs(jobs, 6);

  expect(partitionScenarioJobs(jobs, 6)).toEqual(shards);
  expect(jobs).toEqual(before);
  expect(shards.map((shard) => shard.length)).toEqual(
    Array.from({ length: 6 }, () => 180),
  );
  expect(shards.flat().sort((a, b) => a.seed - b.seed)).toEqual(jobs);
  for (const shard of shards) {
    expect(shard.map((job) => job.seed)).toEqual(
      shard.map((job) => job.seed).sort((a, b) => a - b),
    );
    expect(new Set(shard.map((job) => job.strategy))).toEqual(
      new Set(BOT_STRATEGIES),
    );
    for (const row of new Set(shard.map((job) => job.coverageRowId)))
      expect(shard.filter((job) => job.coverageRowId === row)).toHaveLength(2);
  }
});

it('spreads long inactive-bot rows evenly without giving up seat-workload balance', () => {
  const config = coreConfig(40, 1, 'quick');
  const jobs = Array.from({ length: 36 }, (_, index) => ({
    seed: 20261013 + index * 101,
    coverageRowId: `row:${index}`,
    strategy: index < 12 ? ('never-acts' as const) : ('random' as const),
    config,
  }));
  const shards = partitionScenarioJobs(jobs, 6);
  expect(shards.map((shard) => shard.length)).toEqual([6, 6, 6, 6, 6, 6]);
  expect(
    shards.map(
      (shard) => shard.filter((job) => job.strategy === 'never-acts').length,
    ),
  ).toEqual([2, 2, 2, 2, 2, 2]);
  expect(shards.flat().sort((a, b) => a.seed - b.seed)).toEqual(jobs);
});

it('does not reset workload balancing at each suite boundary', () => {
  const config = coreConfig(40, 1, 'quick');
  const plan: ScenarioSuitePlan[] = [
    'core-sweep',
    'three-way',
    'high-seat-pairwise',
  ].map((name, suiteIndex) => ({
    name: name as ScenarioSuitePlan['name'],
    jobs: Array.from({ length: 6 }, (_, row) => ({
      seed: suiteIndex * 100 + row,
      coverageRowId: `${name}:${row}`,
      strategy: row < 2 ? ('never-acts' as const) : ('random' as const),
      config,
    })),
    coverageRowIds: Array.from({ length: 6 }, (_, row) => `${name}:${row}`),
    sweepCells: name === 'core-sweep' ? 6 : 0,
    coveringRows: name === 'three-way' ? 6 : 0,
    highSeatCoveringRows: name === 'high-seat-pairwise' ? 6 : 0,
    fuzzSeed: 0,
    fuzzGames: 0,
    goldenScenarios: [],
    coverageFailures: [],
  }));
  const shards = Array.from({ length: 6 }, (_, index) =>
    partitionScenarioPlan(plan, index, 6),
  );
  expect(
    shards.map(
      (shard) =>
        shard
          .flatMap((suite) => suite.jobs)
          .filter((job) => job.strategy === 'never-acts').length,
    ),
  ).toEqual([1, 1, 1, 1, 1, 1]);
  for (const suite of plan) {
    const rows = shards.flatMap(
      (shard) => shard.find((part) => part.name === suite.name)!.coverageRowIds,
    );
    expect(rows.sort()).toEqual([...suite.coverageRowIds].sort());
  }
});
