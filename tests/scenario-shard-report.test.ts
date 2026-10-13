import { expect, it } from 'vitest';
import {
  mergeScenarioShardReports,
  projectScenarioShardDurationMs,
  SCENARIO_SHARD_BUDGET_MS,
  type ScenarioShardPartial,
} from '../scripts/src/scenarios/shard-report';
import { formatScenarioReport } from '../scripts/src/scenarios/report';

function partial(
  shardIndex: number,
  coverageRowIds: string[],
  durationMs = 120_000,
): ScenarioShardPartial {
  return {
    shardIndex,
    shardCount: 2,
    durationMs,
    projectedDurationMs: 180_000,
    coverageRowIds,
    report: {
      mode: 'sample',
      seed: 20261013,
      startedAt: '2026-10-13T10:00:00.000Z',
      durationMs,
      sweepCells: 0,
      sweepGames: 0,
      coveringRows: coverageRowIds.length,
      coveringGames: coverageRowIds.length,
      highSeatCoveringRows: 0,
      highSeatCoveringGames: 0,
      fuzzGames: 0,
      goldenGames: 0,
      failures: [],
      failureSeeds: [],
      pendingLayers: [],
    },
  };
}

it('merges disjoint shard reports only when every required coverage row is present once', () => {
  const report = mergeScenarioShardReports(
    [partial(0, ['three-way:0']), partial(1, ['three-way:1'], 140_000)],
    ['three-way:0', 'three-way:1'],
    2,
  );

  expect(report.coveringRows).toBe(2);
  expect(report.shardTimings).toEqual([
    { shardIndex: 0, durationMs: 120_000, projectedDurationMs: 180_000 },
    { shardIndex: 1, durationMs: 140_000, projectedDurationMs: 180_000 },
  ]);
  expect(formatScenarioReport(report)).toContain(
    'Shard 1: 140000 ms actual, 180000 ms projected',
  );
});

it('fails closed when a shard is missing or a coverage row is duplicated', () => {
  expect(() =>
    mergeScenarioShardReports(
      [partial(0, ['three-way:0'])],
      ['three-way:0', 'three-way:1'],
      2,
    ),
  ).toThrow('Scenario report is missing shard 1');

  expect(() =>
    mergeScenarioShardReports(
      [partial(0, ['three-way:0']), partial(1, ['three-way:0'])],
      ['three-way:0', 'three-way:1'],
      2,
    ),
  ).toThrow('Scenario coverage row three-way:0 was assigned more than once');
});

it('rejects actual or projected shard time beyond the five-minute target', () => {
  expect(SCENARIO_SHARD_BUDGET_MS).toBe(300_000);
  expect(() =>
    mergeScenarioShardReports(
      [
        partial(0, ['three-way:0']),
        partial(1, ['three-way:1'], SCENARIO_SHARD_BUDGET_MS + 1),
      ],
      ['three-way:0', 'three-way:1'],
      2,
    ),
  ).toThrow('Scenario shard 1 exceeded the five-minute time budget');
  const overProjected = partial(0, ['three-way:0']);
  overProjected.projectedDurationMs = SCENARIO_SHARD_BUDGET_MS + 1;
  expect(() =>
    mergeScenarioShardReports(
      [overProjected, partial(1, ['three-way:1'])],
      ['three-way:0', 'three-way:1'],
      2,
    ),
  ).toThrow('Projected scenario shard 0 exceeds the five-minute time budget');
  expect(projectScenarioShardDurationMs(1_000_000)).toBeGreaterThan(
    SCENARIO_SHARD_BUDGET_MS,
  );
});
