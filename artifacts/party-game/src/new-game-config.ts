import { gameConfigSchema } from '@workspace/shared';
import { config } from './config';

export interface NewGameConfigInput {
  gameName: string;
  playerCount: number;
  coCoordinatorCount: number;
  presenterEnabled: boolean;
  revealStyle?: 'speaker-circle' | 'one-by-one';
  contendersOnDraw?: boolean;
  parityWin?: boolean;
  timingPreset?: GameTimingPreset;
}

export type GameTimingPreset = 'default' | 'quick' | 'multi-day';

const timingPresets: Record<
  GameTimingPreset,
  {
    format: 'day' | 'quick' | 'multi-day';
    debateMinutes: number;
    voteMinutes: number;
  }
> = {
  default: { format: 'day', debateMinutes: 15, voteMinutes: 3 },
  quick: { format: 'quick', debateMinutes: 6, voteMinutes: 2 },
  'multi-day': { format: 'multi-day', debateMinutes: 30, voteMinutes: 10 },
};

export function buildNewGameConfig(input: NewGameConfigInput) {
  const timing = timingPresets[input.timingPreset ?? 'default'];
  return gameConfigSchema.parse({
    basics: {
      gameName: input.gameName,
      coordinatorPlays: true,
      coCoordinators: input.coCoordinatorCount,
    },
    players: { count: input.playerCount },
    presenter: { enabled: input.presenterEnabled },
    roundTable: {
      debateMinutes: timing.debateMinutes,
      voteMinutes: timing.voteMinutes,
      revealStyle: input.revealStyle ?? 'speaker-circle',
      // D120: on by default for new games; the schema default stays off so
      // older games replay with their original rule.
      contendersOnDraw: input.contendersOnDraw ?? true,
    },
    // D121: the organiser chooses at setup; on by default.
    endgame: { parity: input.parityWin ?? true },
    // Missions have no content yet; games show a notice instead (MISSIONS-REVIEW).
    // The round table agrees the shield holder and the organiser records it (D109).
    missions: {
      enabled: config.missionsAvailable,
      shields: 'public',
      allocation: 'coordinator',
    },
    schedule: {
      format: timing.format,
      advancement: 'hybrid',
    },
  });
}
