import { gameConfigSchema } from '@workspace/shared';
import type { GameConfig } from '@workspace/shared';

export type ParameterFactor = {
  name: string;
  values: readonly unknown[];
  set: (config: Record<string, unknown>, value: unknown) => void;
  get: (config: GameConfig) => unknown;
};

function setPath(
  config: Record<string, unknown>,
  path: string,
  value: unknown,
) {
  const parts = path.split('.');
  let node = config;
  for (const part of parts.slice(0, -1)) {
    const existing = node[part];
    if (
      typeof existing !== 'object' ||
      existing === null ||
      Array.isArray(existing)
    )
      node[part] = {};
    node = node[part] as Record<string, unknown>;
  }
  node[parts.at(-1)!] = value;
}

function getPath(config: unknown, path: string): unknown {
  let node = config;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

function pathFactor(
  name: string,
  values: readonly unknown[],
  path = name,
): ParameterFactor {
  return {
    name,
    values,
    set: (config, value) => setPath(config, path, value),
    get: (config) => getPath(config, path),
  };
}

const shieldAllocationOptions = [
  { shields: 'off', allocation: 'random' },
  { shields: 'public', allocation: 'coordinator' },
  { shields: 'public', allocation: 'random' },
  { shields: 'public', allocation: 'vote' },
  { shields: 'secret', allocation: 'random' },
  { shields: 'secret', allocation: 'vote' },
] as const;
const filterTags = [
  'family',
  'office',
  'adults-only',
  'seated',
  'remote-friendly',
] as const;

const shieldAllocationFactor: ParameterFactor = {
  name: 'missions.shields+allocation',
  values: shieldAllocationOptions,
  set: (config, value) => {
    const option = value as (typeof shieldAllocationOptions)[number];
    setPath(config, 'missions.shields', option.shields);
    setPath(config, 'missions.allocation', option.allocation);
  },
  get: (config) => ({
    shields: config.missions.shields,
    allocation: config.missions.allocation,
  }),
};

function filterFactor(tag: (typeof filterTags)[number]): ParameterFactor {
  return {
    name: `tasks.filter.${tag}`,
    values: [false, true],
    set: (config, enabled) => {
      const current = getPath(config, 'tasks.filters');
      const filters = Array.isArray(current) ? current : [];
      const next = filters.filter((item) => item !== tag);
      if (enabled) next.push(tag);
      setPath(config, 'tasks.filters', next);
    },
    get: (config) => config.tasks.filters.includes(tag),
  };
}

export const RULE_FACTORS: readonly ParameterFactor[] = [
  pathFactor('players.count', [5, 15, 40]),
  pathFactor('players.lateJoining', ['never', 'first-vote', 'cycle']),
  pathFactor('players.lateJoinCycle', [1, 2, 8, 40]),
  pathFactor('players.departureReveal', ['now', 'end']),
  pathFactor('traitors.number', ['auto', 1, 2, 3, 4, 5, 6, 7, 8]),
  pathFactor('schedule.format', ['quick', 'day', 'multi-day']),
  pathFactor('traitors.sleeper', [false, true, 'auto']),
  pathFactor('traitors.recruitment', ['off', 'banished', 'below']),
  pathFactor('traitors.recruitmentBelow', [1, 2, 8]),
  pathFactor('traitors.recruitmentStyle', ['offer', 'ultimatum']),
  pathFactor('traitors.victimDecision', ['majority', 'unanimous', 'first']),
  pathFactor('traitors.timeoutChoice', ['leading', 'random', 'none']),
  pathFactor('traitors.chat', [false, true]),
  pathFactor('traitors.murders', [0, 1, 2]),
  pathFactor('roundTable.debateMinutes', [2, 15, 60]),
  pathFactor('roundTable.voteMinutes', [1, 3, 10]),
  pathFactor('roundTable.changeVote', [false, true]),
  pathFactor('roundTable.revealStyle', ['one-by-one', 'all', 'anonymous']),
  pathFactor('roundTable.tieRule', ['revote-random', 'revote-none']),
  pathFactor('roundTable.contendersOnDraw', [false, true]),
  pathFactor('roundTable.revealRole', ['always', 'not-endgame', 'never']),
  pathFactor('roundTable.banishments', [1, 2]),
  pathFactor('missions.enabled', [false, true]),
  shieldAllocationFactor,
  pathFactor('tasks.enabled', [false, true]),
  pathFactor('tasks.perCycle', ['each', 'shared']),
  pathFactor('tasks.missedConsequence', ['none', 'lose-next-murder']),
  ...filterTags.map(filterFactor),
  pathFactor('endgame.trigger', ['alive', 'time', 'first']),
  pathFactor('endgame.at', [null, '2026-10-13T12:00:00.000Z']),
  pathFactor('endgame.size', ['auto', 3, 4, 8]),
  pathFactor('endgame.endRule', ['unanimous', 'majority']),
  pathFactor('endgame.parity', [false, true]),
  pathFactor('ghosts.seeRoles', [false, true]),
  pathFactor('ghosts.finale', ['off', 'collective', 'half']),
  pathFactor('ghosts.predictions', [false, true]),
  pathFactor('ghosts.referee', [false, true]),
];

export function inputForAssignments(
  assignments: ReadonlyMap<number, number>,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [factorIndex, valueIndex] of assignments) {
    const factor = RULE_FACTORS[factorIndex];
    if (!factor) throw new Error(`Unknown parameter factor ${factorIndex}`);
    factor.set(input, factor.values[valueIndex]);
  }
  return input;
}

export function configForAssignments(
  assignments: ReadonlyMap<number, number>,
  playerCount?: number,
): GameConfig | null {
  const input = inputForAssignments(assignments);
  if (playerCount !== undefined) setPath(input, 'players.count', playerCount);
  const parsed = gameConfigSchema.safeParse(input);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    schedule: { ...parsed.data.schedule, plannedCycles: null },
  };
}

export function configForRow(indices: readonly number[]): GameConfig | null {
  if (indices.length !== RULE_FACTORS.length) return null;
  return configForAssignments(
    new Map(
      indices.map((valueIndex, factorIndex) => [factorIndex, valueIndex]),
    ),
  );
}

export function valueIndexFor(config: GameConfig, factorIndex: number): number {
  const factor = RULE_FACTORS[factorIndex];
  if (!factor) throw new Error(`Unknown parameter factor ${factorIndex}`);
  const value = JSON.stringify(factor.get(config));
  const index = factor.values.findIndex(
    (option) => JSON.stringify(option) === value,
  );
  if (index < 0)
    throw new Error(`Config has unsupported value for ${factor.name}`);
  return index;
}
