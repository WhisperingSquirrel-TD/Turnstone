import { describe, expect, it } from 'vitest';
import {
  joinNameCheckRequestSchema,
  joinNameCheckResponseSchema,
  joinRequestCreatedResponseSchema,
  joinRequestDecisionResponseSchema,
  lateGameInviteRequestSchema,
  lateGameInviteResponseSchema,
  seatRecoveryRequestSchema,
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

  it('accepts only code- or invite-authorised name checks and minimal results', () => {
    expect(
      joinNameCheckRequestSchema.parse({
        shortCode: 'ABC234',
        name: 'Alex',
      }),
    ).toEqual({ shortCode: 'ABC234', name: 'Alex' });
    expect(
      joinNameCheckRequestSchema.parse({
        gameId: 'game-1',
        inviteToken: 'i'.repeat(43),
        name: 'Alex',
      }),
    ).toEqual({
      gameId: 'game-1',
      inviteToken: 'i'.repeat(43),
      name: 'Alex',
    });
    expect(
      joinNameCheckRequestSchema.safeParse({
        gameId: 'game-1',
        name: 'Alex',
      }).success,
    ).toBe(false);
    for (const status of ['available', 'duplicate', 'reserved']) {
      expect(joinNameCheckResponseSchema.parse({ status })).toEqual({ status });
    }
    expect(
      joinNameCheckResponseSchema.safeParse({
        status: 'duplicate',
        name: 'Another player',
      }).success,
    ).toBe(false);
  });

  it('supports PIN recovery through either the shared code or the current invite', () => {
    expect(
      seatRecoveryRequestSchema.parse({
        shortCode: 'ABC234',
        name: 'Alex',
        pin: '1234',
      }),
    ).toEqual({ shortCode: 'ABC234', name: 'Alex', pin: '1234' });
    expect(
      seatRecoveryRequestSchema.parse({
        gameId: 'game-1',
        inviteToken: 'i'.repeat(43),
        name: 'Alex',
        pin: '1234',
      }),
    ).toEqual({
      gameId: 'game-1',
      inviteToken: 'i'.repeat(43),
      name: 'Alex',
      pin: '1234',
    });
  });
});
