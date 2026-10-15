import { createHash } from 'node:crypto';
import {
  claimDueGameDeadlines,
  completeGameDeadline,
  appendGameEvents,
  readGameEvents,
  readGameEventsAfter,
  readLatestGameSnapshot,
  releaseGameDeadline,
  listActiveRehearsalGameIds,
  type DeadlineClaim,
} from '@workspace/db/game-store';
import { decide, replay, replayFrom, type State } from '@workspace/engine';
import { commandSchema } from '@workspace/shared';
import { gameRandom } from '@workspace/security/game-random';

type SchedulerOptions = {
  now?: () => number;
  intervalMs?: number;
  leaseMs?: number;
  batchSize?: number;
  publishGame?: (gameId: string) => Promise<void>;
  processRehearsalGame?: (gameId: string) => Promise<void>;
  onError?: () => void;
};

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
  ) {
    throw new Error('Stored snapshot is invalid');
  }
  return replayFrom(
    snapshot.state as State,
    await readGameEventsAfter(gameId, snapshot.seq),
  );
}

function commandDigest(command: unknown): string {
  return createHash('sha256').update(JSON.stringify(command)).digest('hex');
}

async function advanceDeadline(
  claim: DeadlineClaim,
  now: number,
  publishGame?: (gameId: string) => Promise<void>,
): Promise<void> {
  const state = await loadState(claim.gameId);
  if (
    !state ||
    state.config.rehearsal.enabled ||
    state.version !== claim.version ||
    state.deadline !== claim.dueAt
  ) {
    return;
  }
  const command = commandSchema.parse({
    type: 'AdvancePhase',
    expectedVersion: state.version,
    idempotencyKey: `deadline-${claim.id}`,
  });
  const result = decide(state, command, {
    now,
    actor: { kind: 'system' },
    random: gameRandom,
  });
  if (!result.ok || result.events.length === 0) return;

  const nextState = replayFrom(state, result.events);
  const append = await appendGameEvents({
    gameId: claim.gameId,
    expectedVersion: state.version,
    actorId: 'system',
    idempotencyKey: `deadline-${claim.id}`,
    requestHash: commandDigest(command),
    events: result.events,
    ...(nextState.version % 20 === 0
      ? { snapshot: { seq: nextState.version, state: nextState } }
      : {}),
    deadline: {
      kind: nextState.phase,
      dueAt: nextState.deadline,
    },
  });
  if (append.ok) await publishGame?.(claim.gameId);
}

export function createDeadlineScheduler(options: SchedulerOptions = {}) {
  const now = options.now ?? Date.now;
  const intervalMs = options.intervalMs ?? 1_000;
  const leaseMs = options.leaseMs ?? 30_000;
  const batchSize = options.batchSize ?? 25;
  let activeRun: Promise<void> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastPruneAt = 0;

  async function runOnce(): Promise<void> {
    if (activeRun) return activeRun;
    activeRun = (async () => {
      const currentTime = now();
      if (currentTime - lastPruneAt >= 60_000) {
        lastPruneAt = currentTime;
        try {
          const { pruneExpiredRateLimits } =
            await import('@workspace/db/rate-limit');
          await pruneExpiredRateLimits(currentTime - 24 * 60 * 60 * 1_000);
        } catch {
          options.onError?.();
        }
      }
      const claims = await claimDueGameDeadlines({
        now: currentTime,
        limit: batchSize,
        leaseMs,
      });
      for (const claim of claims) {
        try {
          await advanceDeadline(claim, now(), options.publishGame);
          await completeGameDeadline(claim.id, claim.claimToken);
        } catch {
          await releaseGameDeadline(claim.id, claim.claimToken);
          options.onError?.();
        }
      }
      if (options.processRehearsalGame) {
        const rehearsals = await listActiveRehearsalGameIds(batchSize);
        for (const gameId of rehearsals) {
          try {
            await options.processRehearsalGame(gameId);
          } catch {
            options.onError?.();
          }
        }
      }
    })();
    try {
      await activeRun;
    } finally {
      activeRun = null;
    }
  }

  return {
    runOnce,
    start(): void {
      if (timer) return;
      timer = setInterval(() => {
        void runOnce().catch(() => options.onError?.());
      }, intervalMs);
      void runOnce().catch(() => options.onError?.());
    },
    async stop(): Promise<void> {
      if (timer) clearInterval(timer);
      timer = null;
      await activeRun;
    },
  };
}
