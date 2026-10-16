import { expect, it } from 'vitest';
import type { Event } from '../lib/engine/src/index';
import { injectScenarioEngineFault } from '../scripts/src/scenarios/fault-injection';
import { gameConfigSchema } from '../lib/shared/src/config';
import { referenceReplay } from '../scripts/src/scenarios/reference-model';
import { runCompleteGame } from '../scripts/src/scenarios/simulate';

const baseConfig = {
  players: { count: 5 },
  traitors: { number: 1, sleeper: false, recruitment: 'off' },
  missions: { enabled: false, shields: 'off' },
  roundTable: { tieRule: 'revote-random', revealStyle: 'all' },
  endgame: { size: 3, parity: false },
  schedule: { format: 'quick', plannedCycles: 1 },
};

function config(overrides: Record<string, unknown> = {}) {
  return gameConfigSchema.parse({ ...baseConfig, ...overrides });
}

function event(
  seq: number,
  type: Event['type'],
  payload: Record<string, unknown> = {},
): Event {
  return {
    seq,
    at: seq,
    schemaVersion: 1,
    type,
    ...payload,
  } as Event;
}

function startingEvents(
  testConfig: ReturnType<typeof config>,
  roles: Record<string, 'traitor' | 'faithful'>,
  sleeper: string | null = null,
): Event[] {
  const seats = ['seat-1', 'seat-2', 'seat-3', 'seat-4', 'seat-5'];
  return [
    event(1, 'GameCreated', { id: 'reference-test', config: testConfig }),
    ...seats.map((seatId, index) =>
      event(index + 2, 'SeatJoined', { seatId, name: seatId }),
    ),
    event(7, 'RolesDealt', {
      roles,
      salt: 'a'.repeat(64),
      commitment: 'b'.repeat(64),
      sleeper,
      redeal: false,
    }),
  ];
}

it('does not consume the second-slot random draw while checking the slot transition', () => {
  const gameConfig = config({
    players: { count: 8 },
    traitors: {
      number: 2,
      sleeper: false,
      recruitment: 'off',
      murders: 2,
      victimDecision: 'unanimous',
      timeoutChoice: 'random',
    },
    endgame: { size: 3, parity: false },
    schedule: { format: 'quick', plannedCycles: 1 },
  });

  expect(
    runCompleteGame({
      seed: 24328784,
      strategy: 'tie-then-abstain',
      config: gameConfig,
    }).checks.referenceMatches,
  ).toBe(true);
});

function majorityVoteTranscript(): Event[] {
  return [
    ...startingEvents(config(), {
      'seat-1': 'traitor',
      'seat-2': 'faithful',
      'seat-3': 'faithful',
      'seat-4': 'faithful',
      'seat-5': 'faithful',
    }),
    event(8, 'PhaseChanged', {
      phase: 'VOTE',
      deadline: null,
      cycle: 1,
    }),
    event(9, 'VoteSubmitted', { seatId: 'seat-1', target: 'seat-3' }),
    event(10, 'VoteSubmitted', { seatId: 'seat-2', target: 'seat-3' }),
    event(11, 'VoteSubmitted', { seatId: 'seat-3', target: 'seat-2' }),
    event(12, 'VoteSubmitted', { seatId: 'seat-4', target: 'seat-3' }),
    event(13, 'VoteSubmitted', { seatId: 'seat-5', target: 'seat-2' }),
    event(14, 'VoteClosed', {
      target: 'seat-3',
      revote: false,
      candidates: [],
    }),
    event(15, 'SeatRemoved', {
      seatId: 'seat-3',
      reason: 'banished',
      publicRole: true,
    }),
  ];
}

it('rejects a banishment of the runner-up instead of the vote winner', () => {
  const events = majorityVoteTranscript();
  expect(referenceReplay(events).eliminated).toEqual(['seat-3']);
  expect(() =>
    referenceReplay(injectScenarioEngineFault(events, 'banish-runner-up')),
  ).toThrow('Reference: vote result did not match tally');
});

