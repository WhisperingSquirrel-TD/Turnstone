import { describe, expect, it } from 'vitest';
import {
  joinRequestCreatedResponseSchema,
  joinRequestDecisionResponseSchema,
  lateGameInviteRequestSchema,
  lateGameInviteResponseSchema,
} from '../lib/shared/src/contracts';

describe('entry-flow API contracts', () => {
  it('keeps fresh late invitations link-only and rejects extra request and response fields', () => {
    const invite = {
      gameId: 'game-1',
      joinUrl: `https://example.test/join/game-1#${'i'.repeat(43)}`,
    };
    expect(lateGameInviteResponseSchema.parse(invite)).toEqual(invite);
    expect(
      lateGameInviteResponseSchema.safeParse({
        ...invite,
        shortCode: 'ABC234',
      }).success,
    ).toBe(false);
    expect(
      lateGameInviteRequestSchema.safeParse({ role: 'traitor' }).success,
    ).toBe(false);
  });
  it('accepts a pending join response without exposing additional fields', () => {
    expect(
      joinRequestCreatedResponseSchema.parse({
        requestId: 'request-1',
        status: 'pending',
      }),
    ).toEqual({ requestId: 'request-1', status: 'pending' });
    expect(
      joinRequestCreatedResponseSchema.safeParse({
        requestId: 'request-1',
        status: 'pending',
        role: 'Traitor',
      }).success,
    ).toBe(false);
  });

  it('accepts only the public result of a coordinator join decision', () => {
    expect(
      joinRequestDecisionResponseSchema.parse({
        status: 'approved',
        seatId: 'seat-1',
      }),
    ).toEqual({ status: 'approved', seatId: 'seat-1' });
    expect(
      joinRequestDecisionResponseSchema.safeParse({
        status: 'approved',
        seatId: 'seat-1',
        role: 'Faithful',
      }).success,
    ).toBe(false);
  });
});
