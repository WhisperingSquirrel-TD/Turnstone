import type { Event, Role } from '@workspace/engine';

type ReferenceSeat = {
  id: string;
  role: Role | null;
  status: 'alive' | 'banished' | 'murdered' | 'departed';
};

export type ReferenceResult = {
  seats: ReferenceSeat[];
  eliminated: string[];
  winner: Role | null;
  finished: boolean;
  pot: number;
};

/**
 * Deliberately replays only public domain facts from the event stream. It does
 * not call decide, evolve, or any engine projection/reducer code.
 */
export function referenceReplay(events: readonly Event[]): ReferenceResult {
  const seats = new Map<string, ReferenceSeat>();
  const eliminated: string[] = [];
  let winner: Role | null = null;
  let finished = false;
  const pot = 0;

  for (const event of events) {
    switch (event.type) {
      case 'GameCreated':
        if (seats.size || finished)
          throw new Error('Reference: duplicate game');
        break;
      case 'SeatJoined':
        if (seats.has(event.seatId))
          throw new Error('Reference: duplicate seat');
        seats.set(event.seatId, {
          id: event.seatId,
          role: null,
          status: 'alive',
        });
        break;
      case 'RolesDealt': {
        const roles = { ...event.roles };
        for (const seat of seats.values()) seat.role = roles[seat.id] ?? null;
        break;
      }
      case 'SeatRemoved': {
        const seat = seats.get(event.seatId);
        if (!seat || seat.status !== 'alive')
          throw new Error('Reference: invalid elimination');
        seat.status = event.reason;
        eliminated.push(event.seatId);
        break;
      }
      case 'SleeperActivated': {
        const seat = seats.get(event.seatId);
        if (!seat || seat.status !== 'alive' || seat.role !== 'faithful')
          throw new Error('Reference: invalid sleeper');
        seat.role = 'traitor';
        break;
      }
      case 'GameFinished': {
        if (finished) throw new Error('Reference: duplicate finish');
        const living = [...seats.values()].filter(
          (seat) => seat.status === 'alive',
        );
        const traitors = living.filter((seat) => seat.role === 'traitor');
        const expected =
          event.reason === 'no-traitors'
            ? 'faithful'
            : event.reason === 'parity' || event.reason === 'two-players'
              ? 'traitor'
              : event.reason === 'end-vote' || event.reason === 'ended-early'
                ? traitors.length
                  ? 'traitor'
                  : 'faithful'
                : null;
        if (!expected || expected !== event.winner)
          throw new Error('Reference: winner does not follow the finish rule');
        if (event.reason === 'no-traitors' && traitors.length)
          throw new Error('Reference: Traitors remain after Faithful win');
        if (
          event.reason === 'parity' &&
          (traitors.length < 1 ||
            traitors.length < living.length - traitors.length)
        )
          throw new Error('Reference: parity threshold not reached');
        if (
          event.reason === 'two-players' &&
          (living.length > 2 || traitors.length < 1)
        )
          throw new Error('Reference: two-player finish is invalid');
        winner = expected;
        finished = true;
        break;
      }
      case 'PhaseChanged':
      case 'PrivateAcknowledged':
      case 'VoteSubmitted':
      case 'VoteRevealed':
      case 'VoteClosed':
      case 'ShadowSubmitted':
      case 'TaskAssigned':
      case 'TaskReported':
      case 'TaskDecoyAnswered':
      case 'TaskMurderCancelled':
      case 'ShieldsAllocated':
      case 'DawnResolved':
      case 'Paused':
      case 'Resumed':
      case 'DeadlineExtended':
      case 'SleeperWaiting':
      case 'TraitorMessage':
      case 'EndgameVote':
        break;
    }
  }

  return {
    seats: [...seats.values()],
    eliminated,
    winner,
    finished,
    pot,
  };
}
