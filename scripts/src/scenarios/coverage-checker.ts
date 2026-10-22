import {
  configForAssignments,
  RULE_FACTORS,
  valueIndexFor,
} from './parameters';
import type { GameConfig } from '@workspace/shared';

export type CoverageResult = {
  covered: number;
  total: number;
  uncovered: string[];
};

const FACTOR_COUNT = RULE_FACTORS.length;
const VALUE_COUNT = Math.max(
  ...RULE_FACTORS.map((factor) => factor.values.length),
);

// Independently encode factor indexes first, then values. Deliberately do not
// share the generator's tuple encoder or its enumeration/validity results.
function tupleKey(
  a: number,
  b: number,
  c: number,
  x: number,
  y: number,
  z: number,
): number {
  return (
    ((((a * FACTOR_COUNT + b) * FACTOR_COUNT + c) * VALUE_COUNT + x) *
      VALUE_COUNT +
      y) *
      VALUE_COUNT +
    z
  );
}

function describeTuple(key: number): string {
  const values: number[] = [];
  const factors: number[] = [];
  for (let index = 0; index < 3; index++) {
    values.unshift(key % VALUE_COUNT);
    key = Math.floor(key / VALUE_COUNT);
  }
  for (let index = 0; index < 3; index++) {
    factors.unshift(key % FACTOR_COUNT);
    key = Math.floor(key / FACTOR_COUNT);
  }
  return factors.map((factor, index) => `${factor}:${values[index]}`).join('|');
}

function independentlyEnumerateLegalTuples(): number[] {
  const tuples: number[] = [];
  for (let a = 0; a < RULE_FACTORS.length; a++) {
    for (let b = a + 1; b < RULE_FACTORS.length; b++) {
      for (let c = b + 1; c < RULE_FACTORS.length; c++) {
        const valuesA = RULE_FACTORS[a]!.values;
        const valuesB = RULE_FACTORS[b]!.values;
        const valuesC = RULE_FACTORS[c]!.values;
        for (let x = 0; x < valuesA.length; x++) {
          for (let y = 0; y < valuesB.length; y++) {
            for (let z = 0; z < valuesC.length; z++) {
              const partial = new Map([
                [a, x],
                [b, y],
                [c, z],
              ]);
              if (!configForAssignments(partial)) continue;
              tuples.push(tupleKey(a, b, c, x, y, z));
            }
          }
        }
      }
    }
  }
  return tuples;
}

export function verifyThreeWayCoverage(
  rows: readonly GameConfig[],
): CoverageResult {
  const observed = new Set<number>();
  for (const row of rows) {
    const indexes = RULE_FACTORS.map((_, index) => valueIndexFor(row, index));
    for (let a = 0; a < indexes.length; a++) {
      for (let b = a + 1; b < indexes.length; b++) {
        for (let c = b + 1; c < indexes.length; c++) {
          observed.add(
            tupleKey(a, b, c, indexes[a]!, indexes[b]!, indexes[c]!),
          );
        }
      }
    }
  }
  const legal = independentlyEnumerateLegalTuples();
  const uncovered = legal
    .filter((tuple) => !observed.has(tuple))
    .map(describeTuple);
  return {
    covered: legal.length - uncovered.length,
    total: legal.length,
    uncovered,
  };
}
