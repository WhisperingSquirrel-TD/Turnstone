import { eventSchema, recommended } from '../../shared/src/index';
import type { State, Event } from './model';

function scheduleCompletedEndgameVote(state: State, actionAt: number): void {
  if (
    state.phase !== 'FINAL_VOTE' ||
    state.config.rehearsal.enabled ||
    state.deadline === null
  )
    return;

  const living = state.seats.filter((seat) => seat.status === 'alive');
  if (
    !living.length ||
    !living.every(
      (seat) =>
        state.endVotes[seat.id] !== undefined && state.acks.includes(seat.id),
    )
  )
    return;

  const minimumAt =
    state.phaseStarted +
    state.config.privacy.shieldSeconds * 1000 +
    state.config.privacy.holdMs;
  const nextDeadline = Math.max(minimumAt, actionAt);
  if (state.deadline > nextDeadline) state.deadline = nextDeadline;
}

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
      readySeats: [],
      skippedActions: [],
      disconnectedRemovals: [],
      hiddenRoleSeatIds: [],
      votes: {},
      revealed: [],
      voteRevealOrder: [],
      voteContext: 'cycle',
      target: null,
      revote: false,
      candidates: [],
      shadow: {},
      shadowRound: 0,
      shadowSlot: 0,
      shadowPicks: [],
      murderResolutions: [],
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
      publicLog: [],
      publicAnnouncement: null,
      coordinatorAlerts: [],
    };
  }
  if (!previous) throw new Error('First event must create a game');
  // State is immutable. Copy only the branch changed by this event rather
  // than cloning every seat, ballot, task and chat message on every replay.
  const state: State = {
    ...previous,
    version: event.seq,
    publicLog: previous.publicLog ?? [],
    coordinatorAlerts: previous.coordinatorAlerts ?? [],
    skippedActions: previous.skippedActions ?? [],
    disconnectedRemovals: previous.disconnectedRemovals ?? [],
    hiddenRoleSeatIds: previous.hiddenRoleSeatIds ?? [],
  };
  switch (event.type) {
    case 'SeatJoined':
      state.seats = [
        ...previous.seats,
        {
          id: event.seatId,
          name: event.name,
          role: state.deal ? 'faithful' : null,
          status: 'alive',
          publicRole: Boolean(state.deal),
          traitorSince: null,
        },
      ];
      break;
    case 'SeatPinLocked':
      state.coordinatorAlerts = [
        ...state.coordinatorAlerts,
        {
          seq: event.seq,
          at: event.at,
          code: 'seat_pin_locked',
          seatId: event.seatId,
          lockedUntil: event.lockedUntil,
        },
      ];
      break;
    case 'SeatPinReset':
    case 'DeviceRecovered':
      state.publicLog = [
        ...state.publicLog,
        {
          seq: event.seq,
          at: event.at,
          action:
            event.type === 'SeatPinReset'
              ? 'seat_pin_reset'
              : 'device_recovered',
          seatId: event.seatId,
        },
      ];
      if (event.type === 'SeatPinReset') {
        state.coordinatorAlerts = state.coordinatorAlerts.filter(
          (alert) => alert.seatId !== event.seatId,
        );
      }
      break;
    case 'RolesDealt':
      state.deal = {
        roles: event.roles,
        salt: event.salt,
        commitment: event.commitment,
        sleeper: event.sleeper,
        redealUsed: event.redeal,
      };
      state.seats = previous.seats.map((seat) => {
        const role = event.roles[seat.id] ?? null;
        return {
          ...seat,
          role,
          traitorSince: role === 'traitor' ? event.seq : null,
        };
      });
      state.acks = [];
      state.readySeats = [];
      state.shadow = {};
      state.chat = [];
      state.pendingSleeper = false;
      state.taskAssignments = [];
      state.taskReports = [];
      state.taskMurderCancelledCycles = [];
      break;
    case 'PhaseChanged':
      if (previous.phase === 'VERDICT' && event.phase !== 'VERDICT') {
        state.votes = {};
        state.revealed = [];
      }
      state.phase = event.phase;
      state.readySeats = [];
      state.skippedActions = [];
      state.disconnectedRemovals = state.disconnectedRemovals.map(
        (removal) => ({
          ...removal,
          restorable: false,
        }),
      );
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
      if (
        ['DEAL', 'SHADOW', 'VOTE', 'FINAL_VOTE', 'FINAL_BANISH'].includes(
          event.phase,
        )
      )
        state.acks = [];
      if (event.phase === 'SHADOW') {
        state.shadow = {};
        state.shadowRound = 1;
        state.shadowSlot = 1;
      } else {
        state.shadowRound = 0;
        state.shadowSlot = 0;
      }
      if (event.phase === 'FINAL_VOTE') state.endVotes = {};
      break;
    case 'PrivateAcknowledged':
      if (!previous.acks.includes(event.seatId))
        state.acks = [...previous.acks, event.seatId];
      if (previous.phase === 'DEAL' && event.ready === true)
        state.readySeats = [
          ...new Set([...(previous.readySeats ?? []), event.seatId]),
        ];
      scheduleCompletedEndgameVote(state, event.at);
      break;
    case 'PhaseActionSkipped': {
      const seat = previous.seats.find(
        (candidate) => candidate.id === event.seatId,
      );
      if (
        !seat ||
        seat.status !== 'alive' ||
        previous.phase !== event.phase ||
        previous.cycle !== event.cycle
      )
        throw new Error('Invalid skipped phase action');
      const matchesCurrentAction = (skip: State['skippedActions'][number]) =>
        skip.seatId === event.seatId &&
        skip.phase === event.phase &&
        skip.cycle === event.cycle &&
        (event.phase !== 'SHADOW' ||
          (skip.shadowSlot === event.shadowSlot &&
            skip.shadowRound === event.shadowRound));
      if (previous.skippedActions.some(matchesCurrentAction))
        throw new Error('Phase action already skipped');
      state.skippedActions = [
        ...previous.skippedActions,
        {
          seatId: event.seatId,
          phase: event.phase,
          cycle: event.cycle,
          ...(event.shadowSlot === undefined
            ? {}
            : { shadowSlot: event.shadowSlot }),
          ...(event.shadowRound === undefined
            ? {}
            : { shadowRound: event.shadowRound }),
        },
      ];
      state.publicLog = [
        ...state.publicLog,
        {
          seq: event.seq,
          at: event.at,
          action: 'phase_action_skipped',
          seatId: event.seatId,
          phase: event.phase,
          reason: 'disconnected',
        },
      ];
      break;
    }
    case 'PhaseActionSkipUndone': {
      const matchesCurrentAction = (skip: State['skippedActions'][number]) =>
        skip.seatId === event.seatId &&
        skip.phase === event.phase &&
        skip.cycle === event.cycle &&
        (event.phase !== 'SHADOW' ||
          (skip.shadowSlot === event.shadowSlot &&
            skip.shadowRound === event.shadowRound));
      const skipped = previous.skippedActions.some(matchesCurrentAction);
      const seat = previous.seats.find(
        (candidate) => candidate.id === event.seatId,
      );
      if (!skipped || !seat || seat.status !== 'alive')
        throw new Error('No current phase action skip to undo');
      state.skippedActions = previous.skippedActions.filter(
        (skip) => !matchesCurrentAction(skip),
      );
      state.publicLog = [
        ...state.publicLog,
        {
          seq: event.seq,
          at: event.at,
          action: 'phase_action_skip_undone',
          seatId: event.seatId,
          phase: event.phase,
        },
      ];
      break;
    }
    case 'VoteSubmitted':
      state.votes = { ...previous.votes, [event.seatId]: event.target };
      break;
    case 'VoteRevealed':
      if (!previous.revealed.includes(event.seatId)) {
        const expected = previous.voteRevealOrder.find(
          (seatId) => !previous.revealed.includes(seatId),
        );
        if (previous.voteRevealOrder.length && expected !== event.seatId)
          throw new Error('Vote reveal order is invalid');
        state.revealed = [...previous.revealed, event.seatId];
      }
      break;
    case 'VoteClosed':
      state.target = event.target;
      state.revote = event.revote;
      state.candidates = event.candidates;
      state.voteRevealOrder = event.revealOrder ?? [];
      state.voteContext =
        event.context ??
        (previous.phase === 'FINAL_BANISH' ? 'final' : 'cycle');
      state.revealed = [];
      break;
    case 'VoteSkipped':
      if (previous.phase !== 'VOTE')
        throw new Error('VoteSkipped outside a non-endgame ballot');
      state.target = null;
      state.revote = false;
      state.candidates = [];
      state.publicAnnouncement = {
        kind: 'no_votes',
        cycle: previous.cycle,
      };
      state.publicLog = [
        ...state.publicLog,
        {
          seq: event.seq,
          at: event.at,
          action: 'no_votes',
        },
      ];
      break;
    case 'ShadowSubmitted':
      state.shadow = { ...previous.shadow, [event.seatId]: event.choice };
      {
        const slot = event.slot ?? previous.shadowSlot;
        const round = event.round ?? previous.shadowRound;
        const pick = {
          cycle: previous.cycle,
          slot: slot as 1 | 2,
          round: round as 1 | 2,
          seatId: event.seatId,
          choice: event.choice,
          seq: event.seq,
        };
        const priorPickIndex = previous.shadowPicks.findIndex(
          (prior) =>
            prior.cycle === pick.cycle &&
            prior.slot === pick.slot &&
            prior.round === pick.round &&
            prior.seatId === pick.seatId,
        );
        state.shadowPicks =
          priorPickIndex < 0
            ? [...previous.shadowPicks, pick]
            : previous.shadowPicks.map((prior, index) =>
                index === priorPickIndex ? pick : prior,
              );
      }
      if (!previous.acks.includes(event.seatId))
        state.acks = [...previous.acks, event.seatId];
      break;
    case 'ShadowRoundAdvanced':
      if (
        state.phase !== 'SHADOW' ||
        state.shadowRound !== 1 ||
        (event.slot ?? state.shadowSlot) !== state.shadowSlot
      )
        throw new Error('Invalid shadow round transition');
      state.shadowRound = 2;
      state.deadline = event.deadline;
      state.shadow = {};
      state.acks = [];
      state.skippedActions = [];
      break;
    case 'ShadowSlotAdvanced':
      if (
        state.phase !== 'SHADOW' ||
        state.shadowSlot !== 1 ||
        state.shadowRound !== 2 ||
        event.cycle !== state.cycle
      )
        throw new Error('Invalid shadow slot transition');
      state.shadowSlot = event.slot;
      state.shadowRound = 1;
      state.phaseStarted = event.at;
      state.deadline = event.deadline;
      state.shadowEndAt = event.shadowEndAt;
      state.shadow = {};
      state.acks = [];
      state.skippedActions = [];
      break;
    case 'MurderSlotResolved':
      state.murderResolutions = [
        ...previous.murderResolutions,
        {
          cycle: event.cycle,
          slot: event.slot,
          picks: event.picks,
          chosen: event.chosen,
          outcome: event.outcome,
        },
      ];
      break;
    case 'TaskAssigned':
      state.taskAssignments = [
        ...previous.taskAssignments,
        {
          seatId: event.seatId,
          cycle: event.cycle,
          taskId: event.task?.id ?? null,
          text: event.task?.text ?? 'Keep watch today: who is acting oddly?',
          shared: event.shared,
          status: 'assigned',
        },
      ];
      break;
    case 'TaskReported': {
      const index = previous.taskAssignments.findIndex(
        (item) =>
          item.seatId === event.seatId &&
          item.cycle === event.cycle &&
          item.status !== 'void',
      );
      if (index < 0) throw new Error('Task report has no live assignment');
      state.taskAssignments = previous.taskAssignments.map((task, taskIndex) =>
        taskIndex === index ? { ...task, status: event.report } : task,
      );
      break;
    }
    case 'TaskDecoyAnswered': {
      const index = previous.taskReports.findIndex(
        (item) => item.seatId === event.seatId && item.cycle === event.cycle,
      );
      if (index >= 0)
        state.taskReports = previous.taskReports.map((prior, reportIndex) =>
          reportIndex === index ? { ...prior, answer: event.answer } : prior,
        );
      else
        state.taskReports = [
          ...previous.taskReports,
          {
            seatId: event.seatId,
            cycle: event.cycle,
            answer: event.answer,
          },
        ];
      break;
    }
    case 'TaskMurderCancelled':
      state.taskMurderCancelledCycles = [
        ...previous.taskMurderCancelledCycles,
        {
          cycle: event.cycle,
          cancelled: event.cancelled,
          traitors: event.traitors,
        },
      ];
      break;
    case 'SeatRemoved': {
      const seat = previous.seats.find((s) => s.id === event.seatId);
      if (!seat || seat.status !== 'alive')
        throw new Error('Invalid elimination event');
      state.seats = previous.seats.map((candidate) =>
        candidate.id === event.seatId
          ? {
              ...candidate,
              status: event.reason,
              publicRole: event.publicRole,
            }
          : candidate,
      );
      if (event.reason === 'banished') {
        state.publicAnnouncement = {
          kind: 'verdict',
          cycle: previous.cycle,
          seatId: event.seatId,
        };
        state.publicLog = [
          ...state.publicLog,
          {
            seq: event.seq,
            at: event.at,
            action: 'banishment',
            seatId: event.seatId,
          },
        ];
      } else if (event.reason === 'departed') {
        state.publicLog = [
          ...state.publicLog,
          {
            seq: event.seq,
            at: event.at,
            action: 'seat_departed',
            seatId: event.seatId,
          },
        ];
      }
      state.taskAssignments = previous.taskAssignments.map((task) =>
        task.seatId === event.seatId && task.status === 'assigned'
          ? { ...task, status: 'void' }
          : task,
      );
      state.votes = { ...previous.votes };
      if (!(event.reason === 'banished' && previous.phase === 'VERDICT'))
        delete state.votes[event.seatId];
      state.shadow = { ...previous.shadow };
      delete state.shadow[event.seatId];
      break;
    }
    case 'DisconnectedSeatRemoved': {
      const seat = previous.seats.find(
        (candidate) => candidate.id === event.seatId,
      );
      if (!seat || seat.status !== 'alive')
        throw new Error('Invalid disconnected removal event');
      state.seats = previous.seats.map((candidate) =>
        candidate.id === event.seatId
          ? { ...candidate, status: 'departed', publicRole: false }
          : candidate,
      );
      state.hiddenRoleSeatIds = [
        ...new Set([...previous.hiddenRoleSeatIds, event.seatId]),
      ];
      state.disconnectedRemovals = [
        ...previous.disconnectedRemovals,
        {
          seatId: event.seatId,
          phase: event.phase,
          cycle: event.cycle,
          restorable: true,
          wasPublicRole: seat.publicRole,
        },
      ];
      state.publicLog = [
        ...state.publicLog,
        {
          seq: event.seq,
          at: event.at,
          action: 'seat_left_disconnected',
          seatId: event.seatId,
          reason: 'disconnected',
        },
      ];
      state.taskAssignments = previous.taskAssignments.map((task) =>
        task.seatId === event.seatId && task.status === 'assigned'
          ? { ...task, status: 'void' }
          : task,
      );
      state.votes = { ...previous.votes };
      delete state.votes[event.seatId];
      state.endVotes = { ...previous.endVotes };
      delete state.endVotes[event.seatId];
      state.shadow = { ...previous.shadow };
      delete state.shadow[event.seatId];
      state.acks = previous.acks.filter((seatId) => seatId !== event.seatId);
      state.readySeats = (previous.readySeats ?? []).filter(
        (seatId) => seatId !== event.seatId,
      );
      state.skippedActions = previous.skippedActions.filter(
        (skip) => skip.seatId !== event.seatId,
      );
      break;
    }
    case 'DisconnectedSeatReinstated': {
      const removal = previous.disconnectedRemovals.find(
        (candidate) =>
          candidate.seatId === event.seatId &&
          candidate.phase === event.phase &&
          candidate.cycle === event.cycle &&
          candidate.restorable,
      );
      const seat = previous.seats.find(
        (candidate) => candidate.id === event.seatId,
      );
      if (!removal || !seat || seat.status !== 'departed')
        throw new Error('Invalid disconnected reinstatement event');
      state.seats = previous.seats.map((candidate) =>
        candidate.id === event.seatId
          ? {
              ...candidate,
              status: 'alive',
              publicRole: removal.wasPublicRole,
            }
          : candidate,
      );
      if (
        state.seats.some(
          (candidate) =>
            candidate.status === 'alive' && candidate.role === 'traitor',
        )
      )
        state.pendingSleeper = false;
      state.hiddenRoleSeatIds = previous.hiddenRoleSeatIds.filter(
        (seatId) => seatId !== event.seatId,
      );
      state.disconnectedRemovals = previous.disconnectedRemovals.map(
        (candidate) =>
          candidate === removal
            ? { ...candidate, restorable: false }
            : candidate,
      );
      state.skippedActions = previous.skippedActions.filter(
        (skip) => skip.seatId !== event.seatId,
      );
      state.publicLog = [
        ...state.publicLog,
        {
          seq: event.seq,
          at: event.at,
          action: 'seat_reinstated',
          seatId: event.seatId,
        },
      ];
      break;
    }
    case 'CoordinatorRoleMoved':
      state.publicLog = [
        ...state.publicLog,
        {
          seq: event.seq,
          at: event.at,
          action: 'coordinator_role_moved',
        },
      ];
      break;
    case 'ShieldsAllocated':
      state.shields = event.holders;
      break;
    case 'DawnResolved':
      state.protected = event.protected;
      state.shields = [];
      state.publicAnnouncement = {
        kind: 'dawn',
        cycle: previous.cycle,
        victimIds: event.victims,
      };
      state.publicLog = [
        ...state.publicLog,
        {
          seq: event.seq,
          at: event.at,
          action: 'dawn',
          victimIds: event.victims,
        },
      ];
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
    case 'DeadlineExtended': {
      const addedMs = event.deadline - (previous.deadline ?? event.deadline);
      state.deadline = event.deadline;
      state.shadowEndAt = event.shadowEndAt;
      if (addedMs > 0) {
        state.publicLog = [
          ...state.publicLog,
          {
            seq: event.seq,
            at: event.at,
            action: 'schedule_shift',
            minutes: Math.round(addedMs / 60_000),
          },
        ];
      }
      break;
    }
    case 'SleeperWaiting':
      state.pendingSleeper = true;
      break;
    case 'SleeperActivated': {
      const seat = previous.seats.find((s) => s.id === event.seatId);
      if (!seat || seat.status !== 'alive' || seat.role !== 'faithful')
        throw new Error('Invalid sleeper activation');
      state.seats = previous.seats.map((candidate) =>
        candidate.id === event.seatId
          ? { ...candidate, role: 'traitor', traitorSince: event.seq }
          : candidate,
      );
      state.pendingSleeper = false;
      break;
    }
    case 'TraitorMessage':
      state.chat = [
        ...previous.chat,
        {
          seatId: event.seatId,
          text: event.text,
          seq: event.seq,
        },
      ];
      break;
    case 'EndgameVote':
      state.endVotes = { ...previous.endVotes, [event.seatId]: event.choice };
      scheduleCompletedEndgameVote(state, event.at);
      break;
    case 'GameFinished':
      state.phase = 'FINISHED';
      state.votes = {};
      state.revealed = [];
      state.skippedActions = [];
      state.winner = event.winner;
      state.reason = event.reason;
      state.publicAnnouncement = {
        kind: 'finished',
        winner: event.winner,
      };
      state.publicLog = [
        ...state.publicLog,
        {
          seq: event.seq,
          at: event.at,
          action: 'finished',
          winner: event.winner,
        },
      ];
      state.deadline = null;
      state.shadowEndAt = null;
      state.paused = false;
      break;
    case 'CoordinatorActionUndone': {
      const restored = normalizeSnapshot(event.restoreState as State);
      if (restored.id !== previous.id || restored.version >= event.seq)
        throw new Error('Invalid coordinator undo state');
      return {
        ...restored,
        version: event.seq,
        publicLog: [
          ...restored.publicLog,
          {
            seq: event.seq,
            at: event.at,
            action: 'coordinator_undo',
          },
        ],
      };
    }
  }
  return state;
}
export function replayFrom(
  snapshot: State | null,
  events: readonly Event[],
): State {
  let state = snapshot ? normalizeSnapshot(snapshot) : null;
  for (const event of events) state = evolve(state, event);
  if (!state) throw new Error('Empty event stream');
  return state;
}

