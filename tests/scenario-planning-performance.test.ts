import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { gameConfigSchema } from '../lib/shared/src/index';
import { verifyHighSeatPairwiseCoverage } from '../scripts/src/scenarios/high-seat-coverage-checker';
import { HIGH_SEAT_COUNTS } from '../scripts/src/scenarios/high-seat-covering-array';
import { interactionKey } from '../scripts/src/scenarios/covering-array';
import { verifyThreeWayCoverage } from '../scripts/src/scenarios/coverage-checker';
import { RULE_FACTORS } from '../scripts/src/scenarios/parameters';

it('uses a collision-free numeric key for every three-factor/value tuple', () => {
  const keys = new Set<number>();
  let tuples = 0;
  for (let a = 0; a < RULE_FACTORS.length - 2; a++)
    for (let b = a + 1; b < RULE_FACTORS.length - 1; b++)
      for (let c = b + 1; c < RULE_FACTORS.length; c++)
        for (let x = 0; x < RULE_FACTORS[a]!.values.length; x++)
          for (let y = 0; y < RULE_FACTORS[b]!.values.length; y++)
            for (let z = 0; z < RULE_FACTORS[c]!.values.length; z++) {
              const key = interactionKey([a, b, c], [x, y, z]);
              expect(Number.isSafeInteger(key)).toBe(true);
              keys.add(key);
              tuples++;
            }
  expect(keys.size).toBe(tuples);
});

it('retains every independently validated three-way oracle tuple and its diagnostic ordering', () => {
  const result = verifyThreeWayCoverage([]);
  expect(result.total).toBe(201749);
  expect(result.uncovered).toHaveLength(201749);
  expect(
    createHash('sha256').update(JSON.stringify(result)).digest('hex'),
  ).toBe('18cc33917530714a782bde6c3ffb56b27d035e0c63ec0602ebf0427e06d5fff1');
}, 30_000);

it('validates each high-seat pair once while retaining the entire independent uncovered oracle', () => {
  const parse = vi.spyOn(gameConfigSchema, 'safeParse');
  let result: ReturnType<typeof verifyHighSeatPairwiseCoverage>;
  try {
    result = verifyHighSeatPairwiseCoverage([]);
    const pairsPerSeat = RULE_FACTORS.reduce(
      (total, factor, first) =>
        total +
        (first === 0
          ? 0
          : RULE_FACTORS.slice(first + 1).reduce(
              (count, second) =>
                count + factor.values.length * second.values.length,
              0,
            )),
      0,
    );
    expect(parse).toHaveBeenCalledTimes(pairsPerSeat * HIGH_SEAT_COUNTS.length);
  } finally {
    parse.mockRestore();
  }
  expect(result!.total).toBe(60995);
  expect(
    createHash('sha256').update(JSON.stringify(result!)).digest('hex'),
  ).toBe('f1804700f2d3cf1ffc8009d11e92af8eb91dfee6d290f49c4828e1acd3ca0e00');
}, 30_000);
