import {
  decide,
  evolve,
  type Context,
  type State,
  type Event,
  type Actor,
} from '../../lib/engine/src/index';

export type TestGame = { state: State; events: Event[]; context: Context };
export function fixture(
  count: number,
  config: unknown = {},
  joined = count,
): TestGame {
  let seed = 12345;
  const context: Context = {
    actor: { kind: 'coordinator' },
    now: 1_800_000_000_000,
    random: {
      int: (max) => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed % max;
      },
      bytes: (length) =>
        Uint8Array.from({ length }, () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed % 256;
        }),
    },
  };
  const result = decide(
    null,
    {
      type: 'CreateGame',
      id: 'game',
      config: { players: { count }, ...(config as Record<string, unknown>) },
      idempotencyKey: 'create',
    },
    context,
  );
  if (!result.ok) throw new Error(result.code);
  const game: TestGame = {
    state: evolve(null, result.events[0]!),
    events: result.events,
    context,
  };
  command(game, { type: 'AdvancePhase' });
  for (let i = 0; i < joined; i++)
    command(
      game,
      { type: 'JoinGame', seatId: `s${i}`, name: `Player ${i}` },
      true,
      { kind: 'player', seatId: `s${i}` },
    );
  return game;
}
export function command(
  game: TestGame,
  payload: Record<string, unknown>,
  succeed = true,
  actor: Actor = { kind: 'coordinator' },
) {
  const result = decide(
    game.state,
    {
      ...payload,
      idempotencyKey: `v${game.state.version}`,
      expectedVersion: game.state.version,
    },
    { ...game.context, actor },
  );
  if (succeed && !result.ok) throw new Error(result.code);
  if (result.ok)
    for (const event of result.events) {
      game.state = evolve(game.state, event);
      game.events.push(event);
    }
  return result;
}
export function advance(game: TestGame, phase: State['phase']) {
  for (
    let i = 0;
    i < 100 && game.state.phase !== phase && game.state.phase !== 'FINISHED';
    i++
  ) {
    game.context.now = (game.state.deadline ?? game.context.now) + 1;
    command(game, { type: 'AdvancePhase' });
  }
  if (game.state.phase !== phase)
    throw new Error(`Did not reach ${phase}: ${game.state.phase}`);
}
