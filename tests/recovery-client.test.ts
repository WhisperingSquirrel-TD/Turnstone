import { afterEach, describe, expect, it, vi } from 'vitest';
import { recoverSeat } from '../artifacts/party-game/src/recovery-client';

afterEach(() => vi.unstubAllGlobals());

describe('seat recovery client', () => {
  it('sends the game code, name and PIN with CSRF and credentials', async () => {
    const result = {
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

  it('returns one generic error for rejected recovery attempts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'Recovery could not be completed' }),
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
    ).rejects.toThrow('Recovery could not be completed');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://live.example/api/recover',
      expect.anything(),
    );
  });
});
