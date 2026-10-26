import { gameConfigSchema } from '@workspace/shared';

export interface NewGameConfigInput {
  gameName: string;
  playerCount: number;
  coCoordinatorCount: number;
  presenterEnabled: boolean;
  revealStyle?: 'speaker-circle' | 'one-by-one';
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
    roundTable: {
      revealStyle: input.revealStyle ?? 'speaker-circle',
    },
    // Missions have no content yet; games show a notice instead (MISSIONS-REVIEW).
    missions: { enabled: false },
  });
}
