import { expect, it } from 'vitest';
import { gameConfigSchema } from '../lib/shared/src';

it('keeps the optional presenter off unless a game explicitly enables it', () => {
  expect(gameConfigSchema.parse({}).presenter.enabled).toBe(false);
  expect(
    gameConfigSchema.parse({ presenter: { enabled: true } }).presenter.enabled,
  ).toBe(true);
});

it('accepts an optional public game name without hard-coding the product name', () => {
  expect(gameConfigSchema.parse({}).basics.gameName).toBeUndefined();
  expect(
    gameConfigSchema.parse({
      basics: { gameName: 'Family game' },
    }).basics.gameName,
  ).toBe('Family game');
});
