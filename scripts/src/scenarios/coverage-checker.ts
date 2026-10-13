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

function independentlyEnumerateLegalTuples(): string[] {
  const tuples: string[] = [];
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
              tuples.push(`${a}:${x}|${b}:${y}|${c}:${z}`);
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
  const observed = new Set<string>();
  for (const row of rows) {
    const indexes = RULE_FACTORS.map((_, index) => valueIndexFor(row, index));
    for (let a = 0; a < indexes.length; a++) {
      for (let b = a + 1; b < indexes.length; b++) {
        for (let c = b + 1; c < indexes.length; c++) {
          observed.add(
            `${a}:${indexes[a]}|${b}:${indexes[b]}|${c}:${indexes[c]}`,
          );
        }
      }
    }
  }
  const legal = independentlyEnumerateLegalTuples();
  const uncovered = legal.filter((tuple) => !observed.has(tuple));
  return {
    covered: legal.length - uncovered.length,
    total: legal.length,
    uncovered,
  };
}
