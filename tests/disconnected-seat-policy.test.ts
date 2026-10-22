import { describe, expect, it } from 'vitest';
import { canOrganiserActOnDisconnectedSeat } from '../artifacts/api-server/src/disconnected-seat-policy';

describe('disconnected seat actions', () => {
  it('permits only a living disconnected seat other than the organiser', () => {
    expect(
      canOrganiserActOnDisconnectedSeat({
        targetSeatId: 'seat-2',
        organiserSeatId: 'seat-1',
        seatIsAlive: true,
        seatIsDisconnected: true,
      }),
    ).toBe(true);
    expect(
      canOrganiserActOnDisconnectedSeat({
        targetSeatId: 'seat-2',
        organiserSeatId: 'seat-1',
        seatIsAlive: true,
        seatIsDisconnected: false,
      }),
    ).toBe(false);
    expect(
      canOrganiserActOnDisconnectedSeat({
        targetSeatId: 'seat-1',
        organiserSeatId: 'seat-1',
        seatIsAlive: true,
        seatIsDisconnected: true,
      }),
    ).toBe(false);
    expect(
      canOrganiserActOnDisconnectedSeat({
        targetSeatId: 'seat-2',
        organiserSeatId: 'seat-1',
        seatIsAlive: false,
        seatIsDisconnected: true,
      }),
    ).toBe(false);
  });
});
