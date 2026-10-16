import { describe, expect, it } from 'vitest';
import { en } from '../artifacts/party-game/src/locale/en-GB';
import { voteCompletionMessage } from '../artifacts/party-game/src/vote-progress';

const base = {
  phase: 'VOTE',
  progress: { done: 6, total: 6 },
  rehearsal: false,
  canAdvancePhase: false,
} as const;

describe('vote completion guidance', () => {
  it('shows no completion message until every eligible player has voted', () => {
    expect(
      voteCompletionMessage({
        ...base,
        progress: { done: 5, total: 6 },
      }),
    ).toBeNull();
  });

  it('tells rehearsal players to tap Next step', () => {
    expect(
      voteCompletionMessage({
        ...base,
        rehearsal: true,
        canAdvancePhase: true,
      }),
    ).toBe(en.game.everyoneVotedRehearsal);
  });

  it('tells the organiser to move everyone on', () => {
    expect(voteCompletionMessage({ ...base, canAdvancePhase: true })).toBe(
      en.game.everyoneVotedOrganiser,
    );
  });

  it('tells other players that the result is coming', () => {
    expect(voteCompletionMessage(base)).toBe(en.game.everyoneVotedPlayer);
  });

  it('does not use vote-completion copy on a night step', () => {
    expect(voteCompletionMessage({ ...base, phase: 'SHADOW' })).toBeNull();
  });
});
