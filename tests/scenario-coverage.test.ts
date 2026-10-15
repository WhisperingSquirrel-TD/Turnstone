import { expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { generateConstrainedArray } from '../scripts/src/scenarios/covering-array';
import { verifyThreeWayCoverage } from '../scripts/src/scenarios/coverage-checker';
import { gameConfigSchema } from '../lib/shared/src/index';
import { RULE_FACTORS } from '../scripts/src/scenarios/parameters';

it('covers every valid three-setting combination with valid configs', () => {
  const startedAt = performance.now();
  const requiredFactors = [
    'players.count',
    'players.lateJoining',
    'players.lateJoinCycle',
    'players.departureReveal',
    'traitors.number',
    'traitors.sleeper',
    'traitors.recruitment',
    'traitors.recruitmentBelow',
    'traitors.recruitmentStyle',
    'traitors.victimDecision',
    'traitors.timeoutChoice',
    'traitors.chat',
    'traitors.murders',
    'roundTable.debateMinutes',
    'roundTable.voteMinutes',
    'roundTable.changeVote',
    'roundTable.revealStyle',
    'roundTable.tieRule',
    'roundTable.revealRole',
    'roundTable.banishments',
    'missions.enabled',
    'missions.shields+allocation',
    'endgame.trigger',
    'endgame.at',
    'endgame.size',
    'endgame.endRule',
    'endgame.parity',
    'ghosts.seeRoles',
    'ghosts.finale',
    'ghosts.predictions',
    'ghosts.referee',
    'schedule.format',
    'tasks.enabled',
    'tasks.perCycle',
    'tasks.missedConsequence',
    'tasks.filter.family',
    'tasks.filter.office',
    'tasks.filter.adults-only',
    'tasks.filter.seated',
    'tasks.filter.remote-friendly',
  ];
  expect(RULE_FACTORS.map((factor) => factor.name)).toEqual(
    expect.arrayContaining(requiredFactors),
  );
  expect(RULE_FACTORS.map((factor) => factor.name)).not.toContain(
    'schedule.plannedCycles',
  );
  const rows = generateConstrainedArray(20261022);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.length).toBeLessThan(2_000);
  expect(rows.every((row) => gameConfigSchema.safeParse(row).success)).toBe(
    true,
  );
  expect(rows.every((row) => row.schedule.plannedCycles === null)).toBe(true);
  const coverage = verifyThreeWayCoverage(rows);
  expect(coverage.uncovered).toEqual([]);
  expect(coverage.covered).toBeGreaterThan(0);
  expect(performance.now() - startedAt).toBeLessThan(45_000);
}, 60_000);
