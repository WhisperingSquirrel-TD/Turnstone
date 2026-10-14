import { describe, expect, it } from 'vitest';
import { en } from '../artifacts/party-game/src/locale/en-GB';

describe('security setup failure copy', () => {
  it('tells the player what to do when the secure connection is unavailable', () => {
    expect(en.app.securityUnavailable).toContain('Check your connection');
    expect(en.app.tryAgain).toBe('Try again');
  });
});
