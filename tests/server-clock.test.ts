import { describe, expect, it } from 'vitest';
import {
  serverClockOffset,
  serverTimeNow,
  secondsUntilServerDeadline,
} from '../artifacts/party-game/src/server-clock';

describe('server-synchronised clock', () => {
  it.each([120_000, -120_000])(
    'keeps deadlines accurate when the device clock is skewed by %i ms',
    (deviceClockSkew) => {
      const serverAtResponse = 1_800_000_000_000;
      const deadline = serverAtResponse + 120_000;
      const localAtResponse = serverAtResponse + deviceClockSkew;
      const offset = serverClockOffset(serverAtResponse, localAtResponse);
      const localNow = localAtResponse + 45_000;

      expect(serverTimeNow(localNow, offset)).toBe(serverAtResponse + 45_000);
      expect(secondsUntilServerDeadline(deadline, localNow, offset)).toBe(75);
    },
  );
});
