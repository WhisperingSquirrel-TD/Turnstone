import {
  configForAssignments,
  RULE_FACTORS,
  valueIndexFor,
} from './parameters';
import type { GameConfig } from '@workspace/shared';

export const HIGH_SEAT_COUNTS = Array.from(
  { length: 11 },
  (_, index) => index + 30,
);

type PairInteraction = {
  firstFactor: number;
  firstValue: number;
  secondFactor: number;
  secondValue: number;
  key: string;
  completion: GameConfig;
};

function pairKey(
  firstFactor: number,
  firstValue: number,
  secondFactor: number,
  secondValue: number,
): string {
  return `${firstFactor}:${firstValue}|${secondFactor}:${secondValue}`;
}

function completePair(
  playerCount: number,
  firstFactor: number,
  firstValue: number,
  secondFactor: number,
  secondValue: number,
): GameConfig | null {
  const fixed = new Map([
    [firstFactor, firstValue],
    [secondFactor, secondValue],
  ]);
  const direct = configForAssignments(fixed, playerCount);
  if (direct) return direct;

  for (let factorIndex = 1; factorIndex < RULE_FACTORS.length; factorIndex++) {
    if (fixed.has(factorIndex)) continue;
    const factor = RULE_FACTORS[factorIndex]!;
    for (let valueIndex = 0; valueIndex < factor.values.length; valueIndex++) {
      const completed = new Map(fixed);
      completed.set(factorIndex, valueIndex);
      const config = configForAssignments(completed, playerCount);
      if (config) return config;
    }
  }
  return null;
}

function interactionsFor(playerCount: number): PairInteraction[] {
  const interactions: PairInteraction[] = [];
  for (let first = 1; first < RULE_FACTORS.length - 1; first++) {
    for (let second = first + 1; second < RULE_FACTORS.length; second++) {
      const firstFactor = RULE_FACTORS[first]!;
      const secondFactor = RULE_FACTORS[second]!;
      for (
        let firstValue = 0;
        firstValue < firstFactor.values.length;
        firstValue++
      ) {
        for (
          let secondValue = 0;
          secondValue < secondFactor.values.length;
          secondValue++
        ) {
          const completion = completePair(
            playerCount,
            first,
            firstValue,
            second,
            secondValue,
          );
          if (!completion) continue;
          interactions.push({
            firstFactor: first,
            firstValue,
            secondFactor: second,
            secondValue,
            key: pairKey(first, firstValue, second, secondValue),
            completion,
          });
        }
      }
    }
  }
  return interactions;
}

function pairKeys(config: GameConfig): string[] {
  const values = RULE_FACTORS.map((factor, index) =>
    index === 0 ? -1 : valueIndexFor(config, index),
  );
  const keys: string[] = [];
  for (let first = 1; first < values.length - 1; first++) {
    for (let second = first + 1; second < values.length; second++) {
      keys.push(pairKey(first, values[first]!, second, values[second]!));
    }
  }
  return keys;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return (upperExclusive: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 0x1_0000_0000) * upperExclusive);
  };
}

function randomConfig(playerCount: number, random: (upper: number) => number) {
  const assignments = new Map<number, number>();
  for (let factorIndex = 1; factorIndex < RULE_FACTORS.length; factorIndex++) {
    assignments.set(
      factorIndex,
      random(RULE_FACTORS[factorIndex]!.values.length),
    );
  }
  return configForAssignments(assignments, playerCount);
}

function rowsForSeat(playerCount: number, seed: number): GameConfig[] {
  const interactions = interactionsFor(playerCount);
  const uncovered = new Set(interactions.map((interaction) => interaction.key));
  const random = seededRandom(seed);
  const rows: GameConfig[] = [];

  while (uncovered.size && rows.length < 300) {
    let best: { config: GameConfig; keys: string[]; gain: number } | undefined;
    for (let candidate = 0; candidate < 32; candidate++) {
      const config = randomConfig(playerCount, random);
      if (!config) continue;
      const keys = pairKeys(config);
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
      rows.push(interaction.completion);
      for (const key of pairKeys(interaction.completion)) uncovered.delete(key);
    }
  }
  if (uncovered.size)
    throw new Error(
      `${uncovered.size} high-seat pairs remain uncovered for ${playerCount} players`,
    );
  return rows;
}

export function generateHighSeatPairwiseArray(seed: number): GameConfig[] {
  return HIGH_SEAT_COUNTS.flatMap((playerCount, index) =>
    rowsForSeat(playerCount, seed + index * 977),
  );
}
