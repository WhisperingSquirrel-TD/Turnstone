import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildScenarioSuitePlan, SCENARIO_SHARD_COUNT } from './runner';
import {
  mergeScenarioShardReports,
  type ScenarioShardPartial,
} from './shard-report';
import { formatScenarioReport, resolveScenarioReportPath } from './report';

function argument(name: string, fallback: string): string {
  const value = process.argv.find((entry) => entry.startsWith(`${name}=`));
  return value ? value.slice(name.length + 1) : fallback;
}

function main() {
  const reportsDirectory = resolveScenarioReportPath(
    argument('--reports-dir', 'generated-artifacts/scenario-shards'),
  );
  const outputPath = resolveScenarioReportPath(
    argument('--output', 'docs/SCENARIO_REPORT.md'),
  );
  const paths = readdirSync(reportsDirectory)
    .filter((name) => /^shard-\d+\.json$/.test(name))
    .sort();
  const partials = paths.map(
    (name) =>
      JSON.parse(
        readFileSync(`${reportsDirectory}/${name}`, 'utf8'),
      ) as ScenarioShardPartial,
  );
  const expectedCoverageRowIds = buildScenarioSuitePlan({
    mode: 'sample',
  }).flatMap((suite) => suite.coverageRowIds);
  const report = mergeScenarioShardReports(
    partials,
    expectedCoverageRowIds,
    SCENARIO_SHARD_COUNT,
  );

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, formatScenarioReport(report), 'utf8');
  console.log(
    `Merged ${partials.length} scenario shards: ${report.coverageRowIds?.length ?? 0}/${expectedCoverageRowIds.length} coverage rows; longest shard ${report.durationMs} ms.`,
  );
  if (report.failures.length) {
    console.error(report.failures.join('\n'));
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Scenario report merge failed',
  );
  process.exitCode = 1;
}
