import {
  projectScenarioShardDurationMs,
  SCENARIO_SHARD_BUDGET_MS,
} from './scenario-budget';
import type { ScenarioReport } from './report';

export type ScenarioShardPartial = {
  shardIndex: number;
  shardCount: number;
  durationMs: number;
  projectedDurationMs: number;
  coverageRowIds: string[];
  report: ScenarioReport;
};

export function mergeScenarioShardReports(
  partials: readonly ScenarioShardPartial[],
  expectedCoverageRowIds: readonly string[],
  expectedShardCount: number,
): ScenarioReport {
  if (!Number.isSafeInteger(expectedShardCount) || expectedShardCount < 1)
    throw new RangeError('Expected scenario shard count must be positive');
  const byIndex = new Map<number, ScenarioShardPartial>();
  for (const partial of partials) {
    if (
      partial.shardCount !== expectedShardCount ||
      !Number.isSafeInteger(partial.shardIndex) ||
      partial.shardIndex < 0 ||
      partial.shardIndex >= expectedShardCount
    )
      throw new Error('Scenario report has an invalid shard index or count');
    if (byIndex.has(partial.shardIndex))
      throw new Error(
        `Scenario shard ${partial.shardIndex} was reported twice`,
      );
    if (partial.durationMs >= SCENARIO_SHARD_BUDGET_MS)
      throw new Error(
        `Scenario shard ${partial.shardIndex} exceeded the five-minute time budget`,
      );
    if (partial.projectedDurationMs >= SCENARIO_SHARD_BUDGET_MS)
      throw new Error(
        `Projected scenario shard ${partial.shardIndex} exceeds the five-minute time budget`,
      );
    byIndex.set(partial.shardIndex, partial);
  }

  for (let index = 0; index < expectedShardCount; index++)
    if (!byIndex.has(index))
      throw new Error(`Scenario report is missing shard ${index}`);

  const expected = new Set(expectedCoverageRowIds);
  if (expected.size !== expectedCoverageRowIds.length)
    throw new Error('Expected scenario coverage rows contain duplicates');
  const seen = new Set<string>();
  for (let index = 0; index < expectedShardCount; index++) {
    const partial = byIndex.get(index)!;
    for (const rowId of partial.coverageRowIds) {
      if (!expected.has(rowId))
        throw new Error(`Unexpected scenario coverage row ${rowId}`);
      if (seen.has(rowId))
        throw new Error(
          `Scenario coverage row ${rowId} was assigned more than once`,
        );
      seen.add(rowId);
    }
  }
  for (const rowId of expected)
    if (!seen.has(rowId))
      throw new Error(`Scenario coverage row ${rowId} is missing`);

  const reports = [...byIndex.values()].sort(
    (left, right) => left.shardIndex - right.shardIndex,
  );
  const first = reports[0]!.report;
  if (
    reports.some(
      ({ report }) =>
        report.mode !== first.mode ||
        report.seed !== first.seed ||
        report.pendingLayers.join('\n') !== first.pendingLayers.join('\n'),
    )
  )
    throw new Error('Scenario shard reports do not describe the same run');

  const sum = (key: keyof ScenarioReport) =>
    reports.reduce((total, { report }) => {
      const value = report[key];
      return total + (typeof value === 'number' ? value : 0);
    }, 0);
  const profileByPlayers = new Map<
    number,
    { players: number; games: number; totalMs: number; maxMs: number }
  >();
  for (const profile of reports.flatMap(
    ({ report }) => report.gameProfiles ?? [],
  )) {
    const current = profileByPlayers.get(profile.players) ?? {
      players: profile.players,
      games: 0,
      totalMs: 0,
      maxMs: 0,
    };
    current.games += profile.games;
    current.totalMs += profile.totalMs;
    current.maxMs = Math.max(current.maxMs, profile.maxMs);
    profileByPlayers.set(profile.players, current);
  }

  return {
    mode: first.mode,
    seed: first.seed,
    startedAt: first.startedAt,
    durationMs: Math.max(...reports.map(({ durationMs }) => durationMs)),
    sweepCells: sum('sweepCells'),
    sweepGames: sum('sweepGames'),
    coveringRows: sum('coveringRows'),
    coveringGames: sum('coveringGames'),
    highSeatCoveringRows: sum('highSeatCoveringRows'),
    highSeatCoveringGames: sum('highSeatCoveringGames'),
    fuzzGames: sum('fuzzGames'),
    goldenGames: sum('goldenGames'),
    failures: reports.flatMap(({ report }) => report.failures),
    failureSeeds: [
      ...new Set(reports.flatMap(({ report }) => report.failureSeeds)),
    ].sort((left, right) => left - right),
    pendingLayers: [...first.pendingLayers],
    gameProfiles: [...profileByPlayers.values()].sort(
      (left, right) => left.players - right.players,
    ),
    coverageRowIds: [...seen].sort(),
    shardTimings: reports.map((partial) => ({
      shardIndex: partial.shardIndex,
      durationMs: partial.durationMs,
      projectedDurationMs: partial.projectedDurationMs,
    })),
  };
}

export { projectScenarioShardDurationMs, SCENARIO_SHARD_BUDGET_MS };