it('requires the configured revote before breaking a cycle tie', () => {
  const events = startingEvents(
    config({ roundTable: { tieRule: 'revote-none' } }),
    {
      'seat-1': 'traitor',
      'seat-2': 'faithful',
      'seat-3': 'faithful',
      'seat-4': 'faithful',
      'seat-5': 'faithful',
    },
  );
  events.push(
    event(8, 'PhaseChanged', { phase: 'VOTE', deadline: null, cycle: 1 }),
    event(9, 'VoteSubmitted', { seatId: 'seat-1', target: 'seat-2' }),
    event(10, 'VoteSubmitted', { seatId: 'seat-2', target: 'seat-3' }),
    event(11, 'VoteSubmitted', { seatId: 'seat-3', target: 'seat-2' }),
    event(12, 'VoteSubmitted', { seatId: 'seat-4', target: 'seat-3' }),
    event(13, 'VoteClosed', {
      target: null,
      revote: true,
      candidates: ['seat-2', 'seat-3'],
    }),
    event(14, 'PhaseChanged', { phase: 'VOTE', deadline: null, cycle: 1 }),
    event(15, 'VoteSubmitted', { seatId: 'seat-1', target: 'seat-2' }),
    event(16, 'VoteSubmitted', { seatId: 'seat-4', target: 'seat-3' }),
    event(17, 'VoteClosed', {
      target: null,
      revote: false,
      candidates: [],
    }),
  );

  expect(referenceReplay(events).eliminated).toEqual([]);
  expect(() =>
    referenceReplay(injectScenarioEngineFault(events, 'wrong-cycle-tie-break')),
  ).toThrow('Reference: vote result did not match tally');
});

it('validates the exact candidate set and chosen seat for a random tie-break', () => {
  const events = startingEvents(config(), {
    'seat-1': 'traitor',
    'seat-2': 'faithful',
    'seat-3': 'faithful',
    'seat-4': 'faithful',
    'seat-5': 'faithful',
  });
  events.push(
    event(8, 'PhaseChanged', { phase: 'VOTE', deadline: null, cycle: 1 }),
    event(9, 'VoteSubmitted', { seatId: 'seat-1', target: 'seat-2' }),
    event(10, 'VoteSubmitted', { seatId: 'seat-2', target: 'seat-3' }),
    event(11, 'VoteSubmitted', { seatId: 'seat-3', target: 'seat-2' }),
    event(12, 'VoteSubmitted', { seatId: 'seat-4', target: 'seat-3' }),
    event(13, 'VoteClosed', {
      target: null,
      revote: true,
      candidates: ['seat-2', 'seat-3'],
    }),
    event(14, 'PhaseChanged', { phase: 'VOTE', deadline: null, cycle: 1 }),
    event(15, 'VoteSubmitted', { seatId: 'seat-1', target: 'seat-2' }),
    event(16, 'VoteSubmitted', { seatId: 'seat-2', target: 'seat-3' }),
    event(17, 'VoteSubmitted', { seatId: 'seat-3', target: 'seat-2' }),
    event(18, 'VoteSubmitted', { seatId: 'seat-4', target: 'seat-3' }),
    event(19, 'RandomChoiceRecorded', {
      purpose: 'cycle-vote-tie-break',
      candidates: ['seat-2', 'seat-3'],
      chosen: 'seat-2',
    }),
    event(20, 'VoteClosed', {
      target: 'seat-2',
      revote: false,
      candidates: [],
    }),
    event(21, 'SeatRemoved', {
      seatId: 'seat-2',
      reason: 'banished',
      publicRole: true,
    }),
  );

  expect(referenceReplay(events).eliminated).toEqual(['seat-2']);
  expect(() =>
    referenceReplay(
      injectScenarioEngineFault(events, 'wrong-random-candidate-set'),
    ),
  ).toThrow('Reference: random cycle-vote-tie-break choice is invalid');
});

