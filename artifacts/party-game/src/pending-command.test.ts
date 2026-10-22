import { describe, expect, it, vi } from 'vitest';
import { gameCommandStepKey, PendingCommandStore } from './pending-command';

describe('PendingCommandStore', () => {
  it('treats a re-vote and each night slot as separate phase steps', () => {
    const base = {
      gameId: 'game-1',
      viewerSeatId: 'seat-1',
      phase: 'VOTE',
      cycle: 2,
      revote: false,
      shadowRound: 1,
      shadowSlot: 1,
    };

    expect(gameCommandStepKey({ ...base, revote: true })).not.toBe(
      gameCommandStepKey(base),
    );
    expect(gameCommandStepKey({ ...base, viewerSeatId: 'seat-2' })).not.toBe(
      gameCommandStepKey(base),
    );
    expect(
      gameCommandStepKey({
        ...base,
        phase: 'SHADOW',
        shadowSlot: 2,
      }),
    ).not.toBe(
      gameCommandStepKey({
        ...base,
        phase: 'SHADOW',
        shadowSlot: 1,
      }),
    );
  });

  it.each([
    [
      'vote',
      {
        type: 'SubmitVote',
        target: 'seat-a',
        idempotencyKey: 'vote-original',
      },
    ],
    [
      'night choice',
      {
        type: 'SubmitShadowChoice',
        choice: 'seat-b',
        slot: 1,
        idempotencyKey: 'shadow-original',
      },
    ],
    [
      'acknowledgement',
      { type: 'AcknowledgePrivate', idempotencyKey: 'ack-original' },
    ],
  ] as const)(
    'reuses the exact %s payload after an uncertain response',
    (operation, originalPayload) => {
      const store = new PendingCommandStore<object>();
      const create = vi.fn(() => originalPayload);
      const firstAttempt = store.getOrCreate(operation, 'game:VOTE:2', create);

      // The first request may have committed even though the response was lost.
      const retryAttempt = store.getOrCreate(operation, 'game:VOTE:2', () => ({
        ...originalPayload,
        idempotencyKey: 'new-key',
        target: 'different-seat',
      }));

      expect(retryAttempt).toBe(firstAttempt);
      expect(retryAttempt.payload).toEqual(originalPayload);
      expect(create).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps attempts until confirmed success or a phase-step change', () => {
    const store = new PendingCommandStore<{ idempotencyKey: string }>();
    const attempt = store.getOrCreate(
      'shadow-choice',
      'game:SHADOW:1:1',
      () => ({
        idempotencyKey: 'same-key',
      }),
    );

    expect(store.get('shadow-choice', 'game:SHADOW:1:1')).toBe(attempt);
    expect(store.get('shadow-choice', 'game:SHADOW:1:2')).toBeNull();

    store.clearForStep('game:SHADOW:1:1');
    expect(store.get('shadow-choice', 'game:SHADOW:1:1')).toBe(attempt);

    store.clearForStep('game:SHADOW:1:2');
    expect(store.get('shadow-choice', 'game:SHADOW:1:1')).toBeNull();
  });

  it('clears only a confirmed operation in the matching phase step', () => {
    const store = new PendingCommandStore<{ idempotencyKey: string }>();
    const first = store.getOrCreate('vote', 'game:VOTE:1', () => ({
      idempotencyKey: 'vote-key',
    }));
    store.getOrCreate('ack', 'game:VOTE:1', () => ({
      idempotencyKey: 'ack-key',
    }));

    store.confirm('vote', 'game:VOTE:2');
    expect(store.get('vote', 'game:VOTE:1')).toBe(first);

    store.confirm('vote', 'game:VOTE:1');
    expect(store.get('vote', 'game:VOTE:1')).toBeNull();
    expect(store.get('ack', 'game:VOTE:1')?.payload.idempotencyKey).toBe(
      'ack-key',
    );
  });
});
