import { expect, it } from 'vitest';
import { rehearsalStartRequestSchema } from '../lib/shared/src';

const validRequest = {
  gameId: 'practice-game',
  idempotencyKey: 'practice-request',
  name: 'Morgan',
  playerCount: 6,
  speed: 'fast',
};

it('accepts a PIN-free rehearsal request with the selected player count and speed', () => {
  expect(rehearsalStartRequestSchema.parse(validRequest)).toEqual(validRequest);
});

it('rejects out-of-range player counts and any rehearsal PIN field', () => {
  expect(
    rehearsalStartRequestSchema.safeParse({
      ...validRequest,
      playerCount: 5,
    }).success,
  ).toBe(false);
  expect(
    rehearsalStartRequestSchema.safeParse({
      ...validRequest,
      pin: '1234',
    }).success,
  ).toBe(false);
});
