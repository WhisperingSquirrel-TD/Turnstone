import { coreConfig, runScenarioJobs } from './runner';

const result = await runScenarioJobs([
  {
    seed: 20261025,
    strategy: 'random',
    config: coreConfig(5, 1, 'quick'),
  },
  {
    seed: 20261026,
    strategy: 'non-voter',
    config: coreConfig(5, 1, 'quick'),
  },
]);

if (
  result.completed !== 2 ||
  result.failures.length !== 0 ||
  result.failureSeeds.length !== 0
)
  throw new Error('Scenario worker pool failed its two-game smoke check');

console.log('Scenario worker smoke passed: two deterministic games completed.');
