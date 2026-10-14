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
  votes: Record<string, string>;
  revealed: string[];
  target: string | null;
  revote: boolean;
  candidates: string[];
  shadow: Record<string, string>;
  shadowRound: 0 | 1 | 2;
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
  publicLog: {
    seq: number;
    at: number;
    action: 'seat_pin_reset' | 'device_recovered';
    seatId: string;
  }[];
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
