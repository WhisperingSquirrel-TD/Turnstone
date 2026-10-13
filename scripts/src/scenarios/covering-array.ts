import {
  configForAssignments,
  configForRow,
  RULE_FACTORS,
  valueIndexFor,
} from './parameters';
import type { GameConfig } from '@workspace/shared';

type Interaction = {
  factorIndexes: [number, number, number];
  valueIndexes: [number, number, number];
  key: string;
};

function keyFor(
  factorIndexes: readonly number[],
  valueIndexes: readonly number[],
): string {
  return factorIndexes
    .map((factorIndex, index) => `${factorIndex}:${valueIndexes[index]}`)
    .join('|');
}

function allInteractions(): Interaction[] {
  const result: Interaction[] = [];
  for (let first = 0; first < RULE_FACTORS.length - 2; first++) {
    for (let second = first + 1; second < RULE_FACTORS.length - 1; second++) {
      for (let third = second + 1; third < RULE_FACTORS.length; third++) {
        const factors = [
          RULE_FACTORS[first]!,
          RULE_FACTORS[second]!,
          RULE_FACTORS[third]!,
        ];
        for (let a = 0; a < factors[0].values.length; a++) {
          for (let b = 0; b < factors[1].values.length; b++) {
            for (let c = 0; c < factors[2].values.length; c++) {
              const values: [number, number, number] = [a, b, c];
              const indexes: [number, number, number] = [first, second, third];
              if (
                !configForAssignments(
                  new Map([
                    [first, a],
                    [second, b],
                    [third, c],
                  ]),
                )
              )
                continue;
              result.push({
                factorIndexes: indexes,
                valueIndexes: values,
                key: keyFor(indexes, values),
              });
            }
          }
        }
      }
    }
  }
  return result;
}

function rowKeys(indices: readonly number[]): string[] {
  const result: string[] = [];
  for (let first = 0; first < indices.length - 2; first++) {
    for (let second = first + 1; second < indices.length - 1; second++) {
      for (let third = second + 1; third < indices.length; third++) {
        result.push(
          keyFor(
            [first, second, third],
            [indices[first]!, indices[second]!, indices[third]!],
          ),
        );
      }
    }
  }
  return result;
}

function completeInteraction(interaction: Interaction): number[] {
  const defaults = configForRow(RULE_FACTORS.map(() => 0));
  if (!defaults) throw new Error('Default parameter row is invalid');
  const row = RULE_FACTORS.map((_, index) => valueIndexFor(defaults, index));
  interaction.factorIndexes.forEach((factorIndex, index) => {
    row[factorIndex] = interaction.valueIndexes[index]!;
  });
  if (configForRow(row)) return row;
  const fixed = new Set(interaction.factorIndexes);
  for (let factorIndex = 0; factorIndex < row.length; factorIndex++) {
    if (fixed.has(factorIndex)) continue;
    const factor = RULE_FACTORS[factorIndex]!;
    for (let valueIndex = 0; valueIndex < factor.values.length; valueIndex++) {
      row[factorIndex] = valueIndex;
      if (configForRow(row)) return row;
    }
  }
  throw new Error(`Could not complete ${interaction.key}`);
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return (upperExclusive: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 0x1_0000_0000) * upperExclusive);
  };
}

export function generateConstrainedArray(seed: number): GameConfig[] {
  const interactions = allInteractions();
  const uncovered = new Set(interactions.map((item) => item.key));
  const random = seededRandom(seed);
  const rows: GameConfig[] = [];
  let attempts = 0;

  while (uncovered.size && rows.length < 250) {
    let best: { config: GameConfig; keys: string[]; gain: number } | undefined;
    for (let candidate = 0; candidate < 8; candidate++) {
      const indices = RULE_FACTORS.map((factor) =>
        random(factor.values.length),
      );
      attempts++;
      const config = configForRow(indices);
      if (!config) continue;
      const keys = rowKeys(indices);
      const gain = keys.reduce(
        (total, key) => total + Number(uncovered.has(key)),
        0,
      );
      if (!best || gain > best.gain) best = { config, keys, gain };
    }
    if (!best || best.gain === 0) break;
    rows.push(best.config);
    for (const key of best.keys) uncovered.delete(key);
  }

  if (uncovered.size) {
    for (const interaction of interactions) {
      if (!uncovered.has(interaction.key)) continue;
      const indices = completeInteraction(interaction);
      const config = configForRow(indices);
      if (!config) throw new Error('Completed row is not a valid game config');
      rows.push(config);
      for (const key of rowKeys(indices)) uncovered.delete(key);
    }
  }
  if (uncovered.size)
    throw new Error(
      `${uncovered.size} interactions remain after ${attempts} candidates and ${rows.length} rows`,
    );

  return rows;
}
