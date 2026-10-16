import { afterEach, describe, expect, it, vi } from 'vitest';
import { entryFailureMessages } from '../lib/shared/src/entry-failure-messages';
import { recoverSeat } from '../artifacts/party-game/src/recovery-client';

afterEach(() => vi.unstubAllGlobals());

describe('seat recovery client', () => {
  it('gives a next step when its security token is unavailable', async () => {
    await expect(
      recoverSeat({
        apiOrigin: 'https://live.example',
        csrfToken: null,
        shortCode: 'ABCD23',
        name: 'Alex',
        pin: '1234',
      }),
    ).rejects.toThrow(
      'The security check could not be completed. Reload the page and try again.',
    );
  });

  it('gives a next step when the recovery request cannot reach the server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(
      recoverSeat({
        apiOrigin: 'https://live.example',
        csrfToken: 'csrf-test',
        shortCode: 'ABCD23',
        name: 'Alex',
        pin: '1234',
      }),
    ).rejects.toThrow(
      'We could not reach the game to recover your seat. Check your connection and try again.',
    );
  });

  it('sends the game code, name and PIN with CSRF and credentials', async () => {
    const result = {
      serverNow: Date.now(),
      version: 3,
      view: {
        exists: true as const,
        phase: 'LOBBY' as const,
        lobbyOpen: false,
        seatCount: 3,
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      recoverSeat({
        apiOrigin: '/api-server',
        csrfToken: 'csrf-test',
        shortCode: 'ABCD23',
        name: 'Alex',
        pin: '1234',
      }),
    ).resolves.toEqual(result);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api-server/api/recover',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-test' }),
        body: JSON.stringify({
          shortCode: 'ABCD23',
          name: 'Alex',
          pin: '1234',
        }),
      }),
    );
  });

  it('supports recovery from a game-scoped invitation', async () => {
    const result = {
      serverNow: Date.now(),
      version: 4,
      view: {
        exists: true as const,
        phase: 'LOBBY' as const,
        lobbyOpen: true,
        seatCount: 2,
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const inviteToken = 'i'.repeat(43);

    await expect(
      recoverSeat({
        apiOrigin: '/api-server',
        csrfToken: 'csrf-test',
        gameId: 'game-1',
        inviteToken,
        name: 'Alex',
        pin: '1234',
      }),
    ).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api-server/api/recover',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          gameId: 'game-1',
          inviteToken,
          name: 'Alex',
          pin: '1234',
        }),
      }),
    );
  });

  it('returns an actionable message for rejected recovery attempts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: entryFailureMessages.recoveryFailed }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      recoverSeat({
        apiOrigin: 'https://live.example/',
        csrfToken: 'csrf-test',
        shortCode: 'ABCD23',
        name: 'Alex',
        pin: '1234',
      }),
    ).rejects.toThrow(entryFailureMessages.recoveryFailed);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://live.example/api/recover',
      expect.anything(),
    );
  });
});
