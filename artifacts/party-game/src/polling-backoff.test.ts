import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdaptivePoller } from './polling-backoff';

async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

describe('adaptive polling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('backs off after failures and resets the delay after success', async () => {
    vi.useFakeTimers();
    const task = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('temporary failure'));
    const poller = createAdaptivePoller(task, {
      baseIntervalMs: 1_000,
      maxIntervalMs: 4_000,
      random: () => 0.5,
    });

    poller.start();
    await flush();
    expect(task).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(task).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(999);
    expect(task).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(4);
    poller.stop();
  });

  it('honours Retry-After and adds jitter so clients do not retry together', async () => {
    vi.useFakeTimers();
    const task = vi.fn<() => Promise<void>>().mockRejectedValueOnce({
      status: 429,
      headers: new Headers({ 'Retry-After': '5' }),
    });
    const poller = createAdaptivePoller(task, {
      baseIntervalMs: 1_000,
      maxIntervalMs: 10_000,
      random: () => 0.5,
    });

    poller.start();
    await flush();
    await vi.advanceTimersByTimeAsync(5_249);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it('coalesces refresh requests received while a poll is in flight', async () => {
    vi.useFakeTimers();
    let resolveFirst!: () => void;
    const task = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const poller = createAdaptivePoller(task, {
      baseIntervalMs: 1_000,
      maxIntervalMs: 4_000,
      random: () => 0.5,
    });

    poller.start();
    await flush();
    expect(task).toHaveBeenCalledTimes(1);
    poller.refresh();
    poller.refresh();
    expect(task).toHaveBeenCalledTimes(1);

    resolveFirst();
    await flush();
    expect(task).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it('stops future polling and clears a scheduled retry', async () => {
    vi.useFakeTimers();
    const task = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error('offline'));
    const poller = createAdaptivePoller(task, {
      baseIntervalMs: 1_000,
      maxIntervalMs: 4_000,
      random: () => 0.5,
    });

    poller.start();
    await flush();
    poller.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
