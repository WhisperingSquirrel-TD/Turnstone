import {
  assertInvariants,
  decide,
  evolve,
  replay,
  VIEW_ALLOW_LIST,
  VISITOR_VIEW_ALLOW_LIST,
  viewFor,
} from '@workspace/engine';
import { gameConfigSchema } from '@workspace/shared';
import type { Actor, Context, Event, State } from '@workspace/engine';
import { referenceReplay } from './reference-model';

export const BOT_STRATEGIES = [
  'random',
  'cautious-faithful',
  'aggressive-traitor',
  'never-acts',
  'non-voter',
  'serial-disconnector',
  'coordinator-probes-for-secrets',
] as const;

export type BotStrategy = (typeof BOT_STRATEGIES)[number];
export type CompleteGameOptions = {
  seed: number;
  strategy: BotStrategy;
  config: unknown;
  injectFaults?: boolean;
};
export type CompleteGameResult = {
  seed: number;
  strategy: BotStrategy;
  state: State;
  events: Event[];
  steps: number;
  checks: {
    referenceMatches: true;
    potValidation: 'pending Milestone 7';
    replayMatches: true;
    incrementalReplayEvents: number;
    replayStepChecks: number;
    noLeaks: true;
    rejectedFaultCommands: number;
  };
};

export function scenarioTransitionLimit(seatCount: number, maxCycles: number) {
  // Each cycle can include one re-vote and up to one reveal advance per seat.
  // Endgame can use three advances per remaining-seat elimination: final vote,
  // the initial tied ballot, and its random re-vote.
  return 10 + maxCycles * (seatCount + 8) + Math.max(0, seatCount - 2) * 3;
}

const INITIAL_TIME = Date.parse('2026-10-13T09:00:00.000Z');
const taskTags = [
  'family',
  'office',
  'adults-only',
  'seated',
  'remote-friendly',
] as const;

function taskCatalog() {
  const items: {
    id: string;
    text: string;
    tags: (typeof taskTags)[number][];
    minimumAge: number;
    difficulty: 'easy';
  }[] = [];
  for (let mask = 1; mask < 1 << taskTags.length; mask++) {
    const tags = taskTags.filter((_, index) => mask & (1 << index));
    if (tags.includes('family') && tags.includes('adults-only')) continue;
    items.push({
      id: `generated-task-${mask}`,
      text: `Complete the safe social task ${mask} during ordinary play.`,
      tags: [...tags],
      minimumAge: tags.includes('adults-only') ? 18 : 10,
      difficulty: 'easy',
    });
  }
  return items;
}

function makeRandom(seed: number): Context['random'] {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  return {
    int(upperExclusive) {
      if (!Number.isInteger(upperExclusive) || upperExclusive <= 0)
        throw new Error('Invalid random bound');
      return next() % upperExclusive;
    },
    bytes(length) {
      return Uint8Array.from({ length }, () => next() & 0xff);
    },
  };
}

function assertProjectionSafety(state: State): void {
  const allowedKeys = new Set<string>(VIEW_ALLOW_LIST);
  const visitorAllowedKeys = new Set<string>(VISITOR_VIEW_ALLOW_LIST);
  const players = state.seats.map((seat) => ({
    kind: seat.status === 'alive' ? ('player' as const) : ('ghost' as const),
    seatId: seat.id,
    reveal: true,
  }));
  const viewers = [
    { kind: 'visitor' as const },
    { kind: 'coordinator' as const, reveal: true },
    { kind: 'presenter' as const, reveal: true },
    { kind: 'admin' as const, reveal: true },
    { kind: 'host' as const, reveal: true },
    ...players,
  ];

  for (const viewer of viewers) {
    if (viewer.kind === 'visitor') {
      const visitorView = viewFor(viewer, state);
      if (
        Object.keys(visitorView).some((key) => !visitorAllowedKeys.has(key)) ||
        visitorView.seatCount !== state.seats.length ||
        visitorView.lobbyOpen !== (state.phase === 'LOBBY')
      )
        throw new Error('Visitor projection contains non-join data');
      continue;
    }

    const view = viewFor(viewer, state);
    if (Object.keys(view).some((key) => !allowedKeys.has(key)))
      throw new Error('Projection contains a key outside its allow-list');
    const viewerSeat =
      'seatId' in viewer
        ? state.seats.find((seat) => seat.id === viewer.seatId)
        : undefined;
    const allSeeingHost =
      viewer.kind === 'host' && !state.config.basics.coordinatorPlays;
    const blind =
      viewer.kind === 'coordinator' ||
      viewer.kind === 'presenter' ||
      viewer.kind === 'admin' ||
      (viewer.kind === 'host' && !allSeeingHost);
    if (blind && state.phase !== 'FINISHED') {
      if (view.private !== null || view.fairness !== null)
        throw new Error('A non-entitled viewer received private state');
      for (const seatView of view.seats) {
        const source = state.seats.find((seat) => seat.id === seatView.id)!;
        if (seatView.role && !source.publicRole)
          throw new Error('A non-entitled viewer received an unrevealed role');
      }
    }
    if (
      viewer.kind === 'player' &&
      viewerSeat?.role === 'faithful' &&
      state.phase !== 'FINISHED' &&
      view.private?.team.length
    )
      throw new Error('Faithful projection contains a Traitor team');
    if (
      viewer.kind === 'player' &&
      viewerSeat?.role !== 'traitor' &&
      state.phase !== 'FINISHED' &&
      view.private?.choices &&
      Object.keys(view.private.choices).length
    )
      throw new Error('Non-Traitor projection contains Traitor choices');
  }
}

