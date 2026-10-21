import { describe, expect, it } from 'vitest';
import { getAdvanceControlState, isAdvanceConflict } from './advance-control';

describe('advance control state', () => {
  const serverNow = 1_800_000_000_000;

  it('uses the server clock when the device clock is two minutes fast or slow', () => {
    for (const deviceOffset of [-120_000, 120_000]) {
      const state = getAdvanceControlState({
        minimumAdvanceAt: serverNow + 4_000,
        localNow: serverNow + deviceOffset,
        serverClockOffsetMs: -deviceOffset,
      });

      expect(state).toMatchObject({
        disabled: true,
        waitSeconds: 4,
      });
    }
  });

  it('enables the action once server time reaches the minimum', () => {
    expect(
      getAdvanceControlState({
        minimumAdvanceAt: serverNow + 4_000,
        localNow: serverNow + 4_000,
        serverClockOffsetMs: 0,
      }),
    ).toEqual({
      disabled: false,
      waitSeconds: 0,
    });
  });

  it('keeps busy and paused controls disabled after the minimum', () => {
    const base = {
      minimumAdvanceAt: serverNow,
      localNow: serverNow,
      serverClockOffsetMs: 0,
    };

    expect(getAdvanceControlState({ ...base, busy: true }).disabled).toBe(true);
    expect(getAdvanceControlState({ ...base, paused: true }).disabled).toBe(
      true,
    );
  });

  it('recognises command conflicts for the specific wait message', () => {
    expect(isAdvanceConflict({ status: 409 })).toBe(true);
    expect(isAdvanceConflict({ response: { status: 409 } })).toBe(true);
    expect(isAdvanceConflict({ status: 500 })).toBe(false);
    expect(isAdvanceConflict(new Error('offline'))).toBe(false);
  });
});
