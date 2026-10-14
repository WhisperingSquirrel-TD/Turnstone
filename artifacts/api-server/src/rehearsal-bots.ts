import { createHash } from 'node:crypto';
import {
  appendGameEvents,
  readGameEvents,
  readGameEventsAfter,
  readLatestGameSnapshot,
} from '@workspace/db/game-store';
import { decide, replay, replayFrom, type State } from '@workspace/engine';
import { commandSchema } from '@workspace/shared';
import { gameRandom } from '@workspace/security/game-random';

function commandHash(command: unknown): string {
  return createHash('sha256').update(JSON.stringify(command)).digest('hex');
}

async function loadState(gameId: string): Promise<State | null> {
  const snapshot = await readLatestGameSnapshot(gameId);
  if (!snapshot) {
    const events = await readGameEvents(gameId);
    return events.length ? replay(events) : null;
  }
  if (
    !snapshot.state ||
    typeof snapshot.state !== 'object' ||
    !('version' in snapshot.state) ||
    snapshot.state.version !== snapshot.seq
  )
    throw new Error('Stored rehearsal snapshot is invalid');
  return replayFrom(
    snapshot.state as State,
    await readGameEventsAfter(gameId, snapshot.seq),
  );
}

function choose<T>(
  gameId: string,
  state: State,
  seatId: string,
  candidates: readonly T[],
): T | null {
  if (candidates.length === 0) return null;
  const digest = createHash('sha256')
    .update(`${gameId}\u0000${state.version}\u0000${seatId}`)
    .digest();
  return candidates[digest.readUInt32BE(0) % candidates.length] ?? null;
}

export function nextRehearsalBotCommand(
  state: State,
  seatId: string,
): Record<string, unknown> | null {
  if (!state.config.rehearsal.enabled) return null;
  if (!state.config.rehearsal.botSeatIds.includes(seatId)) return null;
  const seat = state.seats.find(
    (candidate) => candidate.id === seatId && candidate.status === 'alive',
  );
  if (!seat) return null;

  const privatePhases = new Set([
    'DEAL',
    'SHADOW',
    'VOTE',
    'FINAL_VOTE',
    'FINAL_BANISH',
  ]);
  if (privatePhases.has(state.phase) && !state.acks.includes(seatId))
    return { type: 'AcknowledgePrivate' };

  if (state.phase === 'VOTE' || state.phase === 'FINAL_BANISH') {
    if (state.votes[seatId]) return null;
    const candidates = state.seats.filter(
      (candidate) => candidate.status === 'alive' && candidate.id !== seatId,
    );
    const target = choose(state.id, state, seatId, candidates);
    return target ? { type: 'SubmitVote', target: target.id } : null;
  }

  if (state.phase === 'SHADOW') {
    if (state.shadow[seatId]) return null;
    const candidates = state.seats.filter(
      (candidate) =>
        candidate.status === 'alive' &&
        candidate.id !== seatId &&
        (seat.role !== 'traitor' ||
          (candidate.role !== 'traitor' &&
            !state.protected.includes(candidate.id))),
    );
    const target = choose(state.id, state, seatId, candidates);
    return target ? { type: 'SubmitShadowChoice', choice: target.id } : null;
  }

  if (state.phase === 'FINAL_VOTE') {
    if (state.endVotes[seatId]) return null;
    return { type: 'SubmitEndgameVote', choice: 'end' };
  }

  return null;
}

export function createRehearsalBotRunner(
  options: {
    publishGame?: (gameId: string) => Promise<void>;
  } = {},
) {
  async function processGame(gameId: string): Promise<void> {
    let state = await loadState(gameId);
    if (!state || !state.config.rehearsal.enabled || state.winner) return;
    let changed = false;
    for (let step = 0; step < 100; step += 1) {
      const next = state.config.rehearsal.botSeatIds
        .map((seatId) => ({
          seatId,
          command: nextRehearsalBotCommand(state!, seatId),
        }))
        .find((candidate) => candidate.command !== null);
      if (!next?.command) break;
      const { seatId, command } = next;
      const idempotencyKey = `rehearsal:${gameId}:${state.version}:${seatId}`;
      const parsed = commandSchema.safeParse({
        ...command,
        idempotencyKey,
      });
      if (!parsed.success) break;
      const result = decide(state, parsed.data, {
        now: Date.now(),
        actor: { kind: 'player', seatId },
        random: gameRandom,
      });
      if (!result.ok || result.events.length === 0) break;
      const nextState = replayFrom(state, result.events);
      const stored = await appendGameEvents({
        gameId,
        actorId: `seat:${seatId}`,
        idempotencyKey,
        requestHash: commandHash(parsed.data),
        expectedVersion: state.version,
        events: result.events,
        ...(nextState.version % 20 === 0
          ? { snapshot: { seq: nextState.version, state: nextState } }
          : {}),
        deadline: {
          kind: nextState.phase,
          dueAt: nextState.deadline,
        },
      });
      if (!stored.ok) {
        state = await loadState(gameId);
        if (!state) break;
        continue;
      }
      state = nextState;
      changed = true;
      if (state.winner) break;
    }
    if (changed) await options.publishGame?.(gameId);
  }

  return { processGame };
}
