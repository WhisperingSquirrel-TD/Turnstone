import { expect, it } from 'vitest';
import { generateHighSeatPairwiseArray } from '../scripts/src/scenarios/high-seat-covering-array';
import { verifyHighSeatPairwiseCoverage } from '../scripts/src/scenarios/high-seat-coverage-checker';

it('covers valid setting pairs independently at every 30–40 seat count', () => {
  const rows = generateHighSeatPairwiseArray(20261023);
  expect(new Set(rows.map((row) => row.players.count))).toEqual(
    new Set(Array.from({ length: 11 }, (_, index) => index + 30)),
  );
  expect(rows.every((row) => row.schedule.plannedCycles === null)).toBe(true);
  expect(verifyHighSeatPairwiseCoverage(rows).uncovered).toEqual([]);
  expect(
    verifyHighSeatPairwiseCoverage(
      rows.filter((row) => row.players.count !== 30),
    ).uncovered.length,
  ).toBeGreaterThan(0);
}, 120_000);
