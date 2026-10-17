export type GameTheme = 'day' | 'night';

const dayPhases = new Set([
  'DEAL',
  'MISSION',
  'DEBATE',
  'VOTE',
  'VERDICT',
  'DAWN',
  'ENDGAME',
  'FINAL_VOTE',
  'FINAL_BANISH',
  'FINISHED',
  'ARCHIVED',
]);

/** Only the shared public phase and this device's display preference matter. */
export function gameThemeForPhase(
  phase?: string,
  alwaysDark = false,
): GameTheme {
  return !alwaysDark && phase && dayPhases.has(phase) ? 'day' : 'night';
}
