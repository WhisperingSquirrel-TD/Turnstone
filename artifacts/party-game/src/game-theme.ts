export type GameTheme = 'day' | 'night';
export type DisplayPreference = 'system' | 'light' | 'dark';
export const displayPreferenceKey = 'oathstone:display-theme';

export function readDisplayPreference(
  storage: Pick<Storage, 'getItem'>,
): DisplayPreference {
  try {
    const value = storage.getItem(displayPreferenceKey);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

/** Only the shared public phase and this device's display preference matter. */
export function gameThemeForPhase(
  phase?: string,
  preference: DisplayPreference = 'system',
  phoneDark = false,
): GameTheme {
  if (phase === 'SHADOW' || phase === 'NIGHT') return 'night';
  if (preference === 'light') return 'day';
  if (preference === 'dark' || phoneDark) return 'night';
  return 'day';
}
