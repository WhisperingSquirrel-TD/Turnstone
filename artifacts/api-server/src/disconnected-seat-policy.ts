export function canOrganiserActOnDisconnectedSeat(input: {
  targetSeatId: string;
  organiserSeatId?: string;
  seatIsAlive: boolean;
  seatIsDisconnected: boolean;
}): boolean {
  return (
    input.seatIsAlive &&
    input.seatIsDisconnected &&
    input.targetSeatId !== input.organiserSeatId
  );
}
