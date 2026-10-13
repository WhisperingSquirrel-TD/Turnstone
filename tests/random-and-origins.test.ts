import { describe, expect, it, vi } from 'vitest';
import { gameRandom } from '../lib/security/src/game-random';
import { config } from '../artifacts/party-game/src/config';
import { readFileSync } from 'node:fs';

describe('secure production entropy and owner domains', () => {
  it('uses operating-system cryptographic randomness, never Math.random', () => {
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Insecure randomness');
    });
    try {
      for (let i = 0; i < 100; i++) {
        const value = gameRandom.int(7);
        expect(Number.isInteger(value) && value >= 0 && value < 7).toBe(true);
      }
      expect(gameRandom.bytes(32)).toHaveLength(32);
    } finally {
      spy.mockRestore();
    }
  });
  it('keeps owner-confirmed canonical domain/RP ID and planned API origin in config', () => {
    const spec = readFileSync('docs/SPEC.md', 'utf8');
    const site = /Domain: public site and app shell at (\S+) on Vercel/.exec(
      spec,
    )?.[1];
    const live = /planned as (\S+) on an always-on/.exec(spec)?.[1];
    expect(site).toBeTruthy();
    expect(live).toBeTruthy();
    expect(config.siteOrigin).toBe(site);
    expect(config.plannedApiOrigin).toBe(live);
    expect(config.productionRpId).toBe(new URL(site!).hostname);
  });
});
