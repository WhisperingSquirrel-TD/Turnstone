import { expect, it } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatScenarioReport,
  resolveScenarioReportPath,
  type ScenarioReport,
} from '../scripts/src/scenarios/report';

it('writes the default report into the workspace docs directory from any package cwd', () => {
  const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
  expect(resolveScenarioReportPath()).toBe(
    resolve(workspaceRoot, 'docs/SCENARIO_REPORT.md'),
  );
});

it('resolves a custom relative report path from the workspace root', () => {
  const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
  expect(resolveScenarioReportPath('tmp/report.md')).toBe(
    resolve(workspaceRoot, 'tmp/report.md'),
  );
});

it('renders a complete, auditable scenario report without treating missing layers as passes', () => {
  const report: ScenarioReport = {
    mode: 'sample',
    seed: 20261013,
    startedAt: '2026-10-13T10:00:00.000Z',
    durationMs: 1234,
    sweepCells: 942,
    sweepGames: 1884,
    coveringRows: 628,
    coveringGames: 3140,
    highSeatCoveringRows: 1100,
    highSeatCoveringGames: 5500,
    fuzzGames: 32,
    goldenGames: 12,
    failures: [],
    failureSeeds: [],
    pendingLayers: ['HTTP/socket scenarios', 'real browser complete games'],
  };
  const markdown = formatScenarioReport(report);
  expect(markdown).toContain('Sweep games: 1884');
  expect(markdown).toContain('Covering-array rows: 628');
  expect(markdown).toContain('High-seat pairwise rows: 1100');
  expect(markdown).toContain('High-seat pairwise games: 5500');
  expect(markdown).toContain('Failure seeds: none');
  expect(markdown).toContain('HTTP/socket scenarios — NOT RUN');
  expect(markdown).not.toContain('full-stack verification passed');
});

it('separates generated Markdown lists from their lead-in text', () => {
  const markdown = formatScenarioReport({
    mode: 'sample',
    seed: 1,
    startedAt: '2026-10-13T10:00:00.000Z',
    durationMs: 1,
    sweepCells: 1,
    sweepGames: 2,
    coveringRows: 1,
    coveringGames: 5,
    highSeatCoveringRows: 1,
    highSeatCoveringGames: 5,
    fuzzGames: 1,
    goldenGames: 1,
    failures: ['Seed 1: example failure'],
    failureSeeds: [1],
    pendingLayers: ['HTTP/socket scenarios'],
  });

  expect(markdown).toContain('Failures:\n\n- Seed 1: example failure');
  expect(markdown).toContain(
    'remain release gates for their planned milestones:\n\n- HTTP/socket scenarios — NOT RUN',
  );
});
