import { describe, expect, it, vi } from 'vitest';
import {
  gameCommandStepKey,
  isDefinitiveCommandRejection,
  PendingCommandStore,
} from './pending-command';

describe('PendingCommandStore', () => {
  it('distinguishes a definitive HTTP rejection from an uncertain response', () => {
    expect(isDefinitiveCommandRejection({ status: 409 })).toBe(true);
    expect(isDefinitiveCommandRejection({ status: 422 })).toBe(true);
    expect(isDefinitiveCommandRejection({ status: 408 })).toBe(false);
    expect(isDefinitiveCommandRejection({ status: 500 })).toBe(false);
    expect(isDefinitiveCommandRejection(new Error('connection lost'))).toBe(
      false,
    );
  });

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

    expect(store.isWaitingToSend('shadow-choice', 'game:SHADOW:1:1')).toBe(
      true,
    );
    expect(store.get('shadow-choice', 'game:SHADOW:1:1')).toBe(attempt);
    expect(store.get('shadow-choice', 'game:SHADOW:1:2')).toBeNull();

    store.clearForStep('game:SHADOW:1:1');
    expect(store.get('shadow-choice', 'game:SHADOW:1:1')).toBe(attempt);

    store.clearForStep('game:SHADOW:1:2');
    expect(store.get('shadow-choice', 'game:SHADOW:1:1')).toBeNull();
    expect(store.isWaitingToSend('shadow-choice', 'game:SHADOW:1:1')).toBe(
      false,
    );
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

  it('clears only a server-rejected attempt in the matching phase step', () => {
    const store = new PendingCommandStore<{ idempotencyKey: string }>();
    const rejected = store.getOrCreate('vote', 'game:VOTE:1', () => ({
      idempotencyKey: 'vote-key',
    }));
    const acknowledgement = store.getOrCreate('ack', 'game:VOTE:1', () => ({
      idempotencyKey: 'ack-key',
    }));

    store.reject('vote', 'game:VOTE:2');
    expect(store.get('vote', 'game:VOTE:1')).toBe(rejected);

    store.reject('vote', 'game:VOTE:1');
    expect(store.get('vote', 'game:VOTE:1')).toBeNull();
    expect(store.get('ack', 'game:VOTE:1')).toBe(acknowledgement);
  });

  it('reuses the original command after the server committed but its response was lost', async () => {
    const store = new PendingCommandStore<{
      type: string;
      idempotencyKey: string;
      target: string;
    }>();
    const payload = {
      type: 'SubmitVote',
      idempotencyKey: 'vote-once',
      target: 'seat-b',
    };
    const events = new Set<string>();
    let loseFirstResponse = true;
    const send = vi.fn(async (command: typeof payload) => {
      events.add(command.idempotencyKey);
      if (loseFirstResponse) {
        loseFirstResponse = false;
        throw new Error('response dropped after commit');
      }
      return { accepted: true };
    });

    await expect(
      store.send('vote', 'game:VOTE:1', () => payload, send),
    ).rejects.toThrow('response dropped after commit');
    await expect(
      store.send(
        'vote',
        'game:VOTE:1',
        () => ({ ...payload, idempotencyKey: 'new-key', target: 'seat-c' }),
        send,
      ),
    ).resolves.toEqual({ accepted: true });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([command]) => command)).toEqual([
      payload,
      payload,
    ]);
    expect(events.size).toBe(1);
  });

  it('keeps a dropped request waiting and retries the same payload', async () => {
    const store = new PendingCommandStore<{
      type: string;
      idempotencyKey: string;
      choice: string;
    }>();
    const payload = {
      type: 'SubmitShadowChoice',
      idempotencyKey: 'shadow-once',
      choice: 'seat-c',
    };
    const events: string[] = [];
    let dropBeforeServer = true;
    const send = vi.fn(async (command: typeof payload) => {
      if (dropBeforeServer) {
        dropBeforeServer = false;
        throw new Error('request dropped');
      }
      events.push(command.idempotencyKey);
      return { accepted: true };
    });

    await expect(
      store.send('night-choice', 'game:SHADOW:2:1', () => payload, send),
    ).rejects.toThrow('request dropped');
    expect(store.get('night-choice', 'game:SHADOW:2:1')?.payload).toEqual(
      payload,
    );
    await store.send('night-choice', 'game:SHADOW:2:1', () => payload, send);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([command]) => command)).toEqual([
      payload,
      payload,
    ]);
    expect(events).toEqual(['shadow-once']);
  });

  it('sends only once when Resend is tapped twice while a request is in flight', async () => {
    const store = new PendingCommandStore<{ idempotencyKey: string }>();
    let release!: (value: string) => void;
    const send = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );

    const first = store.send(
      'acknowledgement',
      'game:DEAL:1',
      () => ({ idempotencyKey: 'ack-once' }),
      send,
    );
    const duplicate = store.send(
      'acknowledgement',
      'game:DEAL:1',
      () => ({ idempotencyKey: 'different-key' }),
      send,
    );

    expect(store.isSending('acknowledgement', 'game:DEAL:1')).toBe(true);
    expect(send).toHaveBeenCalledTimes(0);
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    release('accepted');
    await expect(Promise.all([first, duplicate])).resolves.toEqual([
      'accepted',
      'accepted',
    ]);
    expect(store.isSending('acknowledgement', 'game:DEAL:1')).toBe(false);
  });
});
