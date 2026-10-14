import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { config } from '../artifacts/party-game/src/config';

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('Stackstone mark contrast', () => {
  it('gives every distinct mark fill at least 3:1 contrast on every mark background', () => {
    const svg = readFileSync(
      new URL(
        `../artifacts/party-game/public/${config.appIconPath}`,
        import.meta.url,
      ),
      'utf8',
    );
    expect(Buffer.byteLength(svg, 'utf8')).toBeLessThan(5_120);
    const theme = readFileSync(
      new URL('../artifacts/party-game/src/theme.css', import.meta.url),
      'utf8',
    );
    const markSurfaces = ['charcoal', 'hearth'].map((token) => ({
      token,
      hex: theme.match(new RegExp(`--${token}:\\s*(#[\\da-f]{6})`, 'i'))?.[1],
    }));
    for (const surface of markSurfaces) {
      expect(surface.hex, `missing --${surface.token} surface`).toBeDefined();
    }
    const fills = [...svg.matchAll(/#[\da-f]{6}/gi)].map(([fill]) =>
      fill.toLowerCase(),
    );
    expect(fills.length).toBeGreaterThan(0);
    const distinctFills = [...new Set(fills)];

    // The mark sits at the far-right header/footer edge of the global lift;
    // its actual surfaces range from Charcoal to Hearth, not the Stone corner.
    for (const fill of distinctFills) {
      for (const surface of markSurfaces) {
        expect(
          contrastRatio(fill, surface.hex!),
          `${fill} against ${surface.hex} (--${surface.token})`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
