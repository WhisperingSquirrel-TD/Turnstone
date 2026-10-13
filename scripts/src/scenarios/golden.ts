import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { gameConfigSchema, roleSchema } from '@workspace/shared';
import type { GameConfig } from '@workspace/shared';
import { BOT_STRATEGIES } from './simulate';

export type GoldenScenario = {
  id: string;
  description: string;
  seed: number;
  strategy: (typeof BOT_STRATEGIES)[number];
  config: GameConfig;
  expected: {
    phase: 'FINISHED';
    winner: ReturnType<typeof roleSchema.parse>;
    reason: string;
    alive: number;
    eliminated: number;
  };
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseScenario(input: unknown, filename: string): GoldenScenario {
  if (!record(input) || !record(input.config) || !record(input.expected))
    throw new Error(`Golden scenario ${filename} must contain objects`);
  const config = gameConfigSchema.safeParse(input.config);
  const winner = roleSchema.safeParse(input.expected.winner);
  if (!config.success)
    throw new Error(`Golden scenario ${filename} has an invalid config`);
  if (!winner.success)
    throw new Error(`Golden scenario ${filename} has an invalid winner`);
  if (
    typeof input.id !== 'string' ||
    typeof input.description !== 'string' ||
    typeof input.seed !== 'number' ||
    !Number.isInteger(input.seed) ||
    input.seed < 0 ||
    typeof input.strategy !== 'string' ||
    !BOT_STRATEGIES.includes(
      input.strategy as (typeof BOT_STRATEGIES)[number],
    ) ||
    input.expected.phase !== 'FINISHED' ||
    typeof input.expected.reason !== 'string' ||
    !Number.isInteger(input.expected.alive) ||
    !Number.isInteger(input.expected.eliminated)
  )
    throw new Error(`Golden scenario ${filename} has invalid metadata`);
  return {
    id: input.id,
    description: input.description,
    seed: input.seed,
    strategy: input.strategy as (typeof BOT_STRATEGIES)[number],
    config: config.data,
    expected: {
      phase: 'FINISHED',
      winner: winner.data,
      reason: input.expected.reason,
      alive: input.expected.alive as number,
      eliminated: input.expected.eliminated as number,
    },
  };
}

export function loadGoldenScenarios(): GoldenScenario[] {
  const directory = join(dirname(fileURLToPath(import.meta.url)), 'goldens');
  return readdirSync(directory)
    .filter((filename) => filename.endsWith('.yaml'))
    .sort()
    .map((filename) => {
      const input = parse(readFileSync(join(directory, filename), 'utf8'));
      const scenario = parseScenario(input, filename);
      if (
        scenario.expected.alive + scenario.expected.eliminated !==
        scenario.config.players.count
      )
        throw new Error(
          `Golden scenario ${scenario.id} has an invalid seat total`,
        );
      return scenario;
    });
}
