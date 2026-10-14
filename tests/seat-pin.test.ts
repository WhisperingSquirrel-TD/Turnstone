import { describe, expect, it } from 'vitest';
import { hashSeatPin, verifySeatPin } from '../lib/security/src/seat-pin';

describe('seat PIN hashing', () => {
  it('stores a salted scrypt hash and verifies the correct PIN', async () => {
    const hashed = await hashSeatPin('1234', 'a'.repeat(32));

    expect(hashed).toEqual({
      salt: 'a'.repeat(32),
      hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    await expect(verifySeatPin('1234', hashed.salt, hashed.hash)).resolves.toBe(
      true,
    );
    await expect(verifySeatPin('4321', hashed.salt, hashed.hash)).resolves.toBe(
      false,
    );
  });

  it('generates an unpredictable per-seat salt when none is supplied', async () => {
    const [first, second] = await Promise.all([
      hashSeatPin('123456'),
      hashSeatPin('123456'),
    ]);

    expect(first.salt).toMatch(/^[a-f0-9]{32}$/);
    expect(second.salt).toMatch(/^[a-f0-9]{32}$/);
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
  });

  it.each(['123', '1234567', '12a4', ''])(
    'rejects invalid PIN input %j',
    async (pin) => {
      await expect(hashSeatPin(pin)).rejects.toThrow(
        'PIN must contain 4 to 6 digits',
      );
      await expect(
        verifySeatPin(pin, 'a'.repeat(32), 'b'.repeat(64)),
      ).resolves.toBe(false);
    },
  );

  it('rejects malformed stored salts and hashes without throwing', async () => {
    await expect(
      verifySeatPin('1234', 'not-a-salt', 'b'.repeat(64)),
    ).resolves.toBe(false);
    await expect(
      verifySeatPin('1234', 'a'.repeat(32), 'not-a-hash'),
    ).resolves.toBe(false);
  });
});
