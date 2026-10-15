import {
  gameViewResponseSchema,
  seatRecoveryRequestSchema,
} from '@workspace/shared';

interface RecoveryRequestContext {
  apiOrigin: string | null;
  csrfToken: string | null;
  name: string;
  pin: string;
}

export type RecoverSeatInput = RecoveryRequestContext &
  (
    | {
        shortCode: string;
        gameId?: never;
        inviteToken?: never;
      }
    | {
        shortCode?: never;
        gameId: string;
        inviteToken: string;
      }
  );

export async function recoverSeat(input: RecoverSeatInput) {
  if (!input.csrfToken) {
    throw new Error('Recovery could not be completed');
  }
  const request = seatRecoveryRequestSchema.parse({
    ...('shortCode' in input && input.shortCode
      ? { shortCode: input.shortCode }
      : { gameId: input.gameId, inviteToken: input.inviteToken }),
    name: input.name,
    pin: input.pin,
  });
  const configuredOrigin = input.apiOrigin ?? '';
  const apiBase = configuredOrigin.endsWith('/')
    ? configuredOrigin.slice(0, -1)
    : configuredOrigin;
  const response = await fetch(`${apiBase}/api/recover`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': input.csrfToken,
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
        ? body.error
        : 'Recovery could not be completed';
    throw new Error(message);
  }
  return gameViewResponseSchema.parse(await response.json());
}
