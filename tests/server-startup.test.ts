import { it, expect, vi } from 'vitest';
import { createServer } from 'node:http';
import { startHttpService } from '../artifacts/api-server/src/server-startup';

it('does not start a background worker when the port is occupied', async () => {
  const occupied = createServer();
  const server = createServer();
  await new Promise<void>((resolve) =>
    occupied.listen(0, '127.0.0.1', resolve),
  );
  const address = occupied.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing test port');
  const worker = vi.fn();
  const cleanup = vi.fn<(error: unknown) => Promise<void>>(async () => {});
  try {
    expect(await startHttpService(server, address.port, worker, cleanup)).toBe(
      false,
    );
    expect(worker).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(cleanup.mock.calls[0]?.[0]).toHaveProperty('code', 'EADDRINUSE');
  } finally {
    await new Promise<void>((resolve) => occupied.close(() => resolve()));
  }
});

it('starts the worker only after HTTP is listening', async () => {
  const server = createServer((_, response) => response.end('ready'));
  const worker = vi.fn(() => expect(server.listening).toBe(true));
  const cleanup = vi.fn(async () => {});
  try {
    expect(await startHttpService(server, 0, worker, cleanup)).toBe(true);
    expect(worker).toHaveBeenCalledOnce();
    expect(cleanup).not.toHaveBeenCalled();
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing test port');
    expect(await (await fetch(`http://127.0.0.1:${address.port}`)).text()).toBe(
      'ready',
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
