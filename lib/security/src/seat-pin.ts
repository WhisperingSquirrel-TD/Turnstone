import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const pinPattern = /^\d{4,6}$/;
const saltPattern = /^[a-f0-9]{32}$/;
const hashPattern = /^[a-f0-9]{64}$/;

function deriveKey(pin: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      pin,
      Buffer.from(salt, 'hex'),
      32,
      { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

export async function hashSeatPin(
  pin: string,
  salt = randomBytes(16).toString('hex'),
): Promise<{ salt: string; hash: string }> {
  if (!pinPattern.test(pin)) throw new Error('PIN must contain 4 to 6 digits');
  if (!saltPattern.test(salt)) throw new Error('Invalid PIN salt');
  const hash = await deriveKey(pin, salt);
  return { salt, hash: hash.toString('hex') };
}

export async function verifySeatPin(
  pin: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  if (
    !pinPattern.test(pin) ||
    !saltPattern.test(salt) ||
    !hashPattern.test(expectedHash)
  )
    return false;
  const actual = await deriveKey(pin, salt);
  return timingSafeEqual(actual, Buffer.from(expectedHash, 'hex'));
}
