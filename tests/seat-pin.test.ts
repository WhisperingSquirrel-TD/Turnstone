import { describe, expect, it, vi } from 'vitest';
import {
  hashSeatPin,
  verifySeatPin,
  verifySeatPinWithRotation,
} from '../lib/security/src/seat-pin';

const currentPepper = {
  version: 1,
  secret: 'test-only-current-pin-pepper-0123456789',
};
const nextPepper = {
  version: 2,
  secret: 'test-only-next-pin-pepper-0123456789ab',
};

describe('seat PIN hashing', () => {
  it('stores a salted scrypt hash and verifies the correct PIN', async () => {
    const hashed = await hashSeatPin('1234', currentPepper, 'a'.repeat(32));

    expect(hashed).toEqual({
      salt: 'a'.repeat(32),
      hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      pepperVersion: currentPepper.version,
    });
    await expect(
      verifySeatPin('1234', hashed.salt, hashed.hash, currentPepper),
    ).resolves.toBe(true);
    await expect(
      verifySeatPin('4321', hashed.salt, hashed.hash, currentPepper),
    ).resolves.toBe(false);
  });

  it('generates an unpredictable per-seat salt when none is supplied', async () => {
    const [first, second] = await Promise.all([
      hashSeatPin('123456', currentPepper),
      hashSeatPin('123456', currentPepper),
    ]);

    expect(first.salt).toMatch(/^[a-f0-9]{32}$/);
    expect(second.salt).toMatch(/^[a-f0-9]{32}$/);
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
  });

  it('rejects a PIN hash made with the wrong pepper', async () => {
    const hashed = await hashSeatPin('1234', currentPepper);
    const wrongPepper = {
      version: currentPepper.version,
      secret: 'wrong-test-pepper-0123456789abcdef',
    };

    await expect(
      verifySeatPin('1234', hashed.salt, hashed.hash, wrongPepper),
    ).resolves.toBe(false);
  });

  it('rehashes with the current pepper after a valid PIN using the previous pepper', async () => {
    const previousPepper = {
      version: currentPepper.version,
      secret: 'previous-test-pepper-0123456789abcdef',
    };
    const oldHash = await hashSeatPin('1234', previousPepper);
    const result = await verifySeatPinWithRotation(
      '1234',
      { ...oldHash, pinPepperVersion: previousPepper.version },
      { current: nextPepper, previous: previousPepper },
    );

    expect(result.valid).toBe(true);
    expect(result.replacement?.pepperVersion).toBe(nextPepper.version);
    await expect(
      verifySeatPin(
        '1234',
        result.replacement!.salt,
        result.replacement!.hash,
        nextPepper,
      ),
    ).resolves.toBe(true);
  });

  it('does not log the pepper while hashing or verifying', async () => {
    const secret = 'test-only-log-marker-pin-pepper-0123456789';
    const logMethods = ['debug', 'info', 'log', 'warn', 'error'] as const;
    const spies = logMethods.map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );

    try {
      const pepper = { version: 1, secret };
      const hashed = await hashSeatPin('1234', pepper);
      await verifySeatPin('1234', hashed.salt, hashed.hash, pepper);

      expect(
        spies.flatMap((spy) => spy.mock.calls.flat()).join(' '),
      ).not.toContain(secret);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it.each(['123', '1234567', '12a4', ''])(
    'rejects invalid PIN input %j',
    async (pin) => {
      await expect(hashSeatPin(pin, currentPepper)).rejects.toThrow(
        'PIN must contain 4 to 6 digits',
      );
      await expect(
        verifySeatPin(pin, 'a'.repeat(32), 'b'.repeat(64), currentPepper),
      ).resolves.toBe(false);
    },
  );

  it('rejects malformed stored salts and hashes without throwing', async () => {
    await expect(
      verifySeatPin('1234', 'not-a-salt', 'b'.repeat(64), currentPepper),
    ).resolves.toBe(false);
    await expect(
      verifySeatPin('1234', 'a'.repeat(32), 'not-a-hash', currentPepper),
    ).resolves.toBe(false);
  });
});
