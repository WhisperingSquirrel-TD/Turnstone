import type { GameConfig, Event, TaskDefinition } from '../../shared/src/index';
export type { Event };
export type Role = 'traitor' | 'faithful';
export type Phase =
  | 'DRAFT'
  | 'LOBBY'
  | 'DEAL'
  | 'MISSION'
  | 'DEBATE'
  | 'VOTE'
  | 'VERDICT'
  | 'SHADOW'
  | 'DAWN'
  | 'ENDGAME'
  | 'FINAL_VOTE'
  | 'FINAL_BANISH'
  | 'FINISHED'
  | 'ARCHIVED';
export type Actor = {
  kind: 'coordinator' | 'system' | 'player';
  seatId?: string;
};
export type Context = {
  now: number;
  actor: Actor;
  random: {
    int: (upperExclusive: number) => number;
    bytes: (length: number) => Uint8Array;
  };
  testOnlyPhaseDurationMs?: number;
  taskCatalog?: readonly TaskDefinition[];
};
export type TaskAssignment = {
  seatId: string;
  cycle: number;
  taskId: string | null;
  text: string;
  shared: boolean;
  status: 'assigned' | 'done' | 'missed' | 'void';
};
export type Seat = {
  id: string;
  name: string;
  role: Role | null;
  status: 'alive' | 'banished' | 'murdered' | 'departed';
  publicRole: boolean;
  traitorSince: number | null;
};
export type State = {
  id: string;
  config: GameConfig;
  version: number;
  phase: Phase;
  phaseStarted: number;
  deadline: number | null;
  shadowEndAt: number | null;
  paused: boolean;
  remaining: number | null;
  shadowRemaining: number | null;
  cycle: number;
  steps: number;
  maxCycles: number;
  seats: Seat[];
  deal: {
    roles: Record<string, Role>;
    salt: string;
    commitment: string;
    sleeper: string | null;
    redealUsed: boolean;
  } | null;
  acks: string[];
  readySeats?: string[];
  skippedActions: {
    seatId: string;
    phase: Phase;
    cycle: number;
    shadowSlot?: 1 | 2;
    shadowRound?: 1 | 2;
  }[];
  disconnectedRemovals: {
    seatId: string;
    phase: Phase;
    cycle: number;
    restorable: boolean;
    wasPublicRole: boolean;
  }[];
  hiddenRoleSeatIds: string[];
  votes: Record<string, string>;
  revealed: string[];
  voteRevealOrder: string[];
  voteContext: 'cycle' | 'final';
  target: string | null;
  revote: boolean;
  candidates: string[];
  shadow: Record<string, string>;
  shadowRound: 0 | 1 | 2;
  shadowSlot: 0 | 1 | 2;
  shadowPicks: {
    cycle: number;
    slot: 1 | 2;
    round: 1 | 2;
    seatId: string;
    choice: string;
    seq: number;
  }[];
  murderResolutions: {
    cycle: number;
    slot: 1 | 2;
    picks: { seatId: string; choice: string; round: 1 | 2 }[];
    chosen: string | null;
    outcome:
      'murdered' | 'protected' | 'no-target' | 'cancelled' | 'game-ended';
  }[];
  shields: string[];
  protected: string[];
  pendingSleeper: boolean;
  chat: { seatId: string; text: string; seq: number }[];
  endVotes: Record<string, 'end' | 'continue'>;
  pot: number;
  winner: Role | null;
  reason: string | null;
  firstVoteOccurred: boolean;
  taskAssignments: TaskAssignment[];
  taskReports: { seatId: string; cycle: number; answer: string }[];
  taskMurderCancelledCycles: {
    cycle: number;
    cancelled: boolean;
    traitors: string[];
  }[];
  publicLog: (
    | {
        seq: number;
        at: number;
        action: 'seat_pin_reset';
        seatId: string;
      }
    | {
        seq: number;
        at: number;
        action: 'device_recovered';
        seatId: string;
      }
    | {
        seq: number;
        at: number;
        action: 'banishment';
        seatId: string;
      }
    | {
        seq: number;
        at: number;
        action: 'seat_departed';
        seatId: string;
      }
    | {
        seq: number;
        at: number;
        action: 'seat_left_disconnected';
        seatId: string;
        reason: 'disconnected';
      }
    | {
        seq: number;
        at: number;
        action: 'seat_reinstated';
        seatId: string;
      }
    | {
        seq: number;
        at: number;
        action: 'coordinator_role_moved';
      }
    | {
        seq: number;
        at: number;
        action: 'phase_action_skipped';
        seatId: string;
        phase: Phase;
        reason: 'disconnected';
      }
    | {
        seq: number;
        at: number;
        action: 'phase_action_skip_undone';
        seatId: string;
        phase: Phase;
      }
    | {
        seq: number;
        at: number;
        action: 'no_votes';
      }
    | {
        seq: number;
        at: number;
        action: 'schedule_shift';
        minutes: number;
      }
    | {
        seq: number;
        at: number;
        action: 'coordinator_undo';
      }
    | {
        seq: number;
        at: number;
        action: 'dawn';
        victimIds: string[];
      }
    | {
        seq: number;
        at: number;
        action: 'finished';
        winner: Role;
      }
  )[];
  publicAnnouncement:
    | { kind: 'dawn'; cycle: number; victimIds: string[] }
    | { kind: 'verdict'; cycle: number; seatId: string }
    | { kind: 'no_votes'; cycle: number }
    | { kind: 'finished'; winner: Role }
    | null;
  coordinatorAlerts: {
    seq: number;
    at: number;
    code: 'seat_pin_locked';
    seatId: string;
    lockedUntil: number;
  }[];
};
export type Result =
  { ok: true; events: Event[] } | { ok: false; code: string };
export const alive = (state: State) =>
  state.seats.filter((seat) => seat.status === 'alive');

export function pendingActionSeatIds(state: State): string[] {
  const living = alive(state);
  switch (state.phase) {
    case 'DEAL':
      return living
        .filter(
          (seat) =>
            !(state.readySeats ?? []).includes(seat.id) &&
            !isActionSkipped(state, seat.id),
        )
        .map((seat) => seat.id);
    case 'VOTE':
    case 'FINAL_BANISH':
      return living
        .filter(
          (seat) =>
            state.votes[seat.id] === undefined &&
            !isActionSkipped(state, seat.id),
        )
        .map((seat) => seat.id);
    case 'FINAL_VOTE':
      return living
        .filter(
          (seat) =>
            state.endVotes[seat.id] === undefined &&
            !isActionSkipped(state, seat.id),
        )
        .map((seat) => seat.id);
    case 'SHADOW':
      return living
        .filter(
          (seat) =>
            !state.shadowPicks.some(
              (pick) =>
                pick.cycle === state.cycle &&
                pick.slot === state.shadowSlot &&
                pick.round === state.shadowRound &&
                pick.seatId === seat.id,
            ) && !isActionSkipped(state, seat.id),
        )
        .map((seat) => seat.id);
    default:
      return [];
  }
}

export function isActionSkipped(state: State, seatId: string): boolean {
  return state.skippedActions.some(
    (skip) =>
      skip.seatId === seatId &&
      skip.phase === state.phase &&
      skip.cycle === state.cycle &&
      (state.phase !== 'SHADOW' ||
        (skip.shadowSlot === state.shadowSlot &&
          skip.shadowRound === state.shadowRound)),
  );
}
