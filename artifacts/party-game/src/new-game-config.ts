import { gameConfigSchema } from '@workspace/shared';
import { config } from './config';

export interface NewGameConfigInput {
  gameName: string;
  playerCount: number;
  coCoordinatorCount: number;
  presenterEnabled: boolean;
  revealStyle?: 'speaker-circle' | 'one-by-one';
  contendersOnDraw?: boolean;
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
      // D120: on by default for new games; the schema default stays off so
      // older games replay with their original rule.
      contendersOnDraw: input.contendersOnDraw ?? true,
    },
    // Missions have no content yet; games show a notice instead (MISSIONS-REVIEW).
    // The round table agrees the shield holder and the organiser records it (D109).
    missions: {
      enabled: config.missionsAvailable,
      shields: 'public',
      allocation: 'coordinator',
    },
  });
}
