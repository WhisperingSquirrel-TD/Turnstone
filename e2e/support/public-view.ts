import type { FullView } from '../../lib/shared/src/contracts';

export const coldSeatGameId = 'mobile-cold-seat';
export const coldSeatToken = 'A'.repeat(43);

export function createPublicView(gameId: string): FullView {
  return {
    id: gameId,
    viewerSeatId: 'seat-morgan',
    canAdvancePhase: false,
    gameName: 'Saturday gathering',
    version: 12,
    phase: 'DEBATE',
    paused: false,
    deadline: Date.now() + 60_000,
    coordinatorPlays: true,
    cycle: 2,
    revote: false,
    shadowRound: 0,
    shadowSlot: 0,
    murderSlots: 1,
    endRule: 'unanimous',
    missionsEnabled: true,
    rehearsal: false,
    pot: 18,
    unit: 'points',
    seats: [
      { id: 'seat-morgan', name: 'Morgan', status: 'alive' },
      { id: 'seat-alex', name: 'Alex', status: 'departed' },
      { id: 'seat-jamie', name: 'Jamie', status: 'alive' },
    ],
    commitment: null,
    progress: { done: 0, total: 2 },
    actionStatus: { waiting: 0, total: 2 },
    votedSeatIds: [],
    voteCandidates: [],
    ballots: {},
    winner: null,
    publicAnnouncement: null,
    private: null,
    publicLog: [
      {
        seq: 11,
        at: Date.now() - 120_000,
        action: 'device_recovered',
        seatId: 'seat-alex',
        name: 'Alex',
      },
      {
        seq: 12,
        at: Date.now() - 60_000,
        action: 'seat_pin_reset',
        seatId: 'seat-morgan',
        name: 'Morgan',
      },
    ],
    coordinatorUndo: null,
    coordinatorAlerts: [],
    fairness: null,
  } as FullView;
}
