import type { Event, Role } from '@workspace/engine';

type ReferenceSeat = {
  id: string;
  role: Role | null;
  status: 'alive' | 'banished' | 'murdered' | 'departed';
};
type ReferenceConfig = Extract<Event, { type: 'GameCreated' }>['config'];
type RandomChoice = Extract<Event, { type: 'RandomChoiceRecorded' }>;
type TaskStatus = 'assigned' | 'done' | 'missed' | 'void';
type ReferenceTask = {
  seatId: string;
  cycle: number;
  taskId: string | null;
  shared: boolean;
  status: TaskStatus;
};
type ShadowPick = {
  cycle: number;
  slot: 1 | 2;
  round: 1 | 2;
  seatId: string;
  choice: string;
  seq: number;
};
type MurderSlotOutcome = {
  cycle: number;
  slot: 1 | 2;
  picks: { seatId: string; choice: string; round: 1 | 2 }[];
  chosen: string | null;
  outcome: 'murdered' | 'protected' | 'no-target' | 'cancelled' | 'game-ended';
};
type Finish = { winner: Role; reason: string };

export type RecruitmentTrigger = {
  seq: number;
  cycle: number;
  cause: 'banished' | 'below-threshold';
  eligibleSeats: string[];
};

export type ReferenceResult = {
  seats: ReferenceSeat[];
  eliminated: string[];
  winner: Role | null;
  finished: boolean;
  pot: null;
  potCheck: 'pending Milestone 7';
  recruitmentTriggers: RecruitmentTrigger[];
  murderSlots: MurderSlotOutcome[];
};

const ordered = (values: readonly string[]) => [...values].sort();
const same = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length &&
  ordered(left).every((value, index) => value === ordered(right)[index]);

function recommendedTraitors(count: number): number {
  const rows = [
    [7, 1],
    [11, 2],
    [17, 3],
    [24, 4],
    [32, 5],
    [40, 6],
  ] as const;
  const row = rows.find(([maximum]) => count <= maximum);
  if (!row) throw new Error('Reference: invalid configured seat count');
  return row[1];
}

function recommendedFinalSize(count: number): number {
  const rows = [
    [7, 3],
    [11, 4],
    [17, 4],
    [24, 5],
    [32, 6],
    [40, 6],
  ] as const;
  const row = rows.find(([maximum]) => count <= maximum);
  if (!row) throw new Error('Reference: invalid configured seat count');
  return row[1];
}

/**
 * Independent scenario oracle. It uses only the event transcript and a small
 * local rules implementation; it never calls engine decisions, reducers, or
 * projections. Assertions are against the actual recorded outcomes.
 */