it('applies the configured timeout rule after a split unanimous shadow re-vote', () => {
  const events = startingEvents(
    config({
      traitors: {
        number: 2,
        sleeper: false,
        recruitment: 'off',
        victimDecision: 'unanimous',
        timeoutChoice: 'random',
      },
    }),
    {
      'seat-1': 'traitor',
      'seat-2': 'faithful',
      'seat-3': 'faithful',
      'seat-4': 'faithful',
      'seat-5': 'traitor',
    },
  );
  events.push(
    event(8, 'PhaseChanged', { phase: 'SHADOW', deadline: 20, cycle: 1 }),
    event(9, 'ShadowSubmitted', {
      seatId: 'seat-1',
      choice: 'seat-2',
      slot: 1,
      round: 1,
    }),
    event(10, 'ShadowSubmitted', {
      seatId: 'seat-5',
      choice: 'seat-2',
      slot: 1,
      round: 1,
    }),
    event(11, 'ShadowRoundAdvanced', {
      cycle: 1,
      deadline: 30,
      slot: 1,
    }),
    event(12, 'ShadowSubmitted', {
      seatId: 'seat-1',
      choice: 'seat-2',
      slot: 1,
      round: 2,
    }),
    event(13, 'ShadowSubmitted', {
      seatId: 'seat-5',
      choice: 'seat-3',
      slot: 1,
      round: 2,
    }),
    event(14, 'RandomChoiceRecorded', {
      purpose: 'murder-target',
      candidates: ['seat-2', 'seat-3'],
      chosen: 'seat-2',
      slot: 1,
    }),
    event(15, 'MurderSlotResolved', {
      cycle: 1,
      slot: 1,
      picks: [
        { seatId: 'seat-1', choice: 'seat-2', round: 1 },
        { seatId: 'seat-5', choice: 'seat-2', round: 1 },
        { seatId: 'seat-1', choice: 'seat-2', round: 2 },
        { seatId: 'seat-5', choice: 'seat-3', round: 2 },
      ],
      chosen: 'seat-2',
      outcome: 'murdered',
    }),
    event(16, 'PhaseChanged', { phase: 'DAWN', deadline: null, cycle: 1 }),
    event(17, 'DawnResolved', { victims: ['seat-2'], protected: [] }),
    event(18, 'SeatRemoved', {
      seatId: 'seat-2',
      reason: 'murdered',
      publicRole: false,
    }),
  );

  expect(referenceReplay(events).eliminated).toEqual(['seat-2']);
  expect(() =>
    referenceReplay(
      events.filter((item) => item.type !== 'ShadowRoundAdvanced'),
    ),
  ).toThrow('Reference: invalid shadow choice input');
});

it('rejects a DawnResolved event that murders a shielded target', () => {
  const events = startingEvents(
    config({ missions: { enabled: false, shields: 'secret' } }),
    {
      'seat-1': 'traitor',
      'seat-2': 'faithful',
      'seat-3': 'faithful',
      'seat-4': 'faithful',
      'seat-5': 'faithful',
    },
  );
  events.push(
    event(8, 'PhaseChanged', { phase: 'SHADOW', deadline: null, cycle: 1 }),
    event(9, 'ShieldsAllocated', { holders: ['seat-2'] }),
    event(10, 'ShadowSubmitted', {
      seatId: 'seat-1',
      choice: 'seat-2',
      slot: 1,
      round: 1,
    }),
    event(11, 'ShadowRoundAdvanced', {
      cycle: 1,
      deadline: 30,
      slot: 1,
    }),
    event(12, 'ShadowSubmitted', {
      seatId: 'seat-1',
      choice: 'seat-2',
      slot: 1,
      round: 2,
    }),
    event(13, 'RandomChoiceRecorded', {
      purpose: 'murder-target',
      candidates: ['seat-2'],
      chosen: 'seat-2',
      slot: 1,
    }),
    event(14, 'MurderSlotResolved', {
      cycle: 1,
      slot: 1,
      picks: [
        { seatId: 'seat-1', choice: 'seat-2', round: 1 },
        { seatId: 'seat-1', choice: 'seat-2', round: 2 },
      ],
      chosen: 'seat-2',
      outcome: 'protected',
    }),
    event(15, 'PhaseChanged', { phase: 'DAWN', deadline: null, cycle: 1 }),
    event(16, 'DawnResolved', { victims: [], protected: ['seat-2'] }),
  );

  expect(referenceReplay(events).eliminated).toEqual([]);
  expect(() =>
    referenceReplay(injectScenarioEngineFault(events, 'murder-shielded-seat')),
  ).toThrow(
    'Reference: dawn outcomes did not match choices, shields, and task rules',
  );
});

