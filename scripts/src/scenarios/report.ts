import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export type ScenarioReport = {
  mode: 'sample' | 'full';
  seed: number;
  startedAt: string;
  durationMs: number;
  sweepCells: number;
  sweepGames: number;
  coveringRows: number;
  coveringGames: number;
  highSeatCoveringRows: number;
  highSeatCoveringGames: number;
  fuzzGames: number;
  goldenGames: number;
  failures: string[];
  failureSeeds: number[];
  pendingLayers: string[];
};

export function resolveScenarioReportPath(
  path = 'docs/SCENARIO_REPORT.md',
): string {
  return isAbsolute(path) ? path : resolve(WORKSPACE_ROOT, path);
}

export function formatScenarioReport(report: ScenarioReport): string {
  const status = report.failures.length ? 'FAIL' : 'PASS — engine scenarios';
  const failures = report.failures.length
    ? report.failures.map((failure) => `- ${failure}`).join('\n')
    : '- none';
  const seeds = report.failureSeeds.length
    ? report.failureSeeds.join(', ')
    : 'none';
  const pending = report.pendingLayers.length
    ? report.pendingLayers.map((layer) => `- ${layer} — NOT RUN`).join('\n')
    : '- none';
  return `# Scenario report

Status: ${status}

Mode: ${report.mode}
Seed: ${report.seed}
Started: ${report.startedAt}
Duration: ${report.durationMs} ms

## Executed

- Exhaustive core sweep cells: ${report.sweepCells}
- Sweep games: ${report.sweepGames}
- Covering-array rows: ${report.coveringRows} (three-way)
- Covering-array games: ${report.coveringGames}
- High-seat pairwise rows: ${report.highSeatCoveringRows} (30–40 seats)
- High-seat pairwise games: ${report.highSeatCoveringGames}
- Deterministic fault-fuzz games: ${report.fuzzGames}
- YAML golden games: ${report.goldenGames}

## Results

Failures:

${failures}

Failure seeds: ${seeds}

## Deferred layers

These are not counted as passes and remain release gates for their planned milestones:

${pending}

This report covers the engine-level suites available at the current milestone. It is not a production release approval.
`;
}
