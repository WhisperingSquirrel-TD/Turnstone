import { gameConfigSchema } from '@workspace/shared';

export interface NewGameConfigInput {
  gameName: string;
  playerCount: number;
  coCoordinatorCount: number;
  presenterEnabled: boolean;
}

export function buildNewGameConfig(input: NewGameConfigInput) {
  return gameConfigSchema.parse({
    basics: {
      gameName: input.gameName,
      coordinatorPlays: true,
      coCoordinators: input.coCoordinatorCount,
    },
    players: { count: input.playerCount },
    presenter: { enabled: input.presenterEnabled },
  });
}
