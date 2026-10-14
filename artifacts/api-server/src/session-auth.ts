import { createHash } from 'node:crypto';
import type { Viewer } from '@workspace/engine';

const seatCookiePrefix = 'turnstone-seat-';
const coordinatorCookiePrefix = 'turnstone-coordinator-';
const opaqueTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export type SeatSessionRecord = {
  gameId: string;
  seatId: string;
  expiresAt: number;
  revokedAt: number | null;
};

export type PresenterSessionRecord = {
  gameId: string;
  expiresAt: number;
  revokedAt: number | null;
};

export type CoordinatorSessionRecord = {
  gameId: string;
  expiresAt: number;
  revokedAt: number | null;
};

type SeatViewerResolverOptions = {
  findSession: (
    tokenHash: string,
    gameId: string,
  ) => Promise<SeatSessionRecord | null>;
  findPresenterSession?: (
    tokenHash: string,
    gameId: string,
  ) => Promise<PresenterSessionRecord | null>;
  findCoordinatorSession?: (
    tokenHash: string,
    gameId: string,
  ) => Promise<CoordinatorSessionRecord | null>;
  now?: () => number;
};

export function cookieNameForGame(gameId: string): string {
  return `${seatCookiePrefix}${createHash('sha256')
    .update(gameId)
    .digest('hex')
    .slice(0, 24)}`;
}

export function cookieNameForCoordinatorGame(gameId: string): string {
  return `${coordinatorCookiePrefix}${createHash('sha256')
    .update(gameId)
    .digest('hex')
    .slice(0, 24)}`;
}

export function cookieNameForPresenterGame(gameId: string): string {
  return `turnstone-presenter-${createHash('sha256')
    .update(gameId)
    .digest('hex')
    .slice(0, 24)}`;
}

export function cookieNameForJoinRequest(requestId: string): string {
  return `turnstone-join-${createHash('sha256')
    .update(requestId)
    .digest('hex')
    .slice(0, 24)}`;
}

function cookieValue(
  cookieHeader: string | undefined,
  cookieName: string,
): string | null {
  if (!cookieHeader) return null;
  let found: string | null = null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== cookieName)
      continue;
    if (found !== null) return null;
    found = part.slice(separator + 1).trim();
  }
  return found;
}

export function createSeatViewerResolver(options: SeatViewerResolverOptions) {
  return async (input: {
    gameId: string;
    cookieHeader?: string;
  }): Promise<Viewer> => {
    if (!input.gameId || input.gameId.length > 128) return { kind: 'visitor' };

    const seatToken = cookieValue(
      input.cookieHeader,
      cookieNameForGame(input.gameId),
    );
    const now = options.now?.() ?? Date.now();
    if (seatToken && opaqueTokenPattern.test(seatToken)) {
      const session = await options.findSession(
        createHash('sha256').update(seatToken).digest('hex'),
        input.gameId,
      );
      if (
        session &&
        session.gameId === input.gameId &&
        session.seatId &&
        session.expiresAt > now &&
        session.revokedAt === null
      )
        return { kind: 'player', seatId: session.seatId };
    }

    const coordinatorToken = cookieValue(
      input.cookieHeader,
      cookieNameForCoordinatorGame(input.gameId),
    );
    if (
      coordinatorToken &&
      opaqueTokenPattern.test(coordinatorToken) &&
      options.findCoordinatorSession
    ) {
      const session = await options.findCoordinatorSession(
        createHash('sha256').update(coordinatorToken).digest('hex'),
        input.gameId,
      );
      if (
        session &&
        session.gameId === input.gameId &&
        session.expiresAt > now &&
        session.revokedAt === null
      )
        return { kind: 'coordinator' };
    }

    const presenterToken = cookieValue(
      input.cookieHeader,
      cookieNameForPresenterGame(input.gameId),
    );
    if (presenterToken && opaqueTokenPattern.test(presenterToken)) {
      const session = await options.findPresenterSession?.(
        createHash('sha256').update(presenterToken).digest('hex'),
        input.gameId,
      );
      if (
        session &&
        session.gameId === input.gameId &&
        session.expiresAt > now &&
        session.revokedAt === null
      )
        return { kind: 'presenter' };
    }
    return { kind: 'visitor' };
  };
}

export function createCoordinatorViewerResolver(options: {
  findSession: (
    tokenHash: string,
    gameId: string,
  ) => Promise<CoordinatorSessionRecord | null>;
  now?: () => number;
}) {
  return async (input: {
    gameId: string;
    cookieHeader?: string;
  }): Promise<Viewer> => {
    if (!input.gameId || input.gameId.length > 128) return { kind: 'visitor' };
    const token = cookieValue(
      input.cookieHeader,
      cookieNameForCoordinatorGame(input.gameId),
    );
    if (!token || !opaqueTokenPattern.test(token)) return { kind: 'visitor' };
    const session = await options.findSession(
      createHash('sha256').update(token).digest('hex'),
      input.gameId,
    );
    if (
      !session ||
      session.gameId !== input.gameId ||
      session.expiresAt <= (options.now?.() ?? Date.now()) ||
      session.revokedAt !== null
    )
      return { kind: 'visitor' };
    return { kind: 'coordinator' };
  };
}
