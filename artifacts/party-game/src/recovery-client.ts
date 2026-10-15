import {
  entryFailureMessages,
  gameViewResponseSchema,
  isEntryFailureMessage,
  seatRecoveryRequestSchema,
} from '@workspace/shared';
import { EntryActionError } from './entry-action-error';

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

function recoveryFailureFor(status: number, body: unknown): EntryActionError {
  const serverMessage =
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    isEntryFailureMessage(body.error)
      ? body.error
      : null;
  if (serverMessage) return new EntryActionError(serverMessage);
  if (status === 429) {
    return new EntryActionError(entryFailureMessages.recoveryRateLimited);
  }
  if (status === 409) {
    return new EntryActionError(entryFailureMessages.recoveryConflict);
  }
  if (status === 400 || status === 403) {
    return new EntryActionError(entryFailureMessages.securityCheck);
  }
  if (status === 503) {
    return new EntryActionError(entryFailureMessages.recoveryUnavailable);
  }
  return new EntryActionError(entryFailureMessages.recoveryFailed);
}

export async function recoverSeat(input: RecoverSeatInput) {
  if (!input.csrfToken) {
    throw new EntryActionError(entryFailureMessages.securityCheck);
  }
  let request: ReturnType<typeof seatRecoveryRequestSchema.parse>;
  try {
    request = seatRecoveryRequestSchema.parse({
      ...('shortCode' in input && input.shortCode
        ? { shortCode: input.shortCode }
        : { gameId: input.gameId, inviteToken: input.inviteToken }),
      name: input.name,
      pin: input.pin,
    });
  } catch {
    throw new EntryActionError(entryFailureMessages.recoveryFailed);
  }
  const configuredOrigin = input.apiOrigin ?? '';
  const apiBase = configuredOrigin.endsWith('/')
    ? configuredOrigin.slice(0, -1)
    : configuredOrigin;
  let response: Response;
  try {
    response = await fetch(`${apiBase}/api/recover`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': input.csrfToken,
      },
      body: JSON.stringify(request),
    });
  } catch {
    throw new EntryActionError(entryFailureMessages.recoveryNetwork);
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw recoveryFailureFor(response.status, body);
  }
  try {
    return gameViewResponseSchema.parse(await response.json());
  } catch {
    throw new EntryActionError(entryFailureMessages.recoveryUnavailable);
  }
}