function normalizeSnapshot(snapshot: State): State {
  const legacy = snapshot as State & {
    shadowPicks?: unknown;
    voteRevealOrder?: unknown;
    voteContext?: unknown;
    skippedActions?: unknown;
    disconnectedRemovals?: unknown;
    hiddenRoleSeatIds?: unknown;
  };
  if (legacy.shadowPicks !== undefined && !Array.isArray(legacy.shadowPicks))
    throw new Error('Stored snapshot shadow picks are invalid');
  if (
    legacy.voteRevealOrder !== undefined &&
    !Array.isArray(legacy.voteRevealOrder)
  )
    throw new Error('Stored snapshot vote reveal order is invalid');
  if (
    legacy.voteContext !== undefined &&
    legacy.voteContext !== 'cycle' &&
    legacy.voteContext !== 'final'
  )
    throw new Error('Stored snapshot vote context is invalid');
  if (
    legacy.skippedActions !== undefined &&
    !Array.isArray(legacy.skippedActions)
  )
    throw new Error('Stored snapshot skipped actions are invalid');
  if (
    legacy.disconnectedRemovals !== undefined &&
    !Array.isArray(legacy.disconnectedRemovals)
  )
    throw new Error('Stored snapshot disconnected removals are invalid');
  if (
    legacy.hiddenRoleSeatIds !== undefined &&
    !Array.isArray(legacy.hiddenRoleSeatIds)
  )
    throw new Error('Stored snapshot hidden role ids are invalid');
  return {
    ...snapshot,
    shadowPicks: (legacy.shadowPicks as State['shadowPicks'] | undefined) ?? [],
    voteRevealOrder: (legacy.voteRevealOrder as string[] | undefined) ?? [],
    voteContext:
      (legacy.voteContext as State['voteContext'] | undefined) ?? 'cycle',
    skippedActions:
      (legacy.skippedActions as State['skippedActions'] | undefined) ?? [],
    disconnectedRemovals:
      (legacy.disconnectedRemovals as
        State['disconnectedRemovals'] | undefined) ?? [],
    hiddenRoleSeatIds: (legacy.hiddenRoleSeatIds as string[] | undefined) ?? [],
  };
}

export function replay(events: readonly Event[]): State {
  return replayFrom(null, events);
}
