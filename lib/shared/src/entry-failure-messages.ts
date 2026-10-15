export const entryFailureMessages = {
  securityCheck:
    'The security check could not be completed. Reload the page and try again.',
  serviceUnavailable:
    'The game service is temporarily unavailable. Try again shortly.',
  gameCodeUnavailable:
    'That game code or invite is not active. Check it or ask your organiser for a fresh one.',
  gameNotAcceptingPlayers:
    'This game is no longer accepting new players. Ask your organiser for a fresh invitation.',
  nameCheckFailed:
    'We could not check that name. Check your connection and try again.',
  joinNetwork:
    'We could not send your join request. Check your connection and try again.',
  joinRateLimited: 'Too many join attempts. Wait a minute, then try again.',
  joinPinMismatch:
    'The PIN did not match your earlier join attempt. Check the PIN and try again, or return to the name step for PIN recovery.',
  joinNameTaken:
    'That name is already in this game. Choose another name, or use PIN recovery if this is your seat.',
  joinNotAccepted:
    'We could not add that seat. Check that the name is available and try again, or use PIN recovery if this is your existing seat.',
  joinRequestNotSaved:
    'We could not save your join request. Check your connection and try again; if it continues, ask your organiser to confirm your seat.',
  joinDetailsInvalid:
    'Check the game code, your name and your four-digit PIN, then try again.',
  recoveryFailed:
    'We could not recover that seat. Check the game code or invitation, name and PIN, then try again. If you no longer know the PIN, ask your organiser to reset it.',
  recoveryRateLimited:
    'Too many recovery attempts. Wait before trying again. If your PIN is locked, ask your organiser to reset it.',
  recoveryConflict:
    'The seat changed while recovery was in progress. Start again, or ask your organiser for help.',
  recoveryUnavailable:
    'Recovery is temporarily unavailable. Try again shortly, or ask your organiser for help.',
  recoveryNetwork:
    'We could not reach the game to recover your seat. Check your connection and try again.',
} as const;

const entryFailureMessageValues = new Set(Object.values(entryFailureMessages));

export function isEntryFailureMessage(
  value: unknown,
): value is (typeof entryFailureMessages)[keyof typeof entryFailureMessages] {
  return (
    typeof value === 'string' &&
    entryFailureMessageValues.has(
      value as (typeof entryFailureMessages)[keyof typeof entryFailureMessages],
    )
  );
}
