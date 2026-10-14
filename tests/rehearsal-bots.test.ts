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
});
