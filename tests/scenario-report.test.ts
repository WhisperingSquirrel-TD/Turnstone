import { expect, it } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatScenarioReport,
  resolveScenarioReportPath,
  type ScenarioReport,
} from '../scripts/src/scenarios/report';
import { SCENARIO_PENDING_LAYERS } from '../scripts/src/scenarios/runner';

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

it('keeps the independent pot check explicitly pending until Milestone 7', () => {
  expect(SCENARIO_PENDING_LAYERS).toContain(
    'Independent pot validation — pending Milestone 7',
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

it('reports measured per-game and seat-normalised runner timing', () => {
  const markdown = formatScenarioReport({
    mode: 'sample',
    seed: 1,
    startedAt: '2026-10-13T10:00:00.000Z',
    durationMs: 1,
    sweepCells: 1,
    sweepGames: 10,
    coveringRows: 0,
    coveringGames: 0,
    highSeatCoveringRows: 0,
    highSeatCoveringGames: 0,
    fuzzGames: 0,
    goldenGames: 0,
    failures: [],
    failureSeeds: [],
    pendingLayers: [],
    gameProfiles: [
      {
        players: 5,
        games: 10,
        totalMs: 30,
        maxMs: 7,
      },
    ],
  } as ScenarioReport);

  expect(markdown).toContain('5 seats: 10 games, 3 ms/game');
  expect(markdown).toContain('0.12 ms/player²');
});
