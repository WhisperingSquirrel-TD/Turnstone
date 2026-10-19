import { gameConfigSchema } from '@workspace/shared';

export interface NewGameConfigInput {
  gameName: string;
  playerCount: number;
  presenterEnabled: boolean;
}

export function buildNewGameConfig(input: NewGameConfigInput) {
  return gameConfigSchema.parse({
    basics: {
      gameName: input.gameName,
      coordinatorPlays: true,
      coCoordinators: 0,
    },
    players: { count: input.playerCount },
    presenter: { enabled: input.presenterEnabled },
  });
}
