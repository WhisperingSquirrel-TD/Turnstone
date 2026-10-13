export const SCENARIO_SHARD_COUNT = 6;
export const SCENARIO_SHARD_BUDGET_MS = 5 * 60 * 1000;

// The most recent complete plan took 44.8 s to generate; keep 5 s of margin.
const FIXED_SHARD_OVERHEAD_MS = 50_000;
// 0.70 ms/seat² is above the observed 1.07 s worst 40-seat sample game.
const MEASURED_MS_PER_SEAT_SQUARE = 0.7;

export function projectScenarioShardDurationMs(workloadUnits: number): number {
  if (!Number.isFinite(workloadUnits) || workloadUnits < 0)
    throw new RangeError('Scenario workload must be a non-negative number');
  return Math.ceil(
    FIXED_SHARD_OVERHEAD_MS + workloadUnits * MEASURED_MS_PER_SEAT_SQUARE,
  );
}
