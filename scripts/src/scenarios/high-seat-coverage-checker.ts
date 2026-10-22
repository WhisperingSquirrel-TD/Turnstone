import { gameConfigSchema } from '@workspace/shared';
import type { GameConfig } from '@workspace/shared';
import { HIGH_SEAT_COUNTS } from './high-seat-covering-array';
import { RULE_FACTORS, valueIndexFor } from './parameters';

export type HighSeatCoverageResult = {
  covered: number;
  total: number;
  uncovered: string[];
};

function independentlyValidatePair(
  playerCount: number,
  first: number,
  firstValue: number,
  second: number,
  secondValue: number,
): boolean {
  const candidate: Record<string, unknown> = {
    players: { count: playerCount },
  };
  RULE_FACTORS[first]!.set(candidate, RULE_FACTORS[first]!.values[firstValue]);
  RULE_FACTORS[second]!.set(
    candidate,
    RULE_FACTORS[second]!.values[secondValue],
  );
  return gameConfigSchema.safeParse(candidate).success;
}

export function verifyHighSeatPairwiseCoverage(
  rows: readonly GameConfig[],
): HighSeatCoverageResult {
  const observed = new Set<string>();
  const bySeat = new Map<number, GameConfig[]>(
    HIGH_SEAT_COUNTS.map((count) => [count, []]),
  );
  for (const row of rows) {
    bySeat.get(row.players.count)?.push(row);
  }

  let total = 0;
  const uncovered: string[] = [];
  for (const playerCount of HIGH_SEAT_COUNTS) {
    const seatRows = bySeat.get(playerCount)!;
    for (const row of seatRows) {
      const values = RULE_FACTORS.map((_, index) =>
        index === 0 ? -1 : valueIndexFor(row, index),
      );
      for (let first = 1; first < values.length - 1; first++) {
        for (let second = first + 1; second < values.length; second++) {
          observed.add(
            `${playerCount}|${first}:${values[first]}|${second}:${values[second]}`,
          );
        }
      }
    }

    for (let first = 1; first < RULE_FACTORS.length - 1; first++) {
      for (let second = first + 1; second < RULE_FACTORS.length; second++) {
        for (
          let firstValue = 0;
          firstValue < RULE_FACTORS[first]!.values.length;
          firstValue++
        ) {
          for (
            let secondValue = 0;
            secondValue < RULE_FACTORS[second]!.values.length;
            secondValue++
          ) {
            if (
              !independentlyValidatePair(
                playerCount,
                first,
                firstValue,
                second,
                secondValue,
              )
            )
              continue;
            total++;
            const key = `${playerCount}|${first}:${firstValue}|${second}:${secondValue}`;
            if (!observed.has(key)) uncovered.push(key);
          }
        }
      }
    }
  }
  return { covered: total - uncovered.length, total, uncovered };
}