export function referenceReplay(events: readonly Event[]): ReferenceResult {
  const seats = new Map<string, ReferenceSeat>();
  const eliminated: string[] = [];
  const tasks: ReferenceTask[] = [];
  const recruitmentTriggers: RecruitmentTrigger[] = [];
  let config: ReferenceConfig | null = null;
  let dealt = false;
  let sleeperId: string | null = null;
  let phase: string | null = null;
  let shadowRound: 0 | 1 | 2 = 0;
  let shadowSlot: 0 | 1 | 2 = 0;
  let cycle = 0;
  let winner: Role | null = null;
  let finished = false;
  let maxCycles = 0;
  let currentVotes = new Map<string, string>();
  let voteCandidates: string[] = [];
  let revote = false;
  let pendingBanishment: string | null = null;
  let shadowChoices = new Map<string, { choice: string; seq: number }>();
  const shadowPickHistory: ShadowPick[] = [];
  const murderSlots: MurderSlotOutcome[] = [];
  let shields: string[] = [];
  let pendingMurderRemovals: string[] = [];
  const cancellationRecordedForCycle = new Set<number>();
  const endVotes = new Map<string, 'end' | 'continue'>();
  const randomChoices: RandomChoice[] = [];
  let waitingForSleeperEvent = false;
  let sleeperWaiting = false;
  let waitingForSleeperActivation = false;
  let immediateFinish: Finish | null = null;

  const living = () =>
    [...seats.values()].filter((seat) => seat.status === 'alive');
  const currentTraitors = () =>
    living().filter((seat) => seat.role === 'traitor');
  const finalSize = () =>
    config!.endgame.size === 'auto'
      ? recommendedFinalSize(config!.players.count)
      : config!.endgame.size;
  const endgameDue = (at: number) => {
    const sizeReached = living().length <= finalSize();
    const end = config!.endgame.at ?? config!.schedule.window?.end ?? null;
    const timeReached = end !== null && at >= Date.parse(end);
    if (config!.endgame.trigger === 'alive') return sizeReached;
    if (config!.endgame.trigger === 'time') return timeReached;
    return sizeReached || timeReached;
  };
  const sleeperCanActivate = (at: number) => {
    const sleeper = sleeperId ? seats.get(sleeperId) : undefined;
    return Boolean(
      sleeper &&
      sleeper.status === 'alive' &&
      sleeper.role === 'faithful' &&
      living().length > 3 &&
      !['ENDGAME', 'FINAL_VOTE', 'FINAL_BANISH'].includes(phase ?? '') &&
      !endgameDue(at),
    );
  };
  const gameEndedBeforeMurderSlot = (cycleNumber: number) => {
    const traitors = currentTraitors();
    const previousMurders = murderSlots.filter(
      (entry) => entry.cycle === cycleNumber && entry.outcome === 'murdered',
    ).length;
    const remainingSeats = living().length - previousMurders;
    const remainingFaithful = remainingSeats - traitors.length;
    return (
      remainingSeats <= 2 ||
      (config!.endgame.parity && traitors.length >= remainingFaithful)
    );
  };
  const expectedFinish = (at: number): Finish | 'sleeper-waiting' | null => {
    const aliveSeats = living();
    const traitors = aliveSeats.filter((seat) => seat.role === 'traitor');
    if (dealt && traitors.length === 0) {
      if (sleeperCanActivate(at)) return 'sleeper-waiting';
      return { winner: 'faithful', reason: 'no-traitors' };
    }
    if (dealt && traitors.length > 0) {
      if (aliveSeats.length <= 2)
        return { winner: 'traitor', reason: 'two-players' };
      const faithfulCount = aliveSeats.length - traitors.length;
      if (config!.endgame.parity && traitors.length >= faithfulCount)
        return { winner: 'traitor', reason: 'parity' };
    }
    return null;
  };
  const requireRandomChoice = (
    purpose: RandomChoice['purpose'],
    candidates: readonly string[],
    slot?: 1 | 2,
  ): string => {
    const recorded = randomChoices.shift();
    const expectedCandidates = ordered(candidates);
    if (
      !recorded ||
      recorded.purpose !== purpose ||
      !same(recorded.candidates, expectedCandidates) ||
      !expectedCandidates.includes(recorded.chosen) ||
      (slot !== undefined && (recorded.slot ?? 1) !== slot)
    )
      throw new Error(
        `Reference: random ${purpose} choice is invalid (expected candidates ${JSON.stringify(expectedCandidates)}${slot === undefined ? '' : ` for slot ${slot}`}; recorded ${JSON.stringify(recorded ?? null)})`,
      );
    return recorded.chosen;
  };
  const hasMissedTraitorTask = (cycleNumber: number) => {
    if (
      !config!.tasks.enabled ||
      config!.tasks.missedConsequence !== 'lose-next-murder' ||
      config!.traitors.murders === 0
    )
      return false;
    const livingTraitorIds = new Set(currentTraitors().map((seat) => seat.id));
    const currentTasks = tasks.filter(
      (task) =>
        task.cycle === cycleNumber &&
        task.status !== 'void' &&
        livingTraitorIds.has(task.seatId),
    );
    const missedIndividual = currentTasks.some(
      (task) =>
        !task.shared &&
        (task.status === 'missed' || task.status === 'assigned'),
    );
    const sharedIds = new Set(
      currentTasks.filter((task) => task.shared).map((task) => task.taskId),
    );
    const missedShared = [...sharedIds].some((taskId) => {
      const reports = currentTasks.filter(
        (task) => task.shared && task.taskId === taskId,
      );
      // One completed report completes a shared task for the whole team.
      return (
        !reports.some((task) => task.status === 'done') &&
        reports.some(
          (task) => task.status === 'missed' || task.status === 'assigned',
        )
      );
    });
    return missedIndividual || missedShared;
  };
  const chooseMurderSlot = (
    cycleNumber: number,
    slot: 1 | 2,
  ): MurderSlotOutcome => {
    const traitors = currentTraitors();
    const priorSlots = murderSlots.filter(
      (entry) => entry.cycle === cycleNumber,
    );
    const alreadySelected = priorSlots.flatMap((entry) =>
      entry.chosen ? [entry.chosen] : [],
    );
    const gameEnded = gameEndedBeforeMurderSlot(cycleNumber);
    const faithful = living()
      .filter((seat) => seat.role === 'faithful')
      .map((seat) => seat.id);
    const available = faithful.filter(
      (seatId) => !alreadySelected.includes(seatId),
    );
    const slotPicks = shadowPickHistory
      .filter(
        (pick) =>
          pick.cycle === cycleNumber &&
          pick.slot === slot &&
          traitors.some((seat) => seat.id === pick.seatId),
      )
      .sort((left, right) => left.seq - right.seq);
    const roundTwo = slotPicks.filter((pick) => pick.round === 2);
    const submitted = roundTwo.map((pick) => pick.choice);
    const picks = submitted.filter((seatId) => available.includes(seatId));
    const submittedByEveryTraitor =
      new Set(roundTwo.map((pick) => pick.seatId)).size === traitors.length;
    let chosen: string | null = null;
    let outcome: MurderSlotOutcome['outcome'] | null = null;

    if (hasMissedTraitorTask(cycleNumber)) outcome = 'cancelled';
    else if (gameEnded) outcome = 'game-ended';
    else if (!available.length) outcome = 'no-target';
    else if (config!.traitors.victimDecision === 'unanimous') {
      const unanimousChoice =
        traitors.length > 0 &&
        submittedByEveryTraitor &&
        new Set(picks).size === 1 &&
        picks.length === traitors.length
          ? picks[0]
          : undefined;
      if (unanimousChoice && available.includes(unanimousChoice))
        chosen = unanimousChoice;
      else if (config!.traitors.timeoutChoice === 'none') outcome = 'no-target';
      else if (config!.traitors.timeoutChoice === 'random') {
        const counts = new Map(
          available.map((seatId) => [
            seatId,
            picks.filter((pick) => pick === seatId).length,
          ]),
        );
        const maximum = Math.max(...counts.values());
        const leading = picks.length
          ? available.filter((seatId) => counts.get(seatId) === maximum)
          : available;
        chosen = requireRandomChoice('murder-target', leading, slot);
      }
    }
    if (chosen === null && outcome === null) {
      if (!picks.length && config!.traitors.timeoutChoice === 'none')
        outcome = 'no-target';
      else {
        const counts = new Map(
          available.map((seatId) => [
            seatId,
            picks.filter((pick) => pick === seatId).length,
          ]),
        );
        const maximum = Math.max(...counts.values());
        const leading =
          config!.traitors.victimDecision !== 'unanimous' &&
          !picks.length &&
          config!.traitors.timeoutChoice === 'random'
            ? available
            : available.filter((seatId) => counts.get(seatId) === maximum);
        const firstPick =
          config!.traitors.victimDecision === 'first' ? picks[0] : undefined;
        chosen =
          config!.traitors.victimDecision === 'first' && firstPick
            ? firstPick
            : requireRandomChoice('murder-target', leading, slot);
      }
    }
    if (chosen !== null)
      outcome = shields.includes(chosen) ? 'protected' : 'murdered';
    const picksForAudit = slotPicks.map(({ seatId, choice, round }) => ({
      seatId,
      choice,
      round,
    }));
    return {
      cycle: cycleNumber,
      slot,
      picks: picksForAudit,
      chosen,
      outcome: outcome ?? 'no-target',
    };
  };
  const recordRecruitmentTrigger = (
    event: Extract<Event, { type: 'SeatRemoved' }>,
  ) => {
    if (!config || !dealt) return;
    const traitorWasRemoved = seats.get(event.seatId)?.role === 'traitor';
    if (!traitorWasRemoved) return;
    const aliveTraitors = currentTraitors().length;
    const banishmentTrigger =
      event.reason === 'banished' && config.traitors.recruitment === 'banished';
    const belowTrigger =
      config.traitors.recruitment === 'below' &&
      aliveTraitors < config.traitors.recruitmentBelow;
    if (!banishmentTrigger && !belowTrigger) return;
    recruitmentTriggers.push({
      seq: event.seq,
      cycle,
      cause: banishmentTrigger ? 'banished' : 'below-threshold',
      eligibleSeats: living()
        .filter((seat) => seat.role === 'faithful')
        .map((seat) => seat.id)
        .sort(),
    });
  };

  for (const event of events) {
    if (finished) throw new Error('Reference: event after game finish');
    if (waitingForSleeperEvent && event.type !== 'SleeperWaiting')
      throw new Error('Reference: eligible sleeper waiting event is missing');
    if (waitingForSleeperActivation && event.type !== 'SleeperActivated')
      throw new Error(
        'Reference: sleeper was not activated at the next private moment',
      );
    if (immediateFinish && event.type !== 'GameFinished')
      throw new Error(
        `Reference: required finish event is missing after ${immediateFinish.reason}`,
      );

    switch (event.type) {
      case 'GameCreated': {
        if (config || seats.size)
          throw new Error('Reference: duplicate game creation');
        config = event.config;
        const final =
          event.config.endgame.size === 'auto'
            ? recommendedFinalSize(event.config.players.count)
            : event.config.endgame.size;
        maxCycles =
          (event.config.schedule.plannedCycles ??
            Math.ceil((event.config.players.count - final) / 2)) + 3;
        break;
      }
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
        if (!config)
          throw new Error('Reference: roles dealt before game creation');
        const expectedTraitors =
          config.traitors.number === 'auto'
            ? recommendedTraitors(living().length)
            : config.traitors.number;
        const roleIds = Object.keys(event.roles);
        if (
          roleIds.some(
            (id) => !seats.has(id) || seats.get(id)!.status !== 'alive',
          ) ||
          Object.values(event.roles).filter((role) => role === 'traitor')
            .length !== expectedTraitors
        )
          throw new Error(
            'Reference: role deal does not match configured seats',
          );
        for (const seat of seats.values())
          seat.role = event.roles[seat.id] ?? null;
        sleeperId = event.sleeper;
        if (
          sleeperId &&
          (!event.roles[sleeperId] || event.roles[sleeperId] !== 'faithful')
        )
          throw new Error('Reference: sleeper is not a dealt Faithful');
        dealt = true;
        break;
      }
      case 'PhaseChanged': {
        if (!config) throw new Error('Reference: phase before game creation');
        if (phase === 'SHADOW' && event.phase === 'DAWN' && shadowRound !== 2)
          throw new Error(
            'Reference: shadow step did not use its fixed second choice window',
          );
        if (phase === 'SHADOW' && event.phase === 'DAWN') {
          const requiredSlots = Math.min(2, config.traitors.murders);
          const resolvedSlots = murderSlots.filter(
            (entry) => entry.cycle === cycle,
          );
          if (resolvedSlots.length !== requiredSlots)
            throw new Error(
              'Reference: dawn began before every murder slot was resolved',
            );
        }
        phase = event.phase;
        cycle = event.cycle;
        if (event.phase === 'SHADOW') {
          shadowRound = 1;
          shadowSlot = 1;
          shadowChoices.clear();
        }
        if (event.phase !== 'SHADOW') shadowSlot = 0;
        if (event.phase === 'VOTE' || event.phase === 'FINAL_BANISH') {
          currentVotes = new Map();
          if (!revote) voteCandidates = [];
        }
        if (event.phase === 'SHADOW') {
          shadowChoices = new Map();
          if (sleeperWaiting) {
            if (sleeperCanActivate(event.at))
              waitingForSleeperActivation = true;
            else
              immediateFinish = { winner: 'faithful', reason: 'no-traitors' };
          }
        }
        if (event.phase === 'FINAL_VOTE') {
          if (!endgameDue(event.at) && cycle < maxCycles)
            throw new Error(
              'Reference: endgame started before its trigger or D13 limit',
            );
          if (
            sleeperWaiting &&
            currentTraitors().length === 0 &&
            !immediateFinish
          )
            immediateFinish = { winner: 'faithful', reason: 'no-traitors' };
        }
        if (event.phase === 'ENDGAME' || event.phase === 'FINAL_BANISH') {
          if (sleeperWaiting && currentTraitors().length === 0)
            immediateFinish = { winner: 'faithful', reason: 'no-traitors' };
        }
        break;
      }
      case 'VoteSubmitted': {
        const voter = seats.get(event.seatId);
        const target = seats.get(event.target);
        const eligible =
          target &&
          target.status === 'alive' &&
          target.id !== event.seatId &&
          (!voteCandidates.length || voteCandidates.includes(target.id));
        if (
          !voter ||
          voter.status !== 'alive' ||
          !eligible ||
          !['VOTE', 'FINAL_BANISH'].includes(phase ?? '')
        )
          throw new Error('Reference: invalid ballot input');
        currentVotes.set(event.seatId, event.target);
        break;
      }
      case 'RandomChoiceRecorded':
        if (
          new Set(event.candidates).size !== event.candidates.length ||
          !event.candidates.includes(event.chosen)
        )
          throw new Error(
            'Reference: random choice is outside its candidate set',
          );
        randomChoices.push(event);
        break;
      case 'VoteClosed': {
        if (!config || !['VOTE', 'FINAL_BANISH'].includes(phase ?? ''))
          throw new Error('Reference: vote closed outside a ballot phase');
        const eligible = living()
          .filter(
            (seat) =>
              !voteCandidates.length || voteCandidates.includes(seat.id),
          )
          .map((seat) => seat.id);
        if (!eligible.length)
          throw new Error('Reference: vote has no eligible candidates');
        const counts = new Map(
          eligible.map((seatId) => [
            seatId,
            [...currentVotes.values()].filter((target) => target === seatId)
              .length,
          ]),
        );
        const highest = Math.max(...counts.values());
        const tied = eligible.filter(
          (seatId) => counts.get(seatId) === highest,
        );
        const isFirstTie = tied.length > 1 && !revote;
        let expectedTarget: string | null;
        let expectedRevote = false;
        let expectedCandidates: string[] = [];
        if (isFirstTie) {
          if (phase === 'VOTE' || phase === 'FINAL_BANISH') {
            expectedTarget = null;
            expectedRevote = true;
            expectedCandidates = tied;
          } else {
            expectedTarget = null;
          }
        } else if (
          tied.length > 1 &&
          phase === 'VOTE' &&
          config.roundTable.tieRule === 'revote-none'
        ) {
          expectedTarget = null;
        } else if (tied.length > 1) {
          expectedTarget = requireRandomChoice(
            phase === 'FINAL_BANISH'
              ? 'endgame-vote-tie-break'
              : 'cycle-vote-tie-break',
            tied,
          );
        } else expectedTarget = tied[0]!;

        if (
          event.target !== expectedTarget ||
          event.revote !== expectedRevote ||
          !same(event.candidates, expectedCandidates)
        ) {
          if (isFirstTie)
            throw new Error(
              'Reference: cycle tie did not start the required revote',
            );
          throw new Error('Reference: vote result did not match tally');
        }
        pendingBanishment = event.target;
        revote = event.revote;
        voteCandidates = event.candidates;
        currentVotes = new Map();
        break;
      }
      case 'VoteSkipped':
        if (phase !== 'VOTE' || currentVotes.size !== 0)
          throw new Error(
            'Reference: vote skipped outside an empty non-endgame ballot',
          );
        pendingBanishment = null;
        revote = false;
        voteCandidates = [];
        currentVotes = new Map();
        break;
      case 'SeatRemoved': {
        const seat = seats.get(event.seatId);
        if (!seat || seat.status !== 'alive')
          throw new Error('Reference: invalid elimination');
        if (event.reason === 'banished' && pendingBanishment !== event.seatId)
          throw new Error(
            'Reference: banishment did not match the ballot result',
          );
        if (event.reason === 'murdered') {
          const expected = pendingMurderRemovals.shift();
          if (expected !== event.seatId)
            throw new Error('Reference: murder removal did not match dawn');
        }
        seat.status = event.reason;
        for (const task of tasks)
          if (task.seatId === event.seatId && task.status === 'assigned')
            task.status = 'void';
        eliminated.push(event.seatId);
        pendingBanishment = null;
        recordRecruitmentTrigger(event);
        const expected = expectedFinish(event.at);
        if (expected === 'sleeper-waiting') waitingForSleeperEvent = true;
        else if (expected) immediateFinish = expected;
        break;
      }
      case 'ShadowSubmitted': {
        const player = seats.get(event.seatId);
        const target = seats.get(event.choice);
        const eventSlot: number = event.slot ?? shadowSlot;
        const eventRound: number = event.round ?? shadowRound;
        if (
          (eventSlot !== 1 && eventSlot !== 2) ||
          (eventRound !== 1 && eventRound !== 2)
        )
          throw new Error('Reference: invalid shadow slot or round');
        const previousSlotPick =
          eventSlot === 2
            ? shadowPickHistory
                .filter(
                  (pick) =>
                    pick.cycle === cycle &&
                    pick.slot === 1 &&
                    pick.seatId === event.seatId,
                )
                .sort((left, right) => right.seq - left.seq)[0]?.choice
            : undefined;
        if (
          !player ||
          player.status !== 'alive' ||
          !target ||
          target.status !== 'alive' ||
          phase !== 'SHADOW' ||
          eventSlot !== shadowSlot ||
          eventRound !== shadowRound ||
          player.id === target.id ||
          (player.role === 'traitor' && target.role === 'traitor') ||
          previousSlotPick === event.choice
        )
          throw new Error('Reference: invalid shadow choice input');
        shadowChoices.set(event.seatId, {
          choice: event.choice,
          seq: event.seq,
        });
        const historyIndex = shadowPickHistory.findIndex(
          (pick) =>
            pick.cycle === cycle &&
            pick.slot === eventSlot &&
            pick.round === eventRound &&
            pick.seatId === event.seatId,
        );
        const pick: ShadowPick = {
          cycle,
          slot: eventSlot as 1 | 2,
          round: eventRound as 1 | 2,
          seatId: event.seatId,
          choice: event.choice,
          seq: event.seq,
        };
        if (historyIndex < 0) shadowPickHistory.push(pick);
        else shadowPickHistory[historyIndex] = pick;
        break;
      }
      case 'ShadowRoundAdvanced':
        if (
          phase !== 'SHADOW' ||
          shadowRound !== 1 ||
          event.cycle !== cycle ||
          (event.slot ?? shadowSlot) !== shadowSlot
        )
          throw new Error('Reference: invalid shadow re-vote transition');
        shadowRound = 2;
        shadowChoices.clear();
        break;
      case 'ShadowSlotAdvanced':
        if (
          phase !== 'SHADOW' ||
          shadowRound !== 2 ||
          shadowSlot !== 1 ||
          event.cycle !== cycle ||
          event.slot !== 2 ||
          !murderSlots.some(
            (entry) => entry.cycle === cycle && entry.slot === 1,
          ) ||
          gameEndedBeforeMurderSlot(cycle)
        )
          throw new Error('Reference: invalid second murder-slot transition');
        shadowSlot = 2;
        shadowRound = 1;
        shadowChoices.clear();
        break;
      case 'TaskAssigned': {
        const seat = seats.get(event.seatId);
        if (!seat || seat.status !== 'alive' || event.cycle < 1)
          throw new Error('Reference: invalid task assignment');
        tasks.push({
          seatId: event.seatId,
          cycle: event.cycle,
          taskId: event.task?.id ?? null,
          shared: event.shared,
          status: 'assigned',
        });
        break;
      }
      case 'TaskReported': {
        const task = tasks.find(
          (item) =>
            item.seatId === event.seatId &&
            item.cycle === event.cycle &&
            item.status !== 'void',
        );
        if (!task) throw new Error('Reference: report has no live task');
        task.status = event.report;
        break;
      }
      case 'TaskMurderCancelled': {
        const expected = hasMissedTraitorTask(event.cycle);
        const traitorIds = expected
          ? currentTraitors()
              .map((seat) => seat.id)
              .sort()
          : [];
        if (event.cancelled !== expected || !same(event.traitors, traitorIds))
          throw new Error('Reference: task-murder cancellation is incorrect');
        cancellationRecordedForCycle.add(event.cycle);
        break;
      }
      case 'ShieldsAllocated':
        if (
          event.holders.some((id) => !living().some((seat) => seat.id === id))
        )
          throw new Error('Reference: shield allocated to an inactive seat');
        shields = [...event.holders];
        break;
      case 'DawnResolved': {
        if (!config || phase !== 'DAWN' || shadowRound !== 2)
          throw new Error('Reference: dawn resolved outside the dawn phase');
        if (config.tasks.enabled && !cancellationRecordedForCycle.has(cycle))
          throw new Error('Reference: task cancellation outcome is missing');
        const cycleSlots = murderSlots.filter((entry) => entry.cycle === cycle);
        const expectedProtected = cycleSlots.flatMap((entry) =>
          entry.outcome === 'protected' && entry.chosen ? [entry.chosen] : [],
        );
        const expectedVictims = cycleSlots.flatMap((entry) =>
          entry.outcome === 'murdered' && entry.chosen ? [entry.chosen] : [],
        );
        if (
          !same(event.victims, expectedVictims) ||
          !same(event.protected, expectedProtected)
        )
          throw new Error(
            `Reference: dawn outcomes did not match choices, shields, and task rules (expected victims ${JSON.stringify(expectedVictims)}, protected ${JSON.stringify(expectedProtected)}; recorded victims ${JSON.stringify(event.victims)}, protected ${JSON.stringify(event.protected)})`,
          );
        pendingMurderRemovals = [...expectedVictims];
        shields = [];
        shadowChoices.clear();
        break;
      }
      case 'MurderSlotResolved': {
        const terminalSkippedSecondSlot =
          event.slot === 2 && shadowSlot === 1 && shadowRound === 2;
        if (
          phase !== 'SHADOW' ||
          event.cycle !== cycle ||
          (event.slot !== shadowSlot && !terminalSkippedSecondSlot) ||
          shadowRound !== 2
        )
          throw new Error(
            'Reference: murder slot resolved outside its private window',
          );
        const expected = chooseMurderSlot(cycle, event.slot);
        if (terminalSkippedSecondSlot && expected.outcome !== 'game-ended')
          throw new Error(
            'Reference: second murder slot skipped without an immediate win',
          );
        const picksMatch =
          expected.picks.length === event.picks.length &&
          expected.picks.every(
            (pick, index) =>
              pick.seatId === event.picks[index]?.seatId &&
              pick.choice === event.picks[index]?.choice &&
              pick.round === event.picks[index]?.round,
          );
        if (
          !picksMatch ||
          event.chosen !== expected.chosen ||
          event.outcome !== expected.outcome
        )
          throw new Error(
            'Reference: murder slot picks or outcome do not match the independent rules',
          );
        murderSlots.push(expected);
        break;
      }
      case 'SleeperWaiting':
        if (!waitingForSleeperEvent)
          throw new Error('Reference: sleeper waiting condition is invalid');
        waitingForSleeperEvent = false;
        sleeperWaiting = true;
        break;
      case 'SleeperActivated': {
        const seat = seats.get(event.seatId);
        if (
          !waitingForSleeperActivation ||
          !seat ||
          seat.status !== 'alive' ||
          seat.role !== 'faithful' ||
          event.seatId !== sleeperId ||
          !sleeperCanActivate(event.at)
        )
          throw new Error('Reference: sleeper activation violates D12');
        waitingForSleeperActivation = false;
        sleeperWaiting = false;
        seat.role = 'traitor';
        const expected = expectedFinish(event.at);
        if (expected && expected !== 'sleeper-waiting')
          immediateFinish = expected;
        break;
      }
      case 'EndgameVote': {
        const seat = seats.get(event.seatId);
        if (!seat || seat.status !== 'alive' || phase !== 'FINAL_VOTE')
          throw new Error('Reference: invalid endgame vote input');
        endVotes.set(event.seatId, event.choice);
        break;
      }
      case 'GameFinished': {
        if (immediateFinish) {
          if (
            event.reason !== immediateFinish.reason ||
            event.winner !== immediateFinish.winner
          )
            throw new Error(
              'Reference: finish does not match the required rule',
            );
          immediateFinish = null;
        } else if (event.reason === 'end-vote') {
          const aliveSeats = living();
          const ends = aliveSeats.filter(
            (seat) => endVotes.get(seat.id) === 'end',
          ).length;
          const shouldEnd =
            config?.endgame.endRule === 'unanimous'
              ? ends === aliveSeats.length
              : ends > aliveSeats.length / 2;
          if (!shouldEnd || phase !== 'FINAL_VOTE')
            throw new Error('Reference: endgame vote did not meet its rule');
          const expected: Role = currentTraitors().length
            ? 'traitor'
            : 'faithful';
          if (event.winner !== expected)
            throw new Error('Reference: endgame winner is incorrect');
        } else if (event.reason === 'ended-early') {
          const expected: Role = currentTraitors().length
            ? 'traitor'
            : 'faithful';
          if (event.winner !== expected)
            throw new Error('Reference: early-finish winner is incorrect');
        } else {
          const expected = expectedFinish(event.at);
          if (
            !expected ||
            expected === 'sleeper-waiting' ||
            expected.reason !== event.reason ||
            expected.winner !== event.winner
          )
            throw new Error('Reference: finish reason violates the win rules');
        }
        if (waitingForSleeperEvent || waitingForSleeperActivation)
          throw new Error(
            'Reference: game finished before sleeper precedence resolved',
          );
        winner = event.winner;
        finished = true;
        break;
      }
      case 'VoteRevealed':
      case 'PrivateAcknowledged':
      case 'TaskDecoyAnswered':
      case 'Paused':
      case 'Resumed':
      case 'DeadlineExtended':
      case 'TraitorMessage':
        break;
    }
  }

  if (waitingForSleeperEvent)
    throw new Error('Reference: eligible sleeper waiting event is missing');
  if (waitingForSleeperActivation)
    throw new Error(
      'Reference: sleeper was not activated at the next private moment',
    );
  if (immediateFinish)
    throw new Error(
      `Reference: required finish event is missing after ${immediateFinish.reason}`,
    );
  if (pendingMurderRemovals.length)
    throw new Error('Reference: DawnResolved victims were not all removed');
  if (randomChoices.length)
    throw new Error(
      'Reference: random choice was not consumed by a rule outcome',
    );

  return {
    seats: [...seats.values()],
    eliminated,
    winner,
    finished,
    pot: null,
    potCheck: 'pending Milestone 7',
    recruitmentTriggers,
    murderSlots,
  };
}
