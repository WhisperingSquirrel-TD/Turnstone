import { describe, expect, it } from 'vitest';
import {
  clearPrivateChoiceDraft,
  clearStalePrivateChoiceDrafts,
  createPrivateChoiceDraftKey,
  readPrivateChoiceDraft,
  writePrivateChoiceDraft,
} from './private-choice-draft';

function createStorage() {
  const values = new Map<string, string>();
  return {
    values,
    get length() {
      return values.size;
    },
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
  };
}

describe('private choice draft storage', () => {
  it('keeps a draft scoped to its game, seat and phase window', () => {
    const firstShadowWindow = createPrivateChoiceDraftKey({
      gameId: 'game-a',
      seatId: 'seat-a',
      phase: 'SHADOW',
      cycle: 1,
      slot: 1,
    });

    expect(
      createPrivateChoiceDraftKey({
        gameId: 'game-a',
        seatId: 'seat-a',
        phase: 'SHADOW',
        cycle: 1,
        slot: 1,
      }),
    ).toBe(firstShadowWindow);
    expect(
      createPrivateChoiceDraftKey({
        gameId: 'game-a',
        seatId: 'seat-a',
        phase: 'SHADOW',
        cycle: 1,
        slot: 2,
      }),
    ).not.toBe(firstShadowWindow);
    expect(
      createPrivateChoiceDraftKey({
        gameId: 'game-a',
        seatId: 'seat-b',
        phase: 'SHADOW',
        cycle: 1,
        slot: 1,
      }),
    ).not.toBe(firstShadowWindow);
    expect(
      createPrivateChoiceDraftKey({
        gameId: 'game-b',
        seatId: 'seat-a',
        phase: 'SHADOW',
        cycle: 1,
        slot: 1,
      }),
    ).not.toBe(firstShadowWindow);
  });

  it('stores only the current choice id and clears it when its window ends', () => {
    const storage = createStorage();
    const key = createPrivateChoiceDraftKey({
      gameId: 'game-a',
      seatId: 'seat-a',
      phase: 'VOTE',
      cycle: 2,
      slot: 0,
    });

    writePrivateChoiceDraft(storage, key, 'seat-b');
    expect(storage.values).toEqual(new Map([[key, 'seat-b']]));
    expect(readPrivateChoiceDraft(storage, key)).toBe('seat-b');
    const nextWindow = createPrivateChoiceDraftKey({
      gameId: 'game-a',
      seatId: 'seat-a',
      phase: 'SHADOW',
      cycle: 2,
      slot: 1,
    });
    writePrivateChoiceDraft(storage, nextWindow, 'seat-c');
    clearStalePrivateChoiceDrafts(storage, nextWindow);
    expect(storage.values).toEqual(new Map([[nextWindow, 'seat-c']]));
    clearPrivateChoiceDraft(storage, key);
    expect(storage.values).toEqual(new Map([[nextWindow, 'seat-c']]));
    clearStalePrivateChoiceDrafts(storage, null);
    expect(storage.values).toEqual(new Map());
  });
});
