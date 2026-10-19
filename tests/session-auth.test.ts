import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  cookieNameForGame,
  createSeatViewerResolver,
} from '../artifacts/api-server/src/session-auth';

describe('game-scoped seat session authentication', () => {
  const token = 'A'.repeat(43);
  const activeSession = {
    gameId: 'game-1',
    seatId: 'seat-1',
    expiresAt: 2_000,
    revokedAt: null,
  };

  it('resolves a live seat from an opaque game-scoped cookie', async () => {
    const findSession = vi.fn(async () => activeSession);
    const resolveViewer = createSeatViewerResolver({
      findSession,
      now: () => 1_000,
    });

    await expect(
      resolveViewer({
        gameId: 'game-1',
        cookieHeader: `${cookieNameForGame('game-1')}=${token}`,
      }),
    ).resolves.toEqual({ kind: 'player', seatId: 'seat-1' });
    expect(findSession).toHaveBeenCalledWith(
      createHash('sha256').update(token).digest('hex'),
      'game-1',
    );
  });

  it.each([
    ['expired', { ...activeSession, expiresAt: 1_000 }],
    ['revoked', { ...activeSession, revokedAt: 1_000 }],
    ['wrong game', { ...activeSession, gameId: 'game-2' }],
  ])('treats a %s session as a visitor', async (_label, session) => {
    const resolveViewer = createSeatViewerResolver({
      findSession: async () => session,
      now: () => 1_000,
    });

    await expect(
      resolveViewer({
        gameId: 'game-1',
        cookieHeader: `${cookieNameForGame('game-1')}=${token}`,
      }),
    ).resolves.toEqual({ kind: 'visitor' });
  });

  it('does not query storage for missing, malformed, or another-game cookies', async () => {
    const findSession = vi.fn(async () => activeSession);
    const resolveViewer = createSeatViewerResolver({ findSession });

    await expect(
      resolveViewer({ gameId: 'game-1', cookieHeader: undefined }),
    ).resolves.toEqual({ kind: 'visitor' });
    await expect(
      resolveViewer({
        gameId: 'game-1',
        cookieHeader: `${cookieNameForGame('game-1')}=not-a-session`,
      }),
    ).resolves.toEqual({ kind: 'visitor' });
    await expect(
      resolveViewer({
        gameId: 'game-1',
        cookieHeader: `${cookieNameForGame('game-2')}=${token}`,
      }),
    ).resolves.toEqual({ kind: 'visitor' });
    expect(findSession).not.toHaveBeenCalled();
  });

  it('uses deterministic cookie names that do not reveal the game identifier', () => {
    const cookieName = cookieNameForGame('sensitive-game-id');
    expect(cookieName).toMatch(/^oathstone-seat-[a-f0-9]{24}$/);
    expect(cookieName).toBe(cookieNameForGame('sensitive-game-id'));
    expect(cookieName).not.toContain('sensitive-game-id');
  });
});
