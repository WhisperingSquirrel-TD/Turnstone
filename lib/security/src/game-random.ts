import { randomInt, randomBytes } from 'node:crypto';

// Production adapter lives outside the pure engine. Tests inject seeded sources.
// There is deliberately no Math.random fallback.
export const gameRandom = {
  int: (upperExclusive: number): number => randomInt(upperExclusive),
  bytes: (length: number): Uint8Array => randomBytes(length),
} as const;
