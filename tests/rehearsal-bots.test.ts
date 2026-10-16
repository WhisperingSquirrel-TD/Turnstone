import { describe, expect, it, vi } from 'vitest';
import type { State } from '../lib/engine/src/index';
import { command, advance, fixture } from './support/engine';

async function loadBotPolicy() {
  return import('../artifacts/api-server/src/rehearsal-bots');
}

function rehearsalGame(): ReturnType<typeof fixture> {
  const game = fixture(5, {
    rehearsal: {
      enabled: true,
      botSeatIds: ['s1', 's2', 's3', 's4'],
    },
  });
  command(game, { type: 'StartGame' });
  return game;
}

function stateWithOnlyHumanTarget(phase: 'VOTE' | 'SHADOW', cycle: number) {
  const game = rehearsalGame();
  const botSeatId = 's1';
  const human = game.state.seats.find(
    (seat) => !game.state.config.rehearsal.botSeatIds.includes(seat.id),
  );
  const bot = game.state.seats.find((seat) => seat.id === botSeatId);
  if (!human || !bot) throw new Error('Expected rehearsal bot and human seats');
  const state = {
    ...game.state,
    phase,
    cycle,
    seats: [
      { ...bot, role: 'faithful' as const, status: 'alive' as const },
      { ...human, role: 'faithful' as const, status: 'alive' as const },
    ],
    acks: [botSeatId],
    votes: {},
    shadow: {},
    protected: [],
    shadowSlot: 1,
    shadowRound: 1,
    murderResolutions:
      cycle > 1
        ? [
            {
              cycle: 1,
              slot: 1,
              picks: [],
              chosen: null,
              outcome: 'no-target' as const,
            },
          ]
        : [],
    publicLog:
      cycle > 1
        ? [{ seq: 1, at: 1, action: 'dawn' as const, victimIds: [] }]
        : [],
  } as State;
  return { state, botSeatId, humanSeatId: human.id };
}

