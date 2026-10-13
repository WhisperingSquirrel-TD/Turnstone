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
      shadowEndAt: null,
      paused: false,
      remaining: null,
      shadowRemaining: null,
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
      shadowRound: 0,
      shields: [],
      protected: [],
      pendingSleeper: false,
      chat: [],
      endVotes: {},
      pot: 0,
      winner: null,
      reason: null,
      firstVoteOccurred: false,
      taskAssignments: [],
      taskReports: [],
      taskMurderCancelledCycles: [],
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
      state.taskAssignments = [];
      state.taskReports = [];
      state.taskMurderCancelledCycles = [];
      break;
    case 'PhaseChanged':
      state.phase = event.phase;
      state.phaseStarted = event.at;
      state.deadline = event.deadline;
      state.shadowEndAt = event.shadowEndAt;
      state.cycle = event.cycle;
      if (!['DRAFT', 'LOBBY', 'ENDGAME', 'FINAL_BANISH'].includes(event.phase))
        state.steps++;
      if (['VOTE', 'FINAL_BANISH'].includes(event.phase)) {
        state.votes = {};
        state.revealed = [];
        state.target = null;
        if (!state.revote) state.candidates = [];
        state.firstVoteOccurred = true;
      }
      if (event.phase === 'SHADOW') {
        state.shadow = {};
        state.shadowRound = 1;
        state.acks = [];
      } else {
        state.shadowRound = 0;
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
    case 'ShadowRoundAdvanced':
      if (state.phase !== 'SHADOW' || state.shadowRound !== 1)
        throw new Error('Invalid shadow round transition');
      state.shadowRound = 2;
      state.deadline = event.deadline;
      state.shadow = {};
      state.acks = [];
      break;
    case 'TaskAssigned':
      state.taskAssignments.push({
        seatId: event.seatId,
        cycle: event.cycle,
        taskId: event.task?.id ?? null,
        text: event.task?.text ?? 'Keep watch today: who is acting oddly?',
        shared: event.shared,
        status: 'assigned',
      });
      break;
    case 'TaskReported': {
      const task = state.taskAssignments.find(
        (item) =>
          item.seatId === event.seatId &&
          item.cycle === event.cycle &&
          item.status !== 'void',
      );
      if (!task) throw new Error('Task report has no live assignment');
      task.status = event.report;
      break;
    }
    case 'TaskDecoyAnswered': {
      const prior = state.taskReports.find(
        (item) => item.seatId === event.seatId && item.cycle === event.cycle,
      );
      if (prior) prior.answer = event.answer;
      else
        state.taskReports.push({
          seatId: event.seatId,
          cycle: event.cycle,
          answer: event.answer,
        });
      break;
    }
    case 'TaskMurderCancelled':
      state.taskMurderCancelledCycles.push({
        cycle: event.cycle,
        cancelled: event.cancelled,
        traitors: event.traitors,
      });
      break;
    case 'SeatRemoved': {
      const seat = state.seats.find((s) => s.id === event.seatId);
      if (!seat || seat.status !== 'alive')
        throw new Error('Invalid elimination event');
      seat.status = event.reason;
      seat.publicRole = event.publicRole;
      for (const task of state.taskAssignments)
        if (task.seatId === event.seatId && task.status === 'assigned')
          task.status = 'void';
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
      state.shadowRemaining = event.shadowRemaining;
      state.deadline = null;
      state.shadowEndAt = null;
      break;
    case 'Resumed':
      state.paused = false;
      state.deadline = event.deadline;
      state.shadowEndAt = event.shadowEndAt;
      state.remaining = null;
      state.shadowRemaining = null;
      break;
    case 'DeadlineExtended':
      state.deadline = event.deadline;
      state.shadowEndAt = event.shadowEndAt;
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
      state.shadowEndAt = null;
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
