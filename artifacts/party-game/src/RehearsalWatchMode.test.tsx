import { describe, expect, it } from 'vitest';
import { rehearsalWatchMessage } from './RehearsalWatchMode';

const expectedMessages = {
  DEBATE: 'The remaining players are talking it over now.',
  VOTE: 'The remaining players are voting now.',
  VERDICT: 'The remaining players are seeing the result now.',
  SHADOW: 'The remaining players are making their private night choices now.',
  DAWN: 'The remaining players are seeing who was taken in the night.',
  ENDGAME: 'The remaining players are deciding whether to end the game now.',
  FINAL_VOTE: 'The remaining players are deciding whether to end the game now.',
  FINAL_BANISH: 'The remaining players are voting now.',
  FINISHED: "The game is complete. Everyone's roles are revealed.",
};

describe('rehearsal watch mode copy', () => {
  it.each(Object.entries(expectedMessages))(
    'explains what other players are doing during %s',
    (phase, message) => {
      expect(rehearsalWatchMessage(phase)).toBe(message);
    },
  );

  it('uses one role-neutral message for a phase', () => {
    expect(rehearsalWatchMessage('VOTE')).toBe(
      'The remaining players are voting now.',
    );
  });
});
