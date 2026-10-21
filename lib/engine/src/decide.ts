import { joiningWindowOpen } from './joining';
import {
  commandSchema,
  eventSchema,
  isReservedPracticeName,
  normalizeSeatName,
  recommended,
  taskDefinitionSchema,
} from '../../shared/src/index';
import {
  alive,
  type State,
  type Context,
  type Event,
  type Result,
  type Phase,
  type Seat,
} from './model';
import { getMinimumAdvanceAt } from './phase-timing';
import { evolve } from './reducer';
import { roleDeal } from './deal';
const coordinatorCommands = new Set([
  'AdvancePhase',
  'StartGame',
  'MarkDeparted',
  'AllocatePower',
  'Pause',
  'Resume',
  'ExtendPhase',
  'EndGameEarly',
  'UndoCoordinatorAction',
]);

export function isCoordinatorCommand(commandType: string): boolean {
  return coordinatorCommands.has(commandType);
}
const cycle: Phase[] = [
  'MISSION',
  'DEBATE',
  'VOTE',
  'VERDICT',
  'SHADOW',
  'DAWN',
];
const error = (code: string): Result => ({ ok: false, code });

export function decide(
  initial: State | null,
  input: unknown,
  ctx: Context,
): Result {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success || !Number.isSafeInteger(ctx.now) || ctx.now < 0)
    return error('INVALID_COMMAND');
  const cmd = parsed.data;
  let state = initial;
  const events: Event[] = [];
  const finished = () => state?.phase === 'FINISHED';
  const emit = (type: Event['type'], payload: Record<string, unknown> = {}) => {
    const event = eventSchema.parse({
      schemaVersion: 1,
      seq: (state?.version ?? 0) + 1,
      at: ctx.now,
      type,
      ...payload,
    });
    state = evolve(state, event);
    events.push(event);
  };
  const choose = <T>(choices: readonly T[]): T => {
    if (!choices.length) throw new Error('Empty random population');
    const index = ctx.random.int(choices.length);
    if (!Number.isInteger(index) || index < 0 || index >= choices.length)
      throw new Error('Invalid injected random source');
    return choices[index]!;
  };
  const chooseSeat = (
    choices: readonly string[],
    purpose:
      'cycle-vote-tie-break' | 'endgame-vote-tie-break' | 'murder-target',
    slot?: 1 | 2,
  ) => {
    const chosen = choose(choices);
    emit('RandomChoiceRecorded', {
      purpose,
      candidates: [...choices].sort(),
      chosen,
      ...(slot === undefined ? {} : { slot }),
    });
    return chosen;
  };
  const shuffledVoters = (voters: readonly string[]) => {
    const result = [...new Set(voters)].sort();
    for (let index = result.length - 1; index > 0; index--) {
      const other = ctx.random.int(index + 1);
      if (!Number.isInteger(other) || other < 0 || other > index)
        throw new Error('Invalid injected random source');
      [result[index], result[other]] = [result[other]!, result[index]!];
    }
    return result;
  };
  const eligibleTasks = () =>
    (ctx.taskCatalog ?? [])
      .flatMap((item) => {
        const parsed = taskDefinitionSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      })
      .filter((task) => {
        const filters = state!.config.tasks.filters;
        return (
          filters.every((filter) => task.tags.includes(filter)) &&
          (!filters.includes('family') || task.minimumAge < 13) &&
          (!filters.includes('adults-only') || task.minimumAge >= 18)
        );
      });
  const assignTasks = (cycleNumber: number, seats: Seat[]) => {
    if (!state!.config.tasks.enabled || !seats.length) return;
    const pool = eligibleTasks();
    const shared = state!.config.tasks.perCycle === 'shared';
    const previousShared = shared
      ? state!.taskAssignments.find(
          (task) =>
            task.cycle === cycleNumber && task.shared && task.taskId !== null,
        )
      : undefined;
    const oneSharedTask =
      previousShared && pool.find((task) => task.id === previousShared.taskId!);
    let sharedTask = oneSharedTask;
    for (const seat of seats) {
      if (seat.role !== 'traitor') {
        emit('TaskAssigned', {
          seatId: seat.id,
          cycle: cycleNumber,
          task: null,
          shared: false,
        });
        continue;
      }
      if (!pool.length) throw new Error('No eligible Traitor task exists');
      sharedTask ??= shared ? choose(pool) : undefined;
      const task = shared ? sharedTask! : choose(pool);
      emit('TaskAssigned', {
        seatId: seat.id,
        cycle: cycleNumber,
        task,
        shared,
      });
    }
  };
  if (cmd.type === 'CreateGame') {
    if (state) return error('GAME_EXISTS');
    if (ctx.actor.kind !== 'coordinator') return error('FORBIDDEN');
    emit('GameCreated', { id: cmd.id, config: cmd.config });
    return { ok: true, events };
  }
  if (!state) return error('GAME_NOT_FOUND');
  if (state.phase === 'FINISHED' || state.phase === 'ARCHIVED')
    return error('GAME_FINISHED');
  if (coordinatorCommands.has(cmd.type)) {
    if (!['coordinator', 'system'].includes(ctx.actor.kind))
      return error('FORBIDDEN');
    if (
      ctx.actor.kind === 'coordinator' &&
      cmd.expectedVersion !== state.version
    )
      return error('STALE_VERSION');
  }
  const actingSeat = state.seats.find((seat) => seat.id === ctx.actor.seatId);
  if (
    [
      'SubmitVote',
      'RevealVote',
      'SubmitShadowChoice',
      'SubmitTaskReport',
      'AcknowledgePrivate',
      'RequestRedeal',
      'PostTraitorMessage',
      'SubmitEndgameVote',
    ].includes(cmd.type)
  ) {
    if (ctx.actor.kind !== 'player' || !actingSeat) return error('FORBIDDEN');
    if (actingSeat.status !== 'alive' && cmd.type !== 'RevealVote')
      return error('SEAT_INACTIVE');
  }
  if (
    state.paused &&
    !['Resume', 'EndGameEarly', 'MarkDeparted'].includes(cmd.type)
  )
    return error('PAUSED');
  const finalSize = () =>
    state!.config.endgame.size === 'auto'
      ? recommended(alive(state!).length < 5 ? 5 : state!.config.players.count)
          .finalSize
      : state!.config.endgame.size;
  const endgameDue = () => {
    const config = state!.config.endgame;
    const size = alive(state!).length <= finalSize();
    const at = config.at ?? state!.config.schedule.window?.end;
    const timed = at ? ctx.now >= Date.parse(at) : false;
    return config.trigger === 'alive'
      ? size
      : config.trigger === 'time'
        ? timed
        : size || timed;
  };
  const checkWin = () => {
    const living = alive(state!);
    const traitors = living.filter((seat) => seat.role === 'traitor');
    if (!traitors.length) {
      const sleeper = living.find(
        (seat) => seat.id === state!.deal?.sleeper && seat.role === 'faithful',
      );
      if (
        sleeper &&
        !['ENDGAME', 'FINAL_VOTE', 'FINAL_BANISH'].includes(state!.phase) &&
        !endgameDue() &&
        living.length > 3
      ) {
        if (!state!.pendingSleeper) emit('SleeperWaiting');
      } else
        emit('GameFinished', { winner: 'faithful', reason: 'no-traitors' });
    } else if (
      living.length <= 2 ||
      (state!.config.endgame.parity &&
        traitors.length >= living.length - traitors.length)
    ) {
      emit('GameFinished', {
        winner: 'traitor',
        reason: living.length <= 2 ? 'two-players' : 'parity',
      });
    }
  };
  const deal = (redeal: boolean) => {
    emit('RolesDealt', roleDeal(state!, ctx, redeal));
  };
  const duration = (phase: Phase) => {
    const c = state!.config;
    const value: Partial<Record<Phase, number>> = {
      DEAL:
        c.schedule.format === 'quick'
          ? 3
          : c.schedule.format === 'day'
            ? 10
            : 720,
      MISSION:
        c.schedule.format === 'quick'
          ? 5
          : c.schedule.format === 'day'
            ? 20
            : 1440,
      DEBATE: c.roundTable.debateMinutes,
      VOTE: c.roundTable.voteMinutes,
      FINAL_BANISH: c.roundTable.voteMinutes,
      VERDICT: c.schedule.format === 'quick' ? 2 : 5,
      SHADOW:
        c.schedule.format === 'quick'
          ? 2
          : c.schedule.format === 'day'
            ? 15
            : 480,
      DAWN: c.schedule.format === 'quick' ? 1 : 5,
      FINAL_VOTE: c.schedule.format === 'quick' ? 10 : 30,
    };
    return ctx.testOnlyPhaseDurationMs ?? (value[phase] ?? 1) * 60_000;
  };
  const enter = (phase: Phase, nextCycle = state!.cycle) => {
    const phaseDuration = state!.config.rehearsal.enabled
      ? null
      : duration(phase);
    emit('PhaseChanged', {
      phase,
      deadline: ['DRAFT', 'LOBBY'].includes(phase)
        ? null
        : phaseDuration === null
          ? null
          : ctx.now +
            (phase === 'SHADOW' ? Math.ceil(phaseDuration / 2) : phaseDuration),
      shadowEndAt:
        phase === 'SHADOW' && phaseDuration !== null
          ? ctx.now + phaseDuration
          : null,
      cycle: nextCycle,
    });
    if (phase === 'SHADOW' && state!.pendingSleeper) {
      const sleeper = alive(state!).find(
        (seat) => seat.id === state!.deal?.sleeper && seat.role === 'faithful',
      );
      if (sleeper && !endgameDue() && alive(state!).length > 3) {
        emit('SleeperActivated', { seatId: sleeper.id });
        checkWin();
      } else checkWin();
    }
  };
  const remove = (
    seatId: string,
    reason: 'departed' | 'banished' | 'murdered',
  ) => {
    const finalBanishment =
      state!.phase === 'FINAL_BANISH' ||
      (state!.phase === 'VERDICT' && state!.voteContext === 'final');
    const publicRole =
      reason === 'departed'
        ? state!.config.players.departureReveal === 'now'
        : reason === 'banished' &&
          (state!.config.roundTable.revealRole === 'always' ||
            (state!.config.roundTable.revealRole === 'not-endgame' &&
              !finalBanishment));
    emit('SeatRemoved', { seatId, reason, publicRole });
    if (!(reason === 'banished' && state!.phase === 'VERDICT')) checkWin();
  };
  const nextVoteSpeaker = () => {
    const current = state;
    if (!current) return undefined;
    return current.voteRevealOrder.find(
      (seatId) => !current.revealed.includes(seatId),
    );
  };
  const finishVoteCircleIfReady = () => {
    if (
      !state ||
      state.phase !== 'VERDICT' ||
      state.config.roundTable.revealStyle !== 'speaker-circle'
    )
      return;
    while (
      state.config.rehearsal.enabled &&
      state.config.rehearsal.botSeatIds.includes(nextVoteSpeaker() ?? '')
    ) {
      const seatId = nextVoteSpeaker();
      if (!seatId) break;
      emit('VoteRevealed', { seatId });
    }
    if (
      state.voteRevealOrder.length > 0 &&
      !nextVoteSpeaker() &&
      state.target &&
      !(
        state.publicAnnouncement?.kind === 'verdict' &&
        state.publicAnnouncement.cycle === state.cycle &&
        state.publicAnnouncement.seatId === state.target
      )
    )
      remove(state.target, 'banished');
  };
  switch (cmd.type) {
    case 'JoinGame': {
      if (ctx.actor.kind !== 'player' || ctx.actor.seatId !== cmd.seatId)
        return error('FORBIDDEN');
      if (!joiningWindowOpen(state)) return error('LOBBY_CLOSED');
      if (state.seats.some((seat) => seat.id === cmd.seatId))
        return error('DUPLICATE_SEAT');
      const configuredRehearsalBot =
        state.config.rehearsal.enabled &&
        state.config.rehearsal.botSeatIds.includes(cmd.seatId);
      if (isReservedPracticeName(cmd.name) && !configuredRehearsalBot)
        return error('RESERVED_NAME');
      const normalizedName = normalizeSeatName(cmd.name);
      if (
        state.seats.some(
          (seat) => normalizeSeatName(seat.name) === normalizedName,
        )
      )
        return error('DUPLICATE_NAME');
      if (state.seats.length >= state.config.players.count)
        return error('LOBBY_FULL');
      emit('SeatJoined', { seatId: cmd.seatId, name: cmd.name });
      break;
    }
    case 'StartGame':
      if (state.phase !== 'LOBBY') return error('WRONG_PHASE');
      if (alive(state).length < 5) return error('TOO_FEW_PLAYERS');
      if (
        typeof state.config.traitors.number === 'number' &&
        state.config.traitors.number >= alive(state).length
      )
        return error('INVALID_ROLE_COUNT');
      if (state.config.tasks.enabled && !eligibleTasks().length)
        return error('TASK_CATALOG_UNAVAILABLE');
      deal(false);
      enter('DEAL');
      break;
    case 'AcknowledgePrivate':
      if (
        !['DEAL', 'SHADOW', 'VOTE', 'FINAL_VOTE', 'FINAL_BANISH'].includes(
          state.phase,
        )
      )
        return error('WRONG_PHASE');
      emit('PrivateAcknowledged', {
        seatId: actingSeat!.id,
        ...(cmd.ready === true ? { ready: true } : {}),
      });
      if (
        state.phase === 'DEAL' &&
        !state.taskAssignments.some(
          (task) => task.seatId === actingSeat!.id && task.cycle === 1,
        )
      )
        assignTasks(1, [actingSeat!]);
      break;
    case 'SubmitTaskReport': {
      if (state.phase !== 'SHADOW') return error('WRONG_PHASE');
      if (state.shadowRound !== 1 || state.shadowSlot !== 1)
        return error('TASK_REPORT_CLOSED');
      if (state.deadline !== null && ctx.now >= state.deadline)
        return error('DEADLINE_PASSED');
      const assignment = state.taskAssignments.find(
        (task) =>
          task.seatId === actingSeat!.id &&
          task.cycle === state!.cycle &&
          task.taskId !== null &&
          task.status !== 'void',
      );
      if (assignment) {
        if (cmd.answer !== 'done' && cmd.answer !== 'missed')
          return error('INVALID_TASK_REPORT');
        emit('TaskReported', {
          seatId: actingSeat!.id,
          cycle: state.cycle,
          report: cmd.answer,
        });
      } else
        emit('TaskDecoyAnswered', {
          seatId: actingSeat!.id,
          cycle: state.cycle,
          answer: cmd.answer,
        });
      break;
    }
    case 'RequestRedeal':
      if (
        !state.deal ||
        state.deal.redealUsed ||
        state.cycle > 0 ||
        state.phase !== 'DEAL'
      )
        return error('REDEAL_UNAVAILABLE');
      deal(true);
      enter('DEAL');
      break;
    case 'SubmitVote': {
      if (!['VOTE', 'FINAL_BANISH'].includes(state.phase))
        return error('WRONG_PHASE');
      if (state.deadline !== null && ctx.now >= state.deadline)
        return error('DEADLINE_PASSED');
      if (
        cmd.target === actingSeat!.id ||
        !alive(state).some((seat) => seat.id === cmd.target) ||
        (state.candidates.length > 0 && !state.candidates.includes(cmd.target))
      )
        return error('INVALID_TARGET');
      if (!state.config.roundTable.changeVote && state.votes[actingSeat!.id])
        return error('VOTE_LOCKED');
      emit('VoteSubmitted', { seatId: actingSeat!.id, target: cmd.target });
      break;
    }
    case 'RevealVote': {
      if (
        state.phase !== 'VERDICT' ||
        state.config.roundTable.revealStyle !== 'speaker-circle'
      )
        return error('WRONG_PHASE');
      const speakerId = nextVoteSpeaker();
      if (!speakerId) return error('NO_VOTE_TO_REVEAL');
      if (ctx.actor.kind !== 'player' || actingSeat?.id !== speakerId)
        return error('NOT_VOTE_SPEAKER');
      emit('VoteRevealed', { seatId: speakerId });
      finishVoteCircleIfReady();
      break;
    }
    case 'SubmitShadowChoice':
      if (state.phase !== 'SHADOW') return error('WRONG_PHASE');
      if (state.deadline !== null && ctx.now >= state.deadline)
        return error('DEADLINE_PASSED');
      {
        const slot = cmd.slot ?? state.shadowSlot;
        if (slot !== state.shadowSlot) return error('WRONG_SHADOW_SLOT');
        const firstSlotChoice =
          slot === 2
            ? state.shadowPicks
                .filter(
                  (pick) =>
                    pick.cycle === state!.cycle &&
                    pick.slot === 1 &&
                    pick.seatId === actingSeat!.id,
                )
                .sort((left, right) => right.seq - left.seq)[0]?.choice
            : undefined;
        if (firstSlotChoice === cmd.choice)
          return error('DUPLICATE_SHADOW_CHOICE');
        if (
          state.config.tasks.enabled &&
          !state.taskReports.some(
            (report) =>
              report.seatId === actingSeat!.id && report.cycle === state!.cycle,
          ) &&
          !state.taskAssignments.some(
            (task) =>
              task.seatId === actingSeat!.id &&
              task.cycle === state!.cycle &&
              task.taskId !== null &&
              task.status !== 'void',
          )
        )
          return error('TASK_REPORT_REQUIRED');
        if (
          state.config.tasks.enabled &&
          state.taskAssignments.some(
            (task) =>
              task.seatId === actingSeat!.id &&
              task.cycle === state!.cycle &&
              task.taskId !== null &&
              task.status !== 'void',
          ) &&
          !state.taskAssignments.some(
            (task) =>
              task.seatId === actingSeat!.id &&
              task.cycle === state!.cycle &&
              task.taskId !== null &&
              task.status !== 'assigned' &&
              task.status !== 'void',
          )
        )
          return error('TASK_REPORT_REQUIRED');
        if (
          !alive(state).some(
            (seat) =>
              seat.id === cmd.choice &&
              seat.id !== actingSeat!.id &&
              (actingSeat!.role !== 'traitor' || seat.role !== 'traitor'),
          )
        )
          return error('INVALID_TARGET');
        emit('ShadowSubmitted', {
          seatId: actingSeat!.id,
          choice: cmd.choice,
          slot,
          round: state.shadowRound as 1 | 2,
        });
      }
      break;
    case 'MarkDeparted':
      if (!alive(state).some((seat) => seat.id === cmd.seatId))
        return error('INVALID_TARGET');
      if (!state.deal) {
        emit('SeatRemoved', {
          seatId: cmd.seatId,
          reason: 'departed',
          publicRole: false,
        });
      } else remove(cmd.seatId, 'departed');
      break;
    case 'AllocatePower':
      if (state.config.missions.shields === 'off')
        return error('POWER_DISABLED');
      if (
        ctx.actor.kind === 'coordinator' &&
        state.config.missions.shields === 'secret'
      )
        return error('FORBIDDEN');
      if (
        cmd.holders.some((id) => !alive(state!).some((seat) => seat.id === id))
      )
        return error('INVALID_TARGET');
      emit('ShieldsAllocated', { holders: cmd.holders });
      break;
    case 'PostTraitorMessage':
      if (actingSeat!.role !== 'traitor' || !state.config.traitors.chat)
        return error('FORBIDDEN');
      emit('TraitorMessage', { seatId: actingSeat!.id, text: cmd.text });
      break;
    case 'Pause':
      emit('Paused', {
        remaining:
          state.deadline === null
            ? null
            : Math.max(0, state.deadline - ctx.now),
        shadowRemaining:
          state.shadowEndAt === null
            ? null
            : Math.max(0, state.shadowEndAt - ctx.now),
      });
      break;
    case 'Resume':
      if (!state.paused) return error('NOT_PAUSED');
      emit('Resumed', {
        deadline: state.remaining === null ? null : ctx.now + state.remaining,
        shadowEndAt:
          state.shadowRemaining === null
            ? null
            : ctx.now + state.shadowRemaining,
      });
      break;
    case 'ExtendPhase':
      if (state.deadline === null) return error('NO_DEADLINE');
      emit('DeadlineExtended', {
        deadline: state.deadline + cmd.minutes * 60_000,
        shadowEndAt:
          state.shadowEndAt === null
            ? null
            : state.shadowEndAt + cmd.minutes * 60_000,
      });
      break;
    case 'SubmitEndgameVote':
      if (state.phase !== 'FINAL_VOTE') return error('WRONG_PHASE');
      if (state.deadline !== null && ctx.now >= state.deadline)
        return error('DEADLINE_PASSED');
      emit('EndgameVote', { seatId: actingSeat!.id, choice: cmd.choice });
      break;
    case 'EndGameEarly':
      emit('GameFinished', {
        winner: alive(state).some((s) => s.role === 'traitor')
          ? 'traitor'
          : 'faithful',
        reason: 'ended-early',
      });
      break;
    case 'UndoCoordinatorAction':
      return error('UNDO_REQUIRES_SERVER');
    case 'AdvancePhase': {
      const minimumAdvanceAt = getMinimumAdvanceAt(state);
      if (minimumAdvanceAt !== null && ctx.now < minimumAdvanceAt)
        return error('TOO_EARLY');
      if (
        ctx.actor.kind === 'system' &&
        state.deadline !== null &&
        ctx.now < state.deadline
      )
        return error('DEADLINE_NOT_DUE');
      if (state.phase === 'DRAFT') {
        enter('LOBBY');
        break;
      }
      if (state.phase === 'LOBBY') return error('USE_START_GAME');
      if (state.phase === 'DEAL') {
        enter(state.config.missions.enabled ? 'MISSION' : 'DEBATE', 1);
        break;
      }
      if (state.phase === 'VOTE' || state.phase === 'FINAL_BANISH') {
        const voteContext = state.phase === 'FINAL_BANISH' ? 'final' : 'cycle';
        const circleEnabled =
          state.config.roundTable.revealStyle === 'speaker-circle';
        const candidates = alive(state)
          .filter(
            (s) =>
              !state!.candidates.length || state!.candidates.includes(s.id),
          )
          .map((s) => s.id);
        const scores = Object.fromEntries(
          candidates.map((id) => [
            id,
            Object.values(state!.votes).filter((v) => v === id).length,
          ]),
        );
        const maximum = Math.max(...Object.values(scores));
        const tied = candidates.filter((id) => scores[id] === maximum);
        const noVotes = Object.keys(state.votes).length === 0;
        if (state.phase === 'VOTE' && noVotes) {
          emit('VoteSkipped', {});
          enter('VERDICT');
          break;
        }
        if (tied.length > 1 && !state.revote) {
          emit('VoteClosed', {
            target: null,
            revote: true,
            candidates: tied,
            context: voteContext,
            revealOrder: [],
          });
          enter(state.phase);
          break;
        }
        const target =
          tied.length > 1 &&
          state.phase !== 'FINAL_BANISH' &&
          state.config.roundTable.tieRule === 'revote-none'
            ? null
            : tied.length > 1
              ? chooseSeat(
                  tied,
                  state.phase === 'FINAL_BANISH'
                    ? 'endgame-vote-tie-break'
                    : 'cycle-vote-tie-break',
                )
              : tied[0]!;
        const revealOrder =
          circleEnabled && Object.keys(state.votes).length > 0
            ? shuffledVoters(Object.keys(state.votes))
            : [];
        emit('VoteClosed', {
          target,
          revote: false,
          candidates: [],
          context: voteContext,
          revealOrder,
        });
        if (state!.phase === 'FINAL_BANISH') {
          if (revealOrder.length) {
            enter('VERDICT');
            finishVoteCircleIfReady();
          } else {
            if (target) remove(target, 'banished');
            if (!finished()) enter('FINAL_VOTE');
          }
        } else {
          enter('VERDICT');
          finishVoteCircleIfReady();
        }
        break;
      }
      if (state.phase === 'VERDICT') {
        if (
          state.config.roundTable.revealStyle === 'speaker-circle' &&
          nextVoteSpeaker()
        ) {
          if (ctx.actor.kind !== 'system')
            return error('VOTE_CIRCLE_INCOMPLETE');
          while (nextVoteSpeaker()) {
            const seatId = nextVoteSpeaker();
            if (!seatId) break;
            emit('VoteRevealed', { seatId });
          }
          if (state.target) remove(state.target, 'banished');
          break;
        }
        const verdictAlreadyShown =
          state.publicAnnouncement?.kind === 'verdict' &&
          state.publicAnnouncement.cycle === state.cycle;
        if (verdictAlreadyShown) {
          checkWin();
          if (finished()) break;
          if (state.voteContext === 'final') {
            enter('FINAL_VOTE');
            break;
          }
        } else {
          const remaining = Object.keys(state.votes)
            .filter((id) => !state!.revealed.includes(id))
            .sort();
          if (
            remaining.length &&
            state.config.roundTable.revealStyle === 'one-by-one' &&
            ctx.actor.kind !== 'system'
          ) {
            emit('VoteRevealed', { seatId: remaining[0] });
            break;
          }
          for (const seatId of remaining) emit('VoteRevealed', { seatId });
          if (state!.target) remove(state!.target, 'banished');
          if (finished()) break;
          if (
            state.publicAnnouncement?.kind === 'verdict' &&
            state.publicAnnouncement.cycle === state.cycle
          )
            break;
        }
      }
      if (state.phase === 'SHADOW') {
        const pendingTaskReports = state.taskAssignments.filter(
          (task) =>
            task.cycle === state!.cycle &&
            task.taskId !== null &&
            task.status === 'assigned' &&
            alive(state!).some((seat) => seat.id === task.seatId),
        );
        if (
          pendingTaskReports.length &&
          state.deadline !== null &&
          ctx.now < state.deadline
        )
          return error('TASK_REPORTS_PENDING');
        for (const task of pendingTaskReports)
          emit('TaskReported', {
            seatId: task.seatId,
            cycle: task.cycle,
            report: 'missed',
          });
        if (state.config.tasks.enabled) {
          const missingDecoys = alive(state).filter((seat) => {
            const assigned = state!.taskAssignments.find(
              (task) => task.seatId === seat.id && task.cycle === state!.cycle,
            );
            return (
              (!assigned || assigned.taskId === null) &&
              !state!.taskReports.some(
                (report) =>
                  report.seatId === seat.id && report.cycle === state!.cycle,
              )
            );
          });
          for (const seat of missingDecoys)
            emit('TaskDecoyAnswered', {
              seatId: seat.id,
              cycle: state!.cycle,
              answer: 'No decoy answer submitted.',
            });
        }
        if (state.shadowRound === 1) {
          if (state.deadline !== null && ctx.now < state.deadline)
            return error('SHADOW_ROUND_NOT_DUE');
          if (state.shadowEndAt === null && !state.config.rehearsal.enabled)
            return error('SHADOW_DEADLINE_MISSING');
          emit('ShadowRoundAdvanced', {
            cycle: state.cycle,
            deadline: state.config.rehearsal.enabled
              ? null
              : state.shadowEndAt!,
            slot: state.shadowSlot as 1 | 2,
          });
          break;
        }
        if (state.shadowRound !== 2) return error('INVALID_SHADOW_ROUND');
        if (state.deadline !== null && ctx.now < state.deadline)
          return error('SHADOW_WINDOW_NOT_DUE');
        const livingTraitors = alive(state).filter(
          (seat) => seat.role === 'traitor',
        );
        const liveAssignments = state.taskAssignments.filter(
          (task) =>
            task.cycle === state!.cycle &&
            livingTraitors.some((seat) => seat.id === task.seatId),
        );
        const missedIndividualTask = liveAssignments.some(
          (task) =>
            !task.shared &&
            (task.status === 'missed' || task.status === 'assigned'),
        );
        const sharedTaskIds = new Set(
          liveAssignments
            .filter((task) => task.shared)
            .map((task) => task.taskId),
        );
        const missedSharedTask = [...sharedTaskIds].some((taskId) => {
          const reports = liveAssignments.filter(
            (task) => task.shared && task.taskId === taskId,
          );
          return (
            !reports.some((task) => task.status === 'done') &&
            reports.some(
              (task) => task.status === 'missed' || task.status === 'assigned',
            )
          );
        });
        const taskPenalty =
          state.config.tasks.enabled &&
          state.config.tasks.missedConsequence === 'lose-next-murder' &&
          state.config.traitors.murders > 0 &&
          (missedIndividualTask || missedSharedTask);
        const slotCount = Math.min(2, state.config.traitors.murders);
        const slot = state.shadowSlot as 1 | 2;
        if (slotCount > 0 && slot <= slotCount) {
          const previousResolutions = state.murderResolutions.filter(
            (resolution) => resolution.cycle === state!.cycle,
          );
          const previouslySelected = previousResolutions.flatMap(
            (resolution) => (resolution.chosen ? [resolution.chosen] : []),
          );
          const previousMurders = previousResolutions.filter(
            (resolution) => resolution.outcome === 'murdered',
          ).length;
          const remainingSeats = alive(state).length - previousMurders;
          const remainingFaithful = remainingSeats - livingTraitors.length;
          const gameEndedBeforeSlot =
            remainingSeats <= 2 ||
            (state.config.endgame.parity &&
              livingTraitors.length >= remainingFaithful);
          const eligible = alive(state)
            .filter((seat) => seat.role === 'faithful')
            .map((seat) => seat.id);
          const available = eligible.filter(
            (id) => !previouslySelected.includes(id),
          );
          const roundTwoPicks = state.shadowPicks
            .filter(
              (pick) =>
                pick.cycle === state!.cycle &&
                pick.slot === slot &&
                pick.round === 2 &&
                livingTraitors.some((seat) => seat.id === pick.seatId),
            )
            .sort((left, right) => left.seq - right.seq);
          const currentPicks = roundTwoPicks
            .map((pick) => pick.choice)
            .filter((id) => available.includes(id));
          const submittedByEveryTraitor =
            new Set(roundTwoPicks.map((pick) => pick.seatId)).size ===
            livingTraitors.length;
          let chosen: string | null = null;
          let outcome:
            | 'murdered'
            | 'protected'
            | 'no-target'
            | 'cancelled'
            | 'game-ended'
            | null = null;
          if (taskPenalty) outcome = 'cancelled';
          else if (gameEndedBeforeSlot) outcome = 'game-ended';
          else if (!available.length) outcome = 'no-target';
          else if (state.config.traitors.victimDecision === 'unanimous') {
            const unanimousChoice =
              submittedByEveryTraitor &&
              currentPicks.length === livingTraitors.length &&
              new Set(currentPicks).size === 1
                ? currentPicks[0]
                : undefined;
            if (unanimousChoice && available.includes(unanimousChoice))
              chosen = unanimousChoice;
            else if (state.config.traitors.timeoutChoice === 'none')
              outcome = 'no-target';
            else if (state.config.traitors.timeoutChoice === 'random') {
              const scores = available.map((id) => ({
                id,
                score: currentPicks.filter((pick) => pick === id).length,
              }));
              const maximum = Math.max(...scores.map((item) => item.score));
              const leading = currentPicks.length
                ? scores
                    .filter((item) => item.score === maximum)
                    .map((item) => item.id)
                : available;
              chosen = chooseSeat(leading, 'murder-target', slot);
            }
          }
          if (
            chosen === null &&
            outcome !== 'cancelled' &&
            outcome !== 'game-ended' &&
            outcome !== 'no-target'
          ) {
            if (
              !currentPicks.length &&
              state.config.traitors.timeoutChoice === 'none'
            )
              outcome = 'no-target';
            else {
              const scores = available.map((id) => ({
                id,
                score: currentPicks.filter((pick) => pick === id).length,
              }));
              const maximum = Math.max(...scores.map((item) => item.score));
              const leading = scores
                .filter((item) => item.score === maximum)
                .map((item) => item.id);
              const firstPick =
                state.config.traitors.victimDecision === 'first'
                  ? currentPicks[0]
                  : undefined;
              const randomCandidates =
                state.config.traitors.victimDecision !== 'unanimous' &&
                !currentPicks.length &&
                state.config.traitors.timeoutChoice === 'random'
                  ? available
                  : leading;
              chosen =
                state.config.traitors.victimDecision === 'first' && firstPick
                  ? firstPick
                  : chooseSeat(randomCandidates, 'murder-target', slot);
            }
          }
          if (chosen !== null && outcome === null) {
            outcome = state.shields.includes(chosen) ? 'protected' : 'murdered';
          }
          if (outcome === null) return error('MURDER_OUTCOME_MISSING');
          const picks = state.shadowPicks
            .filter(
              (pick) =>
                pick.cycle === state!.cycle &&
                pick.slot === slot &&
                livingTraitors.some((seat) => seat.id === pick.seatId),
            )
            .sort((left, right) => left.seq - right.seq)
            .map(({ seatId, choice, round }) => ({ seatId, choice, round }));
          emit('MurderSlotResolved', {
            cycle: state.cycle,
            slot,
            picks,
            chosen,
            outcome,
          });

          if (slot < slotCount) {
            const seatsAfterSlot =
              remainingSeats - (outcome === 'murdered' ? 1 : 0);
            const faithfulAfterSlot = seatsAfterSlot - livingTraitors.length;
            const gameEndsAfterSlot =
              outcome === 'game-ended' ||
              (outcome === 'murdered' &&
                (seatsAfterSlot <= 2 ||
                  (state.config.endgame.parity &&
                    livingTraitors.length >= faithfulAfterSlot)));
            if (gameEndsAfterSlot) {
              emit('MurderSlotResolved', {
                cycle: state.cycle,
                slot: 2,
                picks: [],
                chosen: null,
                outcome: 'game-ended',
              });
            } else {
              const shadowDuration = state.config.rehearsal.enabled
                ? null
                : duration('SHADOW');
              emit('ShadowSlotAdvanced', {
                cycle: state.cycle,
                slot: 2,
                deadline:
                  shadowDuration === null
                    ? null
                    : ctx.now + Math.ceil(shadowDuration / 2),
                shadowEndAt:
                  shadowDuration === null ? null : ctx.now + shadowDuration,
              });
              break;
            }
          }
        }
        if (state.config.tasks.enabled)
          emit('TaskMurderCancelled', {
            cycle: state!.cycle,
            cancelled: taskPenalty,
            traitors: taskPenalty ? livingTraitors.map((seat) => seat.id) : [],
          });
        const cycleResolutions = state.murderResolutions.filter(
          (resolution) => resolution.cycle === state!.cycle,
        );
        const victims = cycleResolutions.flatMap((resolution) =>
          resolution.outcome === 'murdered' && resolution.chosen
            ? [resolution.chosen]
            : [],
        );
        const protectedIds = cycleResolutions.flatMap((resolution) =>
          resolution.outcome === 'protected' && resolution.chosen
            ? [resolution.chosen]
            : [],
        );
        enter('DAWN');
        emit('DawnResolved', { victims, protected: protectedIds });
        for (const id of victims) {
          remove(id, 'murdered');
          if (finished()) break;
        }
        if (!finished() && !endgameDue() && state!.cycle < state!.maxCycles)
          assignTasks(state!.cycle + 1, alive(state!));
        break;
      }
      if (state.phase === 'FINAL_VOTE') {
        const living = alive(state);
        const ends = living.filter(
          (seat) => state!.endVotes[seat.id] === 'end',
        ).length;
        const end =
          state.config.endgame.endRule === 'unanimous'
            ? ends === living.length
            : ends > living.length / 2;
        if (end)
          emit('GameFinished', {
            winner: living.some((seat) => seat.role === 'traitor')
              ? 'traitor'
              : 'faithful',
            reason: 'end-vote',
          });
        else enter('FINAL_BANISH');
        break;
      }
      if (endgameDue() || state.cycle >= state.maxCycles) {
        enter('FINAL_VOTE');
        break;
      }
      const index = cycle.indexOf(state.phase);
      const next =
        cycle[index + 1] ??
        (state.config.missions.enabled ? 'MISSION' : 'DEBATE');
      enter(next, state.cycle + (state.phase === 'DAWN' ? 1 : 0));
      break;
    }
  }
  return { ok: true, events };
}
