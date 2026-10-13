import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  buildScenarioSuitePlan,
  SCENARIO_SUITE_NAMES,
} from '../scripts/src/scenarios/runner';

it('partitions the complete sample into disjoint scenario suites', () => {
  const suites = buildScenarioSuitePlan({ mode: 'sample' });

  expect(suites.map((suite) => suite.name)).toEqual(SCENARIO_SUITE_NAMES);
  expect(suites.map((suite) => suite.jobs.length)).toEqual([942, 788, 792, 0]);
  expect(suites.map((suite) => suite.fuzzGames)).toEqual([0, 0, 0, 32]);
  expect(suites.map((suite) => suite.goldenScenarios.length)).toEqual([
    0, 0, 0, 13,
  ]);
  expect(suites.flatMap((suite) => suite.coverageFailures)).toEqual([]);

  const seeds = suites.flatMap((suite) => suite.jobs.map((job) => job.seed));
  expect(new Set(seeds).size).toBe(seeds.length);
}, 120_000);

it('builds only the requested suite for a matrix job', () => {
  const suites = buildScenarioSuitePlan({
    mode: 'sample',
    suite: 'core-sweep',
  });

  expect(suites.map((suite) => suite.name)).toEqual(['core-sweep']);
  expect(suites[0]?.jobs).toHaveLength(942);
}, 120_000);

it('keeps the GitHub Actions scenario matrix in sync with the suite plan', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/verify.yml', import.meta.url),
    'utf8',
  );
  const scenarioJob = workflow
    .split(/^[ ]{2}scenarios:\s*$/m)[1]
    ?.split(/^[ ]{2}browsers:\s*$/m)[0];
  const matrix = scenarioJob?.match(/^[ ]{8}suite:\s*\[([^\]]+)\]/m)?.[1];

  expect(matrix).toBeDefined();
  expect(
    matrix
      ?.split(',')
      .map((suite) => suite.trim())
      .filter(Boolean),
  ).toEqual(SCENARIO_SUITE_NAMES);
});
