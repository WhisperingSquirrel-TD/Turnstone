import type { State } from './model';

const minimumAdvancePhases = new Set<State['phase']>([
  'DEAL',
  'SHADOW',
  'VOTE',
  'FINAL_VOTE',
  'FINAL_BANISH',
]);

export function getMinimumAdvanceAt(
  state: Pick<State, 'phase' | 'phaseStarted' | 'config'>,
): number | null {
  if (!minimumAdvancePhases.has(state.phase)) return null;
  return (
    state.phaseStarted +
    state.config.privacy.shieldSeconds * 1000 +
    state.config.privacy.holdMs
  );
}

export function getCoordinatorMinimumAdvanceAt(
  state: Pick<State, 'phase' | 'phaseStarted' | 'config' | 'deadline'>,
): number | null {
  const privateMinimum = getMinimumAdvanceAt(state);
  if (state.phase !== 'SHADOW' || state.deadline === null)
    return privateMinimum;
  return Math.max(privateMinimum ?? state.deadline, state.deadline);
}