function assertUniformCore(state: State): void {
  if (!['DEAL', 'SHADOW'].includes(state.phase)) return;
  const living = state.seats.filter((seat) => seat.status === 'alive');
  const views = living.map((seat) =>
    viewFor({ kind: 'player', seatId: seat.id, reveal: true }, state),
  );
  const minimumDurations = new Set(
    views.map((view) => view.private?.minimumDurationMs),
  );
  const optionCounts = new Set(
    views.map((view) => view.private?.options.length),
  );
  if (minimumDurations.size > 1 || optionCounts.size > 1)
    throw new Error('Private moments have inconsistent core timing or options');
}

type ReplayCursor = {
  state: State | null;
  eventCount: number;
  stepChecks: number;
};

function assertState(
  game: { state: State; events: Event[] },
  cursor: ReplayCursor,
): void {
  assertInvariants(game.state);
  while (cursor.eventCount < game.events.length) {
    cursor.state = evolve(cursor.state, game.events[cursor.eventCount]!);
    cursor.eventCount++;
  }
  if (JSON.stringify(cursor.state) !== JSON.stringify(game.state))
    throw new Error('Event replay differs from the current state');
  cursor.stepChecks++;
  assertProjectionSafety(game.state);
  assertUniformCore(game.state);
}

export function runCompleteGame(
  options: CompleteGameOptions,
): CompleteGameResult {
  const config = gameConfigSchema.parse(options.config);
  const context: Context = {
    now: INITIAL_TIME,
    actor: { kind: 'coordinator' },
    random: makeRandom(options.seed),
    taskCatalog: taskCatalog(),
  };
  const game: { state: State | null; events: Event[]; context: Context } = {
    state: null,
    events: [],
    context,
  };
  let commandNumber = 0;
  let rejectedFaultCommands = 0;
  const replayCursor: ReplayCursor = {
    state: null,
    eventCount: 0,
    stepChecks: 0,
  };

  const issue = (
    payload: Record<string, unknown>,
    actor: Actor = { kind: 'coordinator' },
  ) => {
    const state = game.state;
    const command = {
      ...payload,
      idempotencyKey: `scenario-${options.seed}-${commandNumber++}`,
      ...(actor.kind === 'coordinator' && state
        ? { expectedVersion: state.version }
        : {}),
    };
    const result = decide(state, command, { ...context, actor });
    if (!result.ok)
      throw new Error(
        `Bot command failed: ${result.code} in ${state?.phase ?? 'DRAFT'} (${payload.type})`,
      );
    for (const event of result.events) {
      const previousSteps = game.state?.steps;
      game.state = evolve(game.state, event);
      game.events.push(event);
      assertInvariants(game.state);
      if (game.state.steps !== previousSteps)
        assertState({ state: game.state, events: game.events }, replayCursor);
    }
  };
  const rejectWithoutMutation = (
    payload: Record<string, unknown>,
    actor: Actor,
  ) => {
    const state = game.state;
    if (!state) throw new Error('Cannot fault-inject before game creation');
    const command = {
      ...payload,
      idempotencyKey: `scenario-${options.seed}-invalid-${commandNumber++}`,
      ...(actor.kind === 'coordinator'
        ? { expectedVersion: Math.max(0, state.version - 1) }
        : {}),
    };
    const snapshot = JSON.stringify(state);
    const result = decide(state, command, { ...context, actor });
    if (result.ok) throw new Error('Illegal fuzz command was accepted');
    if (JSON.stringify(state) !== snapshot)
      throw new Error('Rejected fuzz command mutated authoritative state');
    rejectedFaultCommands++;
  };

  issue({
    type: 'CreateGame',
    id: `scenario-${options.seed}`,
    config,
  });
  issue({ type: 'AdvancePhase' });
  const count = config.players.count;
  for (let index = 0; index < count; index++) {
    const seatId = `seat-${index + 1}`;
    issue(
      {
        type: 'JoinGame',
        seatId,
        name: `Player ${String(index + 1).padStart(2, '0')}`,
      },
      { kind: 'player', seatId },
    );
  }
  issue({ type: 'StartGame' });

  const strategySkipsSeat = (seatIndex: number, state: State) =>
    options.strategy === 'never-acts' ||
    (options.strategy === 'serial-disconnector' &&
      (state.cycle + seatIndex) % 2 === 0);
  const pickIndex = (count: number, state: State, seatIndex: number) =>
    options.strategy === 'random'
      ? context.random.int(count)
      : (state.version + seatIndex) % count;
  const chooseVote = (state: State, seatIndex: number, seatId: string) => {
    const eligibleCandidates = state.seats.filter(
      (seat) =>
        seat.status === 'alive' &&
        seat.id !== seatId &&
        (!state.candidates.length || state.candidates.includes(seat.id)),
    );
    let candidates = eligibleCandidates;
    const actor = state.seats.find((seat) => seat.id === seatId)!;
    if (options.strategy === 'aggressive-traitor' && actor.role === 'traitor')
      candidates = candidates.filter((seat) => seat.role !== 'traitor');
    if (
      options.strategy === 'cautious-faithful' &&
      actor.role === 'faithful' &&
      candidates.some((seat) => seat.publicRole && seat.role === 'traitor')
    )
      candidates = candidates.filter(
        (seat) => seat.publicRole && seat.role === 'traitor',
      );
    if (!candidates.length) candidates = eligibleCandidates;
    return candidates[pickIndex(candidates.length, state, seatIndex)]!.id;
  };

  let pauseResumeInjected = false;
  let invalidVoteInjected = false;
  let departureInjected = false;
  const transitionLimit = scenarioTransitionLimit(count, game.state!.maxCycles);
  for (
    let transitions = 0;
    transitions < transitionLimit && game.state!.phase !== 'FINISHED';
    transitions++
  ) {
    let state = game.state!;
    if (options.injectFaults) {
      if (state.version > 0)
        rejectWithoutMutation(
          { type: 'AdvancePhase' },
          { kind: 'coordinator' },
        );
      if (!pauseResumeInjected && !state.paused) {
        issue({ type: 'Pause' });
        context.now += 1_000;
        issue({ type: 'Resume' });
        state = game.state!;
        pauseResumeInjected = true;
      }
      if (state.phase === 'VOTE' && !invalidVoteInjected) {
        const seat = state.seats.find(
          (candidate) => candidate.status === 'alive',
        );
        if (seat) {
          rejectWithoutMutation(
            { type: 'SubmitVote', target: seat.id },
            { kind: 'player', seatId: seat.id },
          );
          invalidVoteInjected = true;
        }
      }
      if (
        state.phase === 'VOTE' &&
        !departureInjected &&
        state.seats.filter((seat) => seat.status === 'alive').length > 4
      ) {
        const faithful = state.seats.find(
          (seat) => seat.status === 'alive' && seat.role === 'faithful',
        );
        if (faithful) {
          issue({ type: 'MarkDeparted', seatId: faithful.id });
          state = game.state!;
          departureInjected = true;
        }
      }
    }
    if (options.strategy === 'coordinator-probes-for-secrets') {
      const probe = viewFor({ kind: 'coordinator', reveal: true }, state);
      if (probe.private !== null || probe.fairness !== null)
        throw new Error('Adversarial coordinator discovered a secret');
    }

    if (state.phase === 'DEAL') {
      state.seats.forEach((seat, index) => {
        if (!strategySkipsSeat(index, state))
          issue(
            { type: 'AcknowledgePrivate' },
            { kind: 'player', seatId: seat.id },
          );
      });
    } else if (state.phase === 'VOTE' || state.phase === 'FINAL_BANISH') {
      state.seats.forEach((seat, index) => {
        if (
          seat.status !== 'alive' ||
          strategySkipsSeat(index, state) ||
          (options.strategy === 'non-voter' &&
            ['VOTE', 'FINAL_BANISH'].includes(state.phase))
        )
          return;
        issue(
          { type: 'SubmitVote', target: chooseVote(state, index, seat.id) },
          { kind: 'player', seatId: seat.id },
        );
      });
    } else if (state.phase === 'SHADOW') {
      for (const [index, seat] of state.seats.entries()) {
        if (seat.status !== 'alive' || strategySkipsSeat(index, state))
          continue;
        if (config.tasks.enabled && state.shadowRound === 1) {
          const isTraitorTask = state.taskAssignments.some(
            (task) =>
              task.seatId === seat.id &&
              task.cycle === state.cycle &&
              task.taskId !== null &&
              task.status === 'assigned',
          );
          issue(
            {
              type: 'SubmitTaskReport',
              answer: isTraitorTask ? 'done' : 'I saw nothing unusual.',
            },
            { kind: 'player', seatId: seat.id },
          );
        }
        const candidates = state.seats.filter(
          (other) =>
            other.status === 'alive' &&
            other.id !== seat.id &&
            (seat.role !== 'traitor' || other.role !== 'traitor'),
        );
        if (candidates.length)
          issue(
            {
              type: 'SubmitShadowChoice',
              choice:
                candidates[pickIndex(candidates.length, state, index)]!.id,
            },
            { kind: 'player', seatId: seat.id },
          );
      }
    } else if (state.phase === 'FINAL_VOTE') {
      state.seats.forEach((seat, index) => {
        if (
          seat.status !== 'alive' ||
          strategySkipsSeat(index, state) ||
          options.strategy === 'non-voter'
        )
          return;
        const choice =
          options.strategy === 'aggressive-traitor' && seat.role === 'traitor'
            ? 'end'
            : 'continue';
        issue(
          { type: 'SubmitEndgameVote', choice },
          { kind: 'player', seatId: seat.id },
        );
      });
    }

    const current = game.state!;
    if (current.phase === 'FINISHED') break;
    context.now =
      Math.max(
        current.deadline ?? context.now,
        current.phaseStarted +
          current.config.privacy.shieldSeconds * 1000 +
          current.config.privacy.holdMs,
      ) + 1;
    issue({ type: 'AdvancePhase' });
  }

  const finalState = game.state!;
  if (finalState.phase !== 'FINISHED')
    throw new Error(`Scenario did not terminate (seed ${options.seed})`);
  const maximumRuleSteps =
    1 + finalState.maxCycles * 7 + Math.max(0, count - 2);
  if (finalState.steps > maximumRuleSteps)
    throw new Error(
      `Scenario exceeded its D13 rule-step bound (seed ${options.seed})`,
    );
  if (JSON.stringify(replay(game.events)) !== JSON.stringify(finalState))
    throw new Error('Full event replay differs from the final state');
  const reference = referenceReplay(game.events);
  const referenceSeats = reference.seats.map(({ id, role, status }) => ({
    id,
    role,
    status,
  }));
  const actualSeats = finalState.seats.map(({ id, role, status }) => ({
    id,
    role,
    status,
  }));
  if (JSON.stringify(referenceSeats) !== JSON.stringify(actualSeats))
    throw new Error('Independent reference model disagrees on seat outcomes');
  if (!reference.finished || reference.winner !== finalState.winner)
    throw new Error('Independent reference model disagrees on game result');
  assertState({ state: finalState, events: game.events }, replayCursor);

  return {
    seed: options.seed,
    strategy: options.strategy,
    state: finalState,
    events: game.events,
    steps: finalState.steps,
    checks: {
      referenceMatches: true,
      potValidation: reference.potCheck,
      replayMatches: true,
      incrementalReplayEvents: replayCursor.eventCount,
      replayStepChecks: replayCursor.stepChecks,
      noLeaks: true,
      rejectedFaultCommands,
    },
  };
}
