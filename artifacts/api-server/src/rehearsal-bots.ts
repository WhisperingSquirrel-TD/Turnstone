import { createHash } from 'node:crypto';
import { decide, replay, replayFrom, type State } from '@workspace/engine';
import { commandSchema } from '@workspace/shared';
import { gameRandom } from '@workspace/security/game-random';

function commandHash(command: unknown): string {
  return createHash('sha256').update(JSON.stringify(command)).digest('hex');
}

async function loadState(gameId: string): Promise<State | null> {
  const { readGameEvents, readGameEventsAfter, readLatestGameSnapshot } =
    await import('@workspace/db/game-store');
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
  options: {
    testOnlyForceHumanTargetAfterFirstNight?: boolean;
    testOnlyForceFirstVoteTie?: boolean;
  } = {},
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
  if (
    privatePhases.has(state.phase) &&
    (!state.acks.includes(seatId) ||
      (state.phase === 'DEAL' && !(state.readySeats ?? []).includes(seatId)))
  )
    return {
      type: 'AcknowledgePrivate',
      ...(state.phase === 'DEAL' ? { ready: true } : {}),
    };

  const humanSeatId = state.seats.find(
    (candidate) => !state.config.rehearsal.botSeatIds.includes(candidate.id),
  )?.id;
  const firstNightComplete = state.publicLog.some(
    (entry) => entry.action === 'dawn',
  );

  if (state.phase === 'VOTE' || state.phase === 'FINAL_BANISH') {
    if (state.votes[seatId]) return null;
    const revoteCandidates = state.revote ? new Set(state.candidates) : null;
    const candidates = state.seats.filter(
      (candidate) =>
        candidate.status === 'alive' &&
        candidate.id !== seatId &&
        (!revoteCandidates || revoteCandidates.has(candidate.id)) &&
        (firstNightComplete || candidate.id !== humanSeatId),
    );
    const firstVoteTieTargetIndexes = [1, 0, 0, 2, 3, 4, 5];
    const botIndex = state.config.rehearsal.botSeatIds.indexOf(seatId);
    const tieTargetIndex =
      options.testOnlyForceFirstVoteTie &&
      state.phase === 'VOTE' &&
      !state.revote &&
      state.cycle === 1 &&
      state.config.rehearsal.botSeatIds.length ===
        firstVoteTieTargetIndexes.length
        ? firstVoteTieTargetIndexes[botIndex]
        : undefined;
    const tieTargetId =
      tieTargetIndex === undefined
        ? undefined
        : state.config.rehearsal.botSeatIds[tieTargetIndex];
    const testOnlyTieTarget = candidates.find(
      (candidate) => candidate.id === tieTargetId,
    );
    const forcedHumanTarget =
      options.testOnlyForceHumanTargetAfterFirstNight &&
      firstNightComplete &&
      humanSeatId
        ? candidates.find((candidate) => candidate.id === humanSeatId)
        : undefined;
    const target =
      forcedHumanTarget ??
      testOnlyTieTarget ??
      choose(state.id, state, seatId, candidates);
    return target ? { type: 'SubmitVote', target: target.id } : null;
  }

  if (state.phase === 'SHADOW') {
    if (state.shadow[seatId]) return null;
    const firstChoice =
      state.shadowSlot === 2
        ? state.shadowPicks
            .filter(
              (pick) =>
                pick.cycle === state.cycle &&
                pick.slot === 1 &&
                pick.seatId === seatId,
            )
            .sort((left, right) => right.seq - left.seq)[0]?.choice
        : undefined;
    const candidates = state.seats.filter(
      (candidate) =>
        candidate.status === 'alive' &&
        candidate.id !== seatId &&
        candidate.id !== firstChoice &&
        (firstNightComplete || candidate.id !== humanSeatId) &&
        (seat.role !== 'traitor' ||
          (candidate.role !== 'traitor' &&
            !state.protected.includes(candidate.id))),
    );
    const target = choose(state.id, state, seatId, candidates);
    return target
      ? {
          type: 'SubmitShadowChoice',
          choice: target.id,
          slot: state.shadowSlot as 1 | 2,
        }
      : null;
  }

  if (state.phase === 'FINAL_VOTE') {
    if (state.endVotes[seatId]) return null;
    return {
      type: 'SubmitEndgameVote',
      choice: options.testOnlyForceHumanTargetAfterFirstNight
        ? 'continue'
        : 'end',
    };
  }

  return null;
}

export function createRehearsalBotRunner(
  options: {
    publishGame?: (gameId: string) => Promise<void>;
    testOnlyForceHumanTargetAfterFirstNight?: boolean;
    testOnlyForceFirstVoteTie?: boolean;
  } = {},
) {
  async function processGame(gameId: string): Promise<void> {
    let state = await loadState(gameId);
    if (!state || !state.config.rehearsal.enabled || state.winner) return;
    const { appendGameEvents } = await import('@workspace/db/game-store');
    let changed = false;
    for (let step = 0; step < 100; step += 1) {
      const next = state.config.rehearsal.botSeatIds
        .map((seatId) => ({
          seatId,
          command: nextRehearsalBotCommand(state!, seatId, {
            testOnlyForceHumanTargetAfterFirstNight:
              options.testOnlyForceHumanTargetAfterFirstNight,
            testOnlyForceFirstVoteTie: options.testOnlyForceFirstVoteTie,
          }),
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