it('rejects a murder when a missed task should cancel it', () => {
  const events = startingEvents(
    config({
      tasks: {
        enabled: true,
        missedConsequence: 'lose-next-murder',
        perCycle: 'each',
      },
    }),
    {
      'seat-1': 'traitor',
      'seat-2': 'faithful',
      'seat-3': 'faithful',
      'seat-4': 'faithful',
      'seat-5': 'faithful',
    },
  );
  events.push(
    event(8, 'PhaseChanged', { phase: 'SHADOW', deadline: null, cycle: 1 }),
    event(9, 'TaskAssigned', {
      seatId: 'seat-1',
      cycle: 1,
      task: {
        id: 'task-1',
        text: 'Move the blue cup to the left side of the table.',
        tags: ['family'],
        minimumAge: 5,
        difficulty: 'easy',
      },
      shared: false,
    }),
    event(10, 'TaskReported', {
      seatId: 'seat-1',
      cycle: 1,
      report: 'missed',
    }),
    event(11, 'ShadowSubmitted', {
      seatId: 'seat-1',
      choice: 'seat-2',
      slot: 1,
      round: 1,
    }),
    event(12, 'ShadowRoundAdvanced', {
      cycle: 1,
      deadline: 30,
      slot: 1,
    }),
    event(13, 'ShadowSubmitted', {
      seatId: 'seat-1',
      choice: 'seat-2',
      slot: 1,
      round: 2,
    }),
    event(14, 'MurderSlotResolved', {
      cycle: 1,
      slot: 1,
      picks: [
        { seatId: 'seat-1', choice: 'seat-2', round: 1 },
        { seatId: 'seat-1', choice: 'seat-2', round: 2 },
      ],
      chosen: null,
      outcome: 'cancelled',
    }),
    event(15, 'TaskMurderCancelled', {
      cycle: 1,
      cancelled: true,
      traitors: ['seat-1'],
    }),
    event(16, 'PhaseChanged', { phase: 'DAWN', deadline: null, cycle: 1 }),
    event(17, 'DawnResolved', { victims: [], protected: [] }),
  );

  expect(referenceReplay(events).eliminated).toEqual([]);
  expect(() =>
    referenceReplay(injectScenarioEngineFault(events, 'ignore-missed-task')),
  ).toThrow('Reference: task-murder cancellation is incorrect');
});

it('requires an immediate Traitor win when parity is reached', () => {
  const events = startingEvents(
    config({
      traitors: { number: 2, sleeper: false, recruitment: 'off' },
      endgame: { size: 3, parity: true },
    }),
    {
      'seat-1': 'traitor',
      'seat-2': 'traitor',
      'seat-3': 'faithful',
      'seat-4': 'faithful',
      'seat-5': 'faithful',
    },
  );
  events.push(
    event(8, 'SeatRemoved', {
      seatId: 'seat-3',
      reason: 'departed',
      publicRole: false,
    }),
    event(9, 'GameFinished', { winner: 'traitor', reason: 'parity' }),
  );

  expect(referenceReplay(events).winner).toBe('traitor');
  expect(() =>
    referenceReplay(
      injectScenarioEngineFault(events, 'wrong-parity-threshold'),
    ),
  ).toThrow('Reference: required finish event is missing after parity');
});

it('stops the reference dawn victim list at the first immediate win', () => {
  const events = startingEvents(
    config({
      traitors: {
        number: 2,
        sleeper: false,
        recruitment: 'off',
        murders: 2,
      },
      endgame: { size: 3, parity: true },
    }),
    {
      'seat-1': 'traitor',
      'seat-2': 'traitor',
      'seat-3': 'faithful',
      'seat-4': 'faithful',
      'seat-5': 'faithful',
    },
  );
  events.push(
    event(8, 'PhaseChanged', { phase: 'SHADOW', deadline: 20, cycle: 1 }),
    event(9, 'ShadowSubmitted', {
      seatId: 'seat-1',
      choice: 'seat-3',
      slot: 1,
      round: 1,
    }),
    event(10, 'ShadowSubmitted', {
      seatId: 'seat-2',
      choice: 'seat-3',
      slot: 1,
      round: 1,
    }),
    event(11, 'ShadowRoundAdvanced', {
      cycle: 1,
      deadline: 30,
      slot: 1,
    }),
    event(12, 'ShadowSubmitted', {
      seatId: 'seat-1',
      choice: 'seat-3',
      slot: 1,
      round: 2,
    }),
    event(13, 'ShadowSubmitted', {
      seatId: 'seat-2',
      choice: 'seat-3',
      slot: 1,
      round: 2,
    }),
    event(14, 'RandomChoiceRecorded', {
      purpose: 'murder-target',
      candidates: ['seat-3'],
      chosen: 'seat-3',
      slot: 1,
    }),
    event(15, 'MurderSlotResolved', {
      cycle: 1,
      slot: 1,
      picks: [
        { seatId: 'seat-1', choice: 'seat-3', round: 1 },
        { seatId: 'seat-2', choice: 'seat-3', round: 1 },
        { seatId: 'seat-1', choice: 'seat-3', round: 2 },
        { seatId: 'seat-2', choice: 'seat-3', round: 2 },
      ],
      chosen: 'seat-3',
      outcome: 'murdered',
    }),
    event(16, 'MurderSlotResolved', {
      cycle: 1,
      slot: 2,
      picks: [],
      chosen: null,
      outcome: 'game-ended',
    }),
    event(17, 'PhaseChanged', { phase: 'DAWN', deadline: null, cycle: 1 }),
    event(18, 'DawnResolved', {
      victims: ['seat-3'],
      protected: [],
    }),
    event(19, 'SeatRemoved', {
      seatId: 'seat-3',
      reason: 'murdered',
      publicRole: false,
    }),
    event(20, 'GameFinished', { winner: 'traitor', reason: 'parity' }),
  );

  expect(referenceReplay(events).eliminated).toEqual(['seat-3']);
});

