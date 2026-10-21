export interface TestOnlyRandom {
  int(maxExclusive: number): number;
  bytes(length: number): Uint8Array;
}

export function createTestOnlyRandom(seed: string): TestOnlyRandom {
  let state = 2166136261;
  for (const character of seed) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  if (state === 0) state = 0x6d2b79f5;

  const nextUint32 = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  };

  return {
    int(maxExclusive) {
      if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) return 0;
      return Math.floor((nextUint32() / 4_294_967_296) * maxExclusive);
    },
    bytes(length) {
      if (!Number.isInteger(length) || length < 0)
        throw new Error(
          'Test random byte length must be a non-negative integer.',
        );
      return Uint8Array.from({ length }, () => nextUint32() & 0xff);
    },
  };
}
