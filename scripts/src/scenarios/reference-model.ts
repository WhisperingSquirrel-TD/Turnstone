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
  let cycle = 0;
  let winner: Role | null = null;
  let finished = false;
  let maxCycles = 0;
  let currentVotes = new Map<string, string>();
  let voteCandidates: string[] = [];
  let revote = false;
  let pendingBanishment: string | null = null;
  let shadowChoices = new Map<string, { choice: string; seq: number }>();
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
  ): string => {
    const recorded = randomChoices.shift();
    const expectedCandidates = ordered(candidates);
    if (
      !recorded ||
      recorded.purpose !== purpose ||
      !same(recorded.candidates, expectedCandidates) ||
      !expectedCandidates.includes(recorded.chosen)
    )
      throw new Error(
        `Reference: random ${purpose} candidate set or selected seat is invalid`,
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
  const chooseMurderTargets = (cycleNumber: number): string[] => {
    if (hasMissedTraitorTask(cycleNumber)) return [];
    const faithful = living()
      .filter((seat) => seat.role === 'faithful')
      .map((seat) => seat.id);
    const traitors = currentTraitors().map((seat) => seat.id);
    const traitorSubmissions = [...shadowChoices.entries()]
      .filter(
        ([seatId, pick]) =>
          traitors.includes(seatId) && faithful.includes(pick.choice),
      )
      .map(([seatId, pick]) => ({
        seatId,
        choice: pick.choice,
        seq: pick.seq,
      }))
      .sort((left, right) => left.seq - right.seq);
    const submitted = traitorSubmissions.map((pick) => pick.choice);
    const selected: string[] = [];
    for (let index = 0; index < config!.traitors.murders; index++) {
      const available = faithful.filter((seatId) => !selected.includes(seatId));
      if (!available.length) break;
      const picks = submitted.filter((seatId) => available.includes(seatId));
      if (config!.traitors.victimDecision === 'unanimous') {
        const unanimousChoice =
          traitors.length > 0 &&
          traitorSubmissions.length === traitors.length &&
          new Set(traitorSubmissions.map((pick) => pick.choice)).size === 1
            ? traitorSubmissions[0]?.choice
            : undefined;
        if (unanimousChoice && available.includes(unanimousChoice)) {
          selected.push(unanimousChoice);
          continue;
        }
        if (config!.traitors.timeoutChoice === 'none') break;
        if (config!.traitors.timeoutChoice === 'random') {
          selected.push(requireRandomChoice('murder-target', available));
          continue;
        }
      } else if (!picks.length && config!.traitors.timeoutChoice === 'none') {
        break;
      }

      if (config!.traitors.victimDecision === 'first' && picks.length) {
        selected.push(picks[0]!);
        continue;
      }
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
      const chosen = requireRandomChoice('murder-target', leading);
      selected.push(chosen);
    }
    return selected;
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
        phase = event.phase;
        cycle = event.cycle;
        if (event.phase === 'SHADOW') {
          shadowRound = 1;
          shadowChoices.clear();
        }
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
        if (
          !player ||
          player.status !== 'alive' ||
          !target ||
          target.status !== 'alive' ||
          phase !== 'SHADOW' ||
          ![1, 2].includes(shadowRound) ||
          player.id === target.id ||
          (player.role === 'traitor' && target.role === 'traitor')
        )
          throw new Error('Reference: invalid shadow choice input');
        shadowChoices.set(event.seatId, {
          choice: event.choice,
          seq: event.seq,
        });
        break;
      }
      case 'ShadowRoundAdvanced':
        if (phase !== 'SHADOW' || shadowRound !== 1 || event.cycle !== cycle)
          throw new Error('Reference: invalid shadow re-vote transition');
        shadowRound = 2;
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
        const selected = chooseMurderTargets(cycle);
        const expectedProtected = selected.filter((id) => shields.includes(id));
        const expectedVictims: string[] = [];
        let remainingSeats = living().length;
        let remainingTraitors = currentTraitors().length;
        for (const victim of selected.filter((id) => !shields.includes(id))) {
          expectedVictims.push(victim);
          remainingSeats--;
          if (seats.get(victim)?.role === 'traitor') remainingTraitors--;
          const remainingFaithful = remainingSeats - remainingTraitors;
          if (
            remainingTraitors === 0 ||
            remainingSeats <= 2 ||
            (config.endgame.parity && remainingTraitors >= remainingFaithful)
          )
            break;
        }
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
  };
}
