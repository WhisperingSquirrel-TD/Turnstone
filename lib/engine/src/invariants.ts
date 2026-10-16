import { recommended } from '../../shared/src/index';
import type { State } from './model';

export function assertInvariants(state: State): void {
  if (state.pot < 0 || !Number.isFinite(state.pot))
    throw new Error('Negative or invalid pot');
  if (new Set(state.seats.map((seat) => seat.id)).size !== state.seats.length)
    throw new Error('Duplicate seat');
  if (state.seats.length > 40) throw new Error('Too many seats');
  if (state.deal) {
    const dealt = Object.keys(state.deal.roles);
    if (
      state.seats.some(
        (seat) =>
          (dealt.includes(seat.id) || seat.status === 'alive') &&
          seat.role === null,
      )
    )
      throw new Error('Missing seat role');
    const expected =
      state.config.traitors.number === 'auto'
        ? recommended(dealt.length).traitors
        : state.config.traitors.number;
    if (
      Object.values(state.deal.roles).filter((role) => role === 'traitor')
        .length !== expected
    )
      throw new Error('Wrong deal count');
  }
  for (const [voter, target] of Object.entries(state.votes)) {
    if (voter === target) throw new Error('Self-vote');
    const seat = state.seats.find((candidate) => candidate.id === voter);
    const revealedBanishedVote =
      state.phase === 'VERDICT' &&
      state.publicAnnouncement?.kind === 'verdict' &&
      state.publicAnnouncement.cycle === state.cycle &&
      seat?.status === 'banished' &&
      state.revealed.includes(voter);
    if (!seat || (seat.status !== 'alive' && !revealedBanishedVote))
      throw new Error('Inactive voter');
  }
  for (const [chooser, target] of Object.entries(state.shadow)) {
    const seat = state.seats.find((seat) => seat.id === chooser);
    if (!seat || seat.status !== 'alive')
      throw new Error('Inactive shadow participant');
    if (
      seat.role === 'traitor' &&
      state.seats.find((seat) => seat.id === target)?.role === 'traitor'
    )
      throw new Error('Friendly-fire choice');
  }
  if (
    state.protected.some(
      (id) => state.seats.find((seat) => seat.id === id)?.status === 'murdered',
    )
  )
    throw new Error('Protected murder');
}