it('activates an eligible sleeper at the next private moment before endgame', () => {
  const events = startingEvents(
    config(),
    {
      'seat-1': 'traitor',
      'seat-2': 'faithful',
      'seat-3': 'faithful',
      'seat-4': 'faithful',
      'seat-5': 'faithful',
    },
    'seat-2',
  );
  events.push(
    event(8, 'SeatRemoved', {
      seatId: 'seat-1',
      reason: 'departed',
      publicRole: false,
    }),
    event(9, 'SleeperWaiting'),
    event(10, 'PhaseChanged', { phase: 'SHADOW', deadline: null, cycle: 1 }),
    event(11, 'SleeperActivated', { seatId: 'seat-2' }),
  );

  const result = referenceReplay(events);
  expect(result.seats.find((seat) => seat.id === 'seat-2')?.role).toBe(
    'traitor',
  );
  expect(result.finished).toBe(false);
});

it('applies D12 precedence when the endgame threshold is reached before activation', () => {
  const events = startingEvents(
    config({ endgame: { size: 4, parity: false } }),
    {
      'seat-1': 'traitor',
      'seat-2': 'faithful',
      'seat-3': 'faithful',
      'seat-4': 'faithful',
      'seat-5': 'faithful',
    },
    'seat-2',
  );
  events.push(
    event(8, 'SeatRemoved', {
      seatId: 'seat-1',
      reason: 'departed',
      publicRole: false,
    }),
    event(9, 'GameFinished', { winner: 'faithful', reason: 'no-traitors' }),
  );

  expect(referenceReplay(events).winner).toBe('faithful');
});

it('derives the eligible recruitment pool after a configured Traitor banishment', () => {
  const events = startingEvents(
    config({
      traitors: {
        number: 2,
        sleeper: false,
        recruitment: 'banished',
      },
    }),
    {
      'seat-1': 'traitor',
      'seat-2': 'traitor',
      'seat-3': 'faithful',
      'seat-4': 'faithful',
      'seat-5': 'faithful',
    },
  );
  events.push(
    event(8, 'PhaseChanged', { phase: 'VOTE', deadline: null, cycle: 1 }),
    event(9, 'VoteSubmitted', { seatId: 'seat-2', target: 'seat-1' }),
    event(10, 'VoteSubmitted', { seatId: 'seat-3', target: 'seat-1' }),
    event(11, 'VoteSubmitted', { seatId: 'seat-4', target: 'seat-1' }),
    event(12, 'VoteSubmitted', { seatId: 'seat-5', target: 'seat-3' }),
    event(13, 'VoteClosed', {
      target: 'seat-1',
      revote: false,
      candidates: [],
    }),
    event(14, 'SeatRemoved', {
      seatId: 'seat-1',
      reason: 'banished',
      publicRole: true,
    }),
  );

  expect(referenceReplay(events).recruitmentTriggers).toEqual([
    {
      seq: 14,
      cycle: 1,
      cause: 'banished',
      eligibleSeats: ['seat-3', 'seat-4', 'seat-5'],
    },
  ]);
});
