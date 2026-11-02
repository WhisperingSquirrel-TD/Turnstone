import { createHmac, randomUUID } from 'node:crypto';

/** What leaves the server when a real game is created (D123): no names,
 * PINs, codes, game ids or anything a player typed. */
export type GameCreatedSummary = {
  createdAt: string;
  playerCount: number;
  lastDay: string | null;
  format: 'quick' | 'day' | 'multi-day';
  revealStyle: 'speaker-circle' | 'one-by-one' | 'all' | 'anonymous';
  contendersOnDraw: boolean;
  parityWin: boolean;
};

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function createGameCreatedNotifier(options: {
  url?: string;
  secret?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  newId?: () => string;
  /** Receives only a reason (error class or status), never the address. */
  onFailure?: (failure: { reason: string }) => void;
}): (summary: GameCreatedSummary) => Promise<void> {
  const { url, secret } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const newId = options.newId ?? randomUUID;
  return async (summary) => {
    if (!url) return;
    const body = JSON.stringify({
      type: 'game.created',
      id: newId(),
      ...summary,
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-oathstone-timestamp': timestamp,
    };
    if (secret)
      headers['x-oathstone-signature'] = `sha256=${createHmac('sha256', secret)
        .update(`${timestamp}.${body}`)
        .digest('hex')}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers,
        body,
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok)
        options.onFailure?.({ reason: `status ${response.status}` });
    } catch (error) {
      options.onFailure?.({
        reason:
          error instanceof Error && /^[A-Za-z]{1,40}$/.test(error.name)
            ? error.name
            : 'unknown',
      });
    } finally {
      clearTimeout(timer);
    }
  };
}
