import { eventSchema, recommended } from '../../shared/src/index';
import type { State, Event } from './model';

export function evolve(previous: State | null, input: unknown): State {
  const event = eventSchema.parse(input);
  if (event.seq !== (previous?.version ?? 0) + 1)
    throw new Error('Non-contiguous event sequence');
  if (event.type === 'GameCreated') {
    if (previous) throw new Error('Game already exists');
    const final =
      event.config.endgame.size === 'auto'
        ? recommended(event.config.players.count).finalSize
        : event.config.endgame.size;
    return {
      id: event.id,
      config: event.config,
      version: event.seq,
      phase: 'DRAFT',
      phaseStarted: event.at,
      deadline: null,
      paused: false,
      remaining: null,
      cycle: 0,
      steps: 0,
      maxCycles:
        (event.config.schedule.plannedCycles ??
          Math.ceil((event.config.players.count - final) / 2)) + 3,
      seats: [],
      deal: null,
      acks: [],
      votes: {},
      revealed: [],
      target: null,
      revote: false,
      candidates: [],
      shadow: {},
      shields: [],
      protected: [],
      pendingSleeper: false,
      chat: [],
      endVotes: {},
      pot: 0,
      winner: null,
      reason: null,
      firstVoteOccurred: false,
    };
  }
  if (!previous) throw new Error('First event must create a game');
  const state = structuredClone(previous);
  state.version = event.seq;
  switch (event.type) {
    case 'SeatJoined':
      state.seats.push({
        id: event.seatId,
        name: event.name,
        role: state.deal ? 'faithful' : null,
        status: 'alive',
        publicRole: Boolean(state.deal),
        traitorSince: null,
      });
      break;
    case 'RolesDealt':
      state.deal = {
        roles: event.roles,
        salt: event.salt,
        commitment: event.commitment,
        sleeper: event.sleeper,
        redealUsed: event.redeal,
      };
      for (const seat of state.seats) {
        seat.role = event.roles[seat.id] ?? null;
        seat.traitorSince = seat.role === 'traitor' ? event.seq : null;
      }
      state.acks = [];
      state.shadow = {};
      state.chat = [];
      state.pendingSleeper = false;
      break;
    case 'PhaseChanged':
      state.phase = event.phase;
      state.phaseStarted = event.at;
      state.deadline = event.deadline;
      state.cycle = event.cycle;
      if (!['DRAFT', 'LOBBY', 'ENDGAME'].includes(event.phase)) state.steps++;
      if (['VOTE', 'FINAL_BANISH'].includes(event.phase)) {
        state.votes = {};
        state.revealed = [];
        state.target = null;
        if (!state.revote) state.candidates = [];
        state.firstVoteOccurred = true;
      }
      if (event.phase === 'SHADOW') {
        state.shadow = {};
        state.acks = [];
      }
      if (event.phase === 'FINAL_VOTE') state.endVotes = {};
      break;
    case 'PrivateAcknowledged':
      if (!state.acks.includes(event.seatId)) state.acks.push(event.seatId);
      break;
    case 'VoteSubmitted':
      state.votes[event.seatId] = event.target;
      break;
    case 'VoteRevealed':
      if (!state.revealed.includes(event.seatId))
        state.revealed.push(event.seatId);
      break;
    case 'VoteClosed':
      state.target = event.target;
      state.revote = event.revote;
      state.candidates = event.candidates;
      break;
    case 'ShadowSubmitted':
      state.shadow[event.seatId] = event.choice;
      if (!state.acks.includes(event.seatId)) state.acks.push(event.seatId);
      break;
    case 'SeatRemoved': {
      const seat = state.seats.find((s) => s.id === event.seatId);
      if (!seat || seat.status !== 'alive')
        throw new Error('Invalid elimination event');
      seat.status = event.reason;
      seat.publicRole = event.publicRole;
      delete state.votes[event.seatId];
      delete state.shadow[event.seatId];
      break;
    }
    case 'ShieldsAllocated':
      state.shields = event.holders;
      break;
    case 'DawnResolved':
      state.protected = event.protected;
      state.shields = [];
      break;
    case 'Paused':
      state.paused = true;
      state.remaining = event.remaining;
      state.deadline = null;
      break;
    case 'Resumed':
      state.paused = false;
      state.deadline = event.deadline;
      state.remaining = null;
      break;
    case 'DeadlineExtended':
      state.deadline = event.deadline;
      break;
    case 'SleeperWaiting':
      state.pendingSleeper = true;
      break;
    case 'SleeperActivated': {
      const seat = state.seats.find((s) => s.id === event.seatId);
      if (!seat || seat.status !== 'alive' || seat.role !== 'faithful')
        throw new Error('Invalid sleeper activation');
      seat.role = 'traitor';
      seat.traitorSince = event.seq;
      state.pendingSleeper = false;
      break;
    }
    case 'TraitorMessage':
      state.chat.push({
        seatId: event.seatId,
        text: event.text,
        seq: event.seq,
      });
      break;
    case 'EndgameVote':
      state.endVotes[event.seatId] = event.choice;
      break;
    case 'GameFinished':
      state.phase = 'FINISHED';
      state.winner = event.winner;
      state.reason = event.reason;
      state.deadline = null;
      state.paused = false;
      break;
  }
  return state;
}
export function replay(events: readonly Event[]): State {
  let state: State | null = null;
  for (const event of events) state = evolve(state, event);
  if (!state) throw new Error('Empty event stream');
  return state;
}
