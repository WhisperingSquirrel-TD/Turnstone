import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createGameCreatedNotifier } from '../artifacts/api-server/src/game-created-notifier';

// D123 (owner, 2 November 2026): a signed webhook when a real game is created.
const summary = {
  createdAt: '2026-11-02T10:00:00.000Z',
  playerCount: 15,
  lastDay: '2026-12-25',
  format: 'day' as const,
  revealStyle: 'speaker-circle' as const,
  contendersOnDraw: true,
  parityWin: true,
};

describe('game-created webhook', () => {
  it('posts a signed summary with no personal data', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const notify = createGameCreatedNotifier({
      url: 'https://hooks.example.test/oathstone',
      secret: 'test-only-webhook-secret-0123456789',
      fetchImpl,
      newId: () => 'event-1',
    });
    await notify(summary);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://hooks.example.test/oathstone');
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    const body = String(init.body);
    expect(JSON.parse(body)).toEqual({
      type: 'game.created',
      id: 'event-1',
      ...summary,
    });
    const headers = new Headers(init.headers);
    expect(headers.get('content-type')).toBe('application/json');
    const timestamp = headers.get('x-oathstone-timestamp')!;
    expect(headers.get('x-oathstone-signature')).toBe(
      `sha256=${createHmac('sha256', 'test-only-webhook-secret-0123456789')
        .update(`${timestamp}.${body}`)
        .digest('hex')}`,
    );
  });

  it('posts a readable Discord message to a Discord webhook', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await createGameCreatedNotifier({
      url: 'https://discord.com/api/webhooks/123/test-only-token',
      fetchImpl,
    })(summary);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(String(init.body))).toEqual({
      content:
        'New Oathstone game: 15 players, last day Friday 25 December 2026, day format, in-room voting circle, Contenders on, parity win on.',
      allowed_mentions: { parse: [] },
    });
  });

  it('does nothing when no webhook is configured', async () => {
    const fetchImpl = vi.fn();
    await createGameCreatedNotifier({ fetchImpl })(summary);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never throws, and reports failures without the address or body', async () => {
    const failures: unknown[] = [];
    const notify = createGameCreatedNotifier({
      url: 'https://hooks.example.test/secret-path-token',
      fetchImpl: async () => {
        throw new Error('network down at secret-path-token');
      },
      onFailure: (failure) => failures.push(failure),
    });
    await expect(notify(summary)).resolves.toBeUndefined();
    const rejected = createGameCreatedNotifier({
      url: 'https://hooks.example.test/secret-path-token',
      fetchImpl: async () => new Response('nope', { status: 500 }),
      onFailure: (failure) => failures.push(failure),
    });
    await rejected(summary);
    expect(failures).toEqual([{ reason: 'Error' }, { reason: 'status 500' }]);
    expect(JSON.stringify(failures)).not.toContain('secret-path-token');
  });

  it('gives up after a short timeout', async () => {
    vi.useFakeTimers();
    try {
      const failures: unknown[] = [];
      const notify = createGameCreatedNotifier({
        url: 'https://hooks.example.test/slow',
        timeoutMs: 5_000,
        fetchImpl: (_url, init) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () =>
              reject(
                Object.assign(new Error('aborted'), { name: 'AbortError' }),
              ),
            ),
          ),
        onFailure: (failure) => failures.push(failure),
      });
      const pending = notify(summary);
      await vi.advanceTimersByTimeAsync(5_000);
      await pending;
      expect(failures).toEqual([{ reason: 'AbortError' }]);
    } finally {
      vi.useRealTimers();
    }
  });
});
