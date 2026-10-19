import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const pinPattern = /^\d{4,6}$/;
const saltPattern = /^[a-f0-9]{32}$/;
const hashPattern = /^[a-f0-9]{64}$/;

export type PinPepperKey = {
  version: number;
  secret: string;
};

export type PinPepperConfig = {
  current: PinPepperKey;
  previous?: PinPepperKey;
};

export type HashedSeatPin = {
  salt: string;
  hash: string;
  pepperVersion: number;
};

export type StoredSeatPinHash = {
  salt: string;
  hash: string;
  pinPepperVersion: number;
};

function validatePepperKey(pepper: PinPepperKey): void {
  if (
    !Number.isSafeInteger(pepper.version) ||
    pepper.version < 1 ||
    pepper.secret.length < 32
  ) {
    throw new Error('Invalid PIN pepper configuration');
  }
}

function validatePepperConfig(config: PinPepperConfig): void {
  validatePepperKey(config.current);
  if (config.previous) {
    validatePepperKey(config.previous);
    if (config.previous.version >= config.current.version) {
      throw new Error('Invalid PIN pepper configuration');
    }
  }
}

function pepperPin(pin: string, pepper: PinPepperKey): Buffer {
  validatePepperKey(pepper);
  return createHmac('sha256', pepper.secret)
    .update('oathstone-seat-pin-v1\0')
    .update(pin)
    .digest();
}

function deriveKey(pepperedPin: Buffer, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      pepperedPin,
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
  pepper: PinPepperKey,
  salt = randomBytes(16).toString('hex'),
): Promise<HashedSeatPin> {
  if (!pinPattern.test(pin)) throw new Error('PIN must contain 4 to 6 digits');
  if (!saltPattern.test(salt)) throw new Error('Invalid PIN salt');
  const hash = await deriveKey(pepperPin(pin, pepper), salt);
  return { salt, hash: hash.toString('hex'), pepperVersion: pepper.version };
}

export async function verifySeatPin(
  pin: string,
  salt: string,
  expectedHash: string,
  pepper: PinPepperKey,
): Promise<boolean> {
  validatePepperKey(pepper);
  if (
    !pinPattern.test(pin) ||
    !saltPattern.test(salt) ||
    !hashPattern.test(expectedHash)
  )
    return false;
  const actual = await deriveKey(pepperPin(pin, pepper), salt);
  return timingSafeEqual(actual, Buffer.from(expectedHash, 'hex'));
}

export async function verifySeatPinWithRotation(
  pin: string,
  stored: StoredSeatPinHash,
  config: PinPepperConfig,
): Promise<{ valid: boolean; replacement?: HashedSeatPin }> {
  validatePepperConfig(config);
  const matchingPepper = [config.current, config.previous].find(
    (pepper) => pepper?.version === stored.pinPepperVersion,
  );
  if (!matchingPepper) {
    throw new Error('Stored PIN pepper version is not supported');
  }
  if (!(await verifySeatPin(pin, stored.salt, stored.hash, matchingPepper))) {
    return { valid: false };
  }
  if (stored.pinPepperVersion === config.current.version) {
    return { valid: true };
  }
  return {
    valid: true,
    replacement: await hashSeatPin(pin, config.current),
  };
}
