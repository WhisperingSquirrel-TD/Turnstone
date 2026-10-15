import type { State } from './model';

/** One rule for the engine and invitation entry points; capacity is checked separately. */
export function joiningWindowOpen(state: State): boolean {
  if (state.phase === 'LOBBY') return true;
  if (['DRAFT', 'FINISHED', 'ARCHIVED'].includes(state.phase)) return false;
  return (
    state.config.players.lateJoining !== 'never' &&
    (state.config.players.lateJoining !== 'first-vote' ||
      !state.firstVoteOccurred) &&
    (state.config.players.lateJoining !== 'cycle' ||
      state.cycle <= state.config.players.lateJoinCycle)
  );
}
