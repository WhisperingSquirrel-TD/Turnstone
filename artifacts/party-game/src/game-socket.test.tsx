import { describe, expect, it, vi } from 'vitest';
import { attachGameView } from './game-socket';

type Listener = (...args: unknown[]) => void;

function fakeSocket(connected = false) {
  const listeners = new Map<string, Set<Listener>>();
  return {
    connected,
    emit: vi.fn(),
    on(event: string, listener: Listener) {
      const current = listeners.get(event) ?? new Set<Listener>();
      current.add(listener);
      listeners.set(event, current);
      return this;
    },
    off(event: string, listener: Listener) {
      listeners.get(event)?.delete(listener);
      return this;
    },
    fire(event: string, ...args: unknown[]) {
      listeners.get(event)?.forEach((listener) => listener(...args));
    },
    listenerCount() {
      return [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
    },
  };
}

describe('player game socket', () => {
  it('watches the authenticated game after connect and accepts only allow-listed public views', () => {
    const socket = fakeSocket();
    const onView = vi.fn();
    const stop = attachGameView(socket, 'game-123', onView);

    socket.fire('connect');
    expect(socket.emit).toHaveBeenCalledWith('game:watch', {
      gameId: 'game-123',
    });

    const publicResponse = {
      serverNow: Date.now(),
      version: 4,
      view: {
        exists: true as const,
        phase: 'DEAL' as const,
        lobbyOpen: false,
        seatCount: 5,
      },
    };
    socket.fire('game:view', publicResponse);
    expect(onView).toHaveBeenCalledExactlyOnceWith(publicResponse);

    socket.fire('game:view', {
      version: 5,
      view: {
        exists: true,
        phase: 'LOBBY',
        lobbyOpen: true,
        seatCount: 2,
        seats: [{ id: 'secret-seat', name: 'Private name' }],
      },
    });
    expect(onView).toHaveBeenCalledTimes(1);

    stop();
    expect(socket.listenerCount()).toBe(0);
  });

  it('watches immediately if the socket is already connected', () => {
    const socket = fakeSocket(true);
    const stop = attachGameView(socket, 'game-456', vi.fn());

    expect(socket.emit).toHaveBeenCalledExactlyOnceWith('game:watch', {
      gameId: 'game-456',
    });
    stop();
  });
});
