import { expect, it } from 'vitest';
import { BOT_STRATEGIES } from '../scripts/src/scenarios/simulate';
import {
  coreConfig,
  partitionScenarioJobs,
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