describe('server rehearsal bot policy', () => {
  it('loads deterministic bot policy without a database URL', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.resetModules();
    try {
      const policy = await loadBotPolicy();
      expect(policy.nextRehearsalBotCommand).toBeTypeOf('function');
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it('acknowledges the private deal before any bot receives a choice', async () => {
    const { nextRehearsalBotCommand } = await loadBotPolicy();
    const game = rehearsalGame();
    expect(nextRehearsalBotCommand(game.state, 's1')).toMatchObject({
      type: 'AcknowledgePrivate',
    });
  });

  it('acknowledges a private vote, then selects another living seat', async () => {
    const { nextRehearsalBotCommand } = await loadBotPolicy();
    const game = rehearsalGame();
    advance(game, 'VOTE');
    expect(nextRehearsalBotCommand(game.state, 's1')).toMatchObject({
      type: 'AcknowledgePrivate',
    });
    command(game, { type: 'AcknowledgePrivate' }, true, {
      kind: 'player',
      seatId: 's1',
    });
    const vote = nextRehearsalBotCommand(game.state, 's1');
    expect(vote?.type).toBe('SubmitVote');
    if (vote?.type === 'SubmitVote') {
      const eligible = game.state.seats
        .filter((seat) => seat.status === 'alive' && seat.id !== 's1')
        .map((seat) => seat.id);
      expect(eligible).toContain(vote.target);
    }
  });

  it('uses the same shadow-choice command for Traitors and decoy players', async () => {
    const { nextRehearsalBotCommand } = await loadBotPolicy();
    const game = rehearsalGame();
    advance(game, 'SHADOW');
    const bot = game.state.seats.find(
      (seat) =>
        game.state.config.rehearsal.botSeatIds.includes(seat.id) &&
        seat.status === 'alive',
    )!;
    expect(nextRehearsalBotCommand(game.state, bot.id)).toMatchObject({
      type: 'AcknowledgePrivate',
    });
    command(game, { type: 'AcknowledgePrivate' }, true, {
      kind: 'player',
      seatId: bot.id,
    });
    const choice = nextRehearsalBotCommand(game.state as State, bot.id);
    expect(choice?.type).toBe('SubmitShadowChoice');
    if (choice?.type === 'SubmitShadowChoice') {
      const eligible = game.state.seats
        .filter((seat) => seat.status === 'alive' && seat.id !== bot.id)
        .filter(
          (seat) =>
            bot.role !== 'traitor' ||
            (seat.role !== 'traitor' &&
              !game.state.protected.includes(seat.id)),
        )
        .map((seat) => seat.id);
      expect(eligible).toContain(choice.choice);
    }
  });

  it('rehearses a distinct second shadow choice in murder slot two', async () => {
    const { nextRehearsalBotCommand } = await loadBotPolicy();
    const game = fixture(7, {
      traitors: {
        number: 2,
        sleeper: false,
        recruitment: 'off',
        murders: 2,
        victimDecision: 'first',
      },
      missions: { enabled: false, shields: 'off' },
      rehearsal: {
        enabled: true,
        botSeatIds: ['s1', 's2', 's3', 's4', 's5', 's6'],
      },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'SHADOW');
    const bot = game.state.seats.find(
      (seat) =>
        seat.role === 'traitor' &&
        game.state.config.rehearsal.botSeatIds.includes(seat.id),
    );
    expect(bot).toBeDefined();
    if (!bot) return;

    const submitBotChoice = () => {
      const pending = nextRehearsalBotCommand(game.state as State, bot.id);
      if (pending?.type === 'AcknowledgePrivate')
        command(game, pending, true, { kind: 'player', seatId: bot.id });
      const choice = nextRehearsalBotCommand(game.state as State, bot.id);
      expect(choice?.type).toBe('SubmitShadowChoice');
      if (choice?.type !== 'SubmitShadowChoice')
        throw new Error('Expected a rehearsal shadow choice');
      command(game, choice, true, { kind: 'player', seatId: bot.id });
      return choice;
    };

    const first = submitBotChoice();
    expect(first.slot).toBe(1);
    const advanceShadowWindow = () => {
      game.context.now =
        game.state.deadline !== null
          ? game.state.deadline + 1
          : game.state.phaseStarted +
            game.state.config.privacy.shieldSeconds * 1_000 +
            game.state.config.privacy.holdMs +
            1;
      command(game, { type: 'AdvancePhase' });
    };
    advanceShadowWindow();
    advanceShadowWindow();
    expect(game.state.shadowSlot).toBe(2);
    const second = submitBotChoice();
    expect(second.slot).toBe(2);
    expect(second.choice).not.toBe(first.choice);
  });

  it.each(['VOTE', 'SHADOW'] as const)(
    'does not target the human in the first cycle during %s',
    async (phase) => {
      const { nextRehearsalBotCommand } = await loadBotPolicy();
      const { state, botSeatId, humanSeatId } = stateWithOnlyHumanTarget(
        phase,
        1,
      );

      const choice = nextRehearsalBotCommand(state, botSeatId);

      expect(choice?.target ?? choice?.choice).not.toBe(humanSeatId);
    },
  );

  it('keeps first-cycle re-vote bot choices inside the tied candidates', async () => {
    const { nextRehearsalBotCommand } = await loadBotPolicy();
    const game = rehearsalGame();
    const tiedCandidateIds = ['s2', 's3'];
    const state = {
      ...game.state,
      phase: 'VOTE' as const,
      cycle: 1,
      revote: true,
      candidates: tiedCandidateIds,
      votes: {},
      acks: game.state.config.rehearsal.botSeatIds,
    };

    const choicesAcrossVersions = Array.from(
      { length: 64 },
      (_, version) =>
        nextRehearsalBotCommand({ ...state, version }, 's1')?.target,
    );

    expect(
      choicesAcrossVersions.every(
        (choice) =>
          typeof choice === 'string' && tiedCandidateIds.includes(choice),
      ),
    ).toBe(true);
  });

  it('keeps endgame re-vote bot choices inside the tied finalists', async () => {
    const { nextRehearsalBotCommand } = await loadBotPolicy();
    const game = rehearsalGame();
    const tiedFinalists = ['s2', 's3'];
    const state = {
      ...game.state,
      phase: 'FINAL_BANISH' as const,
      revote: true,
      candidates: tiedFinalists,
      votes: {},
      acks: game.state.config.rehearsal.botSeatIds,
    };

    const choicesAcrossVersions = Array.from(
      { length: 64 },
      (_, version) =>
        nextRehearsalBotCommand({ ...state, version }, 's1')?.target,
    );

    expect(
      choicesAcrossVersions.every(
        (choice) =>
          typeof choice === 'string' && tiedFinalists.includes(choice),
      ),
    ).toBe(true);
  });

  it('falls back to a living target when the forced human target is out', async () => {
    const { nextRehearsalBotCommand } = await loadBotPolicy();
    const game = rehearsalGame();
    const humanSeatId = game.state.seats.find(
      (seat) => !game.state.config.rehearsal.botSeatIds.includes(seat.id),
    )?.id;
    if (!humanSeatId) throw new Error('Expected a rehearsal human seat');
    const state = {
      ...game.state,
      phase: 'FINAL_BANISH' as const,
      cycle: 2,
      revote: false,
      votes: {},
      acks: game.state.config.rehearsal.botSeatIds,
      publicLog: [{ seq: 1, at: 1, action: 'dawn' as const, victimIds: [] }],
      seats: game.state.seats.map((seat) =>
        seat.id === humanSeatId ? { ...seat, status: 'out' as const } : seat,
      ),
    } as State;

    const choice = nextRehearsalBotCommand(state, 's1', {
      testOnlyForceHumanTargetAfterFirstNight: true,
    });

    expect(choice?.type).toBe('SubmitVote');
    if (choice?.type === 'SubmitVote') {
      const livingTargets = state.seats
        .filter((seat) => seat.status === 'alive' && seat.id !== 's1')
        .map((seat) => seat.id);
      expect(livingTargets).toContain(choice.target);
    }
  });

  it('uses a test-only first-vote pattern that lets the human force a tie', async () => {
    const { nextRehearsalBotCommand } = await loadBotPolicy();
    const botSeatIds = Array.from({ length: 7 }, (_, index) => `s${index + 1}`);
    const game = fixture(8, {
      rehearsal: { enabled: true, botSeatIds },
    });
    command(game, { type: 'StartGame' });
    advance(game, 'VOTE');
    const voteState = { ...game.state, acks: botSeatIds };
    const testOnlyOptions = { testOnlyForceFirstVoteTie: true };

    const targets = botSeatIds.map((seatId) => {
      const choice = nextRehearsalBotCommand(
        voteState,
        seatId,
        testOnlyOptions,
      );
      expect(choice?.type).toBe('SubmitVote');
      return choice?.type === 'SubmitVote' ? choice.target : null;
    });

    expect(targets).toEqual(['s2', 's1', 's1', 's3', 's4', 's5', 's6']);
  });

  it.each(['VOTE', 'SHADOW'] as const)(
    'allows a bot to target the human after the first full cycle during %s',
    async (phase) => {
      const { nextRehearsalBotCommand } = await loadBotPolicy();
      const { state, botSeatId, humanSeatId } = stateWithOnlyHumanTarget(
        phase,
        2,
      );

      const choice = nextRehearsalBotCommand(state, botSeatId);

      expect(choice?.target ?? choice?.choice).toBe(humanSeatId);
    },
  );
});
