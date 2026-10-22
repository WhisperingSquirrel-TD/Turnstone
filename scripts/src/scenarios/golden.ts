import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { gameConfigSchema, roleSchema } from '@workspace/shared';
import type { GameConfig } from '@workspace/shared';
import { BOT_STRATEGIES, GOLDEN_ONLY_BOT_STRATEGIES } from './simulate';
import type { BotStrategy } from './simulate';

const scenarioStrategies: readonly string[] = [
  ...BOT_STRATEGIES,
  ...GOLDEN_ONLY_BOT_STRATEGIES,
];

export type GoldenScenario = {
  id: string;
  description: string;
  seed: number;
  strategy: BotStrategy;
  config: GameConfig;
  expected: {
    phase: 'FINISHED';
    winner: ReturnType<typeof roleSchema.parse>;
    reason: string;
    alive: number;
    eliminated: number;
  };
  assertions?: {
    shadowSplitAfterRevote?: boolean;
    noVoteRound?: boolean;
    noVoteInitialRound?: boolean;
    noVoteRevote?: boolean;
    abstainedEndgameBanishment?: boolean;
    doubleMurderSplit?: boolean;
    faithfulSelfPrediction?: boolean;
  };
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseScenario(input: unknown, filename: string): GoldenScenario {
  if (
    !record(input) ||
    !record(input.config) ||
    !record(input.expected) ||
    (input.assertions !== undefined && !record(input.assertions))
  )
    throw new Error(`Golden scenario ${filename} must contain objects`);
  const assertions = input.assertions;
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
    !scenarioStrategies.includes(input.strategy) ||
    input.expected.phase !== 'FINISHED' ||
    typeof input.expected.reason !== 'string' ||
    !Number.isInteger(input.expected.alive) ||
    !Number.isInteger(input.expected.eliminated) ||
    [
      'shadowSplitAfterRevote',
      'noVoteRound',
      'noVoteInitialRound',
      'noVoteRevote',
      'abstainedEndgameBanishment',
      'doubleMurderSplit',
      'faithfulSelfPrediction',
    ].some(
      (key) =>
        assertions?.[key] !== undefined && typeof assertions[key] !== 'boolean',
    )
  )
    throw new Error(`Golden scenario ${filename} has invalid metadata`);
  return {
    id: input.id,
    description: input.description,
    seed: input.seed,
    strategy: input.strategy as BotStrategy,
    config: config.data,
    expected: {
      phase: 'FINISHED',
      winner: winner.data,
      reason: input.expected.reason,
      alive: input.expected.alive as number,
      eliminated: input.expected.eliminated as number,
    },
    ...(assertions === undefined
      ? {}
      : {
          assertions: {
            ...(typeof assertions.shadowSplitAfterRevote === 'boolean'
              ? { shadowSplitAfterRevote: assertions.shadowSplitAfterRevote }
              : {}),
            ...(typeof assertions.noVoteRound === 'boolean'
              ? { noVoteRound: assertions.noVoteRound }
              : {}),
            ...(typeof assertions.noVoteInitialRound === 'boolean'
              ? { noVoteInitialRound: assertions.noVoteInitialRound }
              : {}),
            ...(typeof assertions.noVoteRevote === 'boolean'
              ? { noVoteRevote: assertions.noVoteRevote }
              : {}),
            ...(typeof assertions.abstainedEndgameBanishment === 'boolean'
              ? {
                  abstainedEndgameBanishment:
                    assertions.abstainedEndgameBanishment,
                }
              : {}),
            ...(typeof assertions.doubleMurderSplit === 'boolean'
              ? { doubleMurderSplit: assertions.doubleMurderSplit }
              : {}),
            ...(typeof assertions.faithfulSelfPrediction === 'boolean'
              ? { faithfulSelfPrediction: assertions.faithfulSelfPrediction }
              : {}),
          },
        }),
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
