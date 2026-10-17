import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const theme = readFileSync('artifacts/party-game/src/theme.css', 'utf8');
const rootTheme = theme.match(/:root\s*\{([^}]+)\}/)?.[1];
if (!rootTheme) throw new Error('Missing root brand palette');
const tokens = Object.fromEntries(
  [...rootTheme.matchAll(/--([\w-]+):\s*(#[\da-f]{6}|var\(--[\w-]+\))/gi)].map(
    (match) => [match[1], match[2]],
  ),
);
function color(name: string, seen = new Set<string>()): string {
  if (seen.has(name)) throw new Error(`Circular theme token: ${name}`);
  seen.add(name);
  const value = tokens[name];
  if (!value) throw new Error(`Missing theme token: ${name}`);
  if (value.startsWith('#')) return value;
  const reference = value.match(/^var\(--([\w-]+)\)$/)?.[1];
  if (!reference) throw new Error(`Unsupported theme colour token: ${name}`);
  return color(reference, seen);
}
it('contains the six exact owner-approved Stackstone talk-style tokens', () => {
  expect(
    Object.fromEntries(
      ['charcoal', 'hearth', 'stone', 'gilt', 'candle', 'ash'].map((key) => [
        key,
        color(key).toLowerCase(),
      ]),
    ),
  ).toEqual({
    charcoal: '#3d3a38',
    hearth: '#2e2b29',
    stone: '#55504b',
    gilt: '#c8944a',
    candle: '#fafaf5',
    ash: '#d4cdc4',
  });
});
for (const foreground of ['candle', 'ash']) {
  for (const background of ['charcoal', 'hearth', 'stone']) {
    it(`${foreground} on ${background} passes WCAG AA for ordinary text`, () => {
      const a = luminance(foreground);
      const b = luminance(background);
      expect(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
}
it('allows Gilt on Charcoal only at the large-text threshold, not normal text', () => {
  const a = luminance('gilt');
  const b = luminance('charcoal');
  const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  expect(contrast).toBeGreaterThanOrEqual(3);
  expect(contrast).toBeLessThan(4.5);
});
it('defines Playfair Display and DM Sans as the screen-milestone font tokens', () => {
  expect(theme).toMatch(/--font-headline:\s*['"]?Playfair Display/);
  expect(theme).toMatch(/--font-body:\s*['"]?DM Sans/);
});
it('rejects Gilt text on Stone and Candle text on Gilt', () => {
  const giltOnStone = (luminance('gilt') + 0.05) / (luminance('stone') + 0.05);
  expect(giltOnStone).toBeLessThan(3);
  const candleOnGilt =
    (luminance('candle') + 0.05) / (luminance('gilt') + 0.05);
  expect(candleOnGilt).toBeLessThan(4.5);
});
function luminance(name: string) {
  const hex = name.startsWith('#') ? name : color(name);
  if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error(`Invalid colour: ${name}`);
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
// Every supported text/surface pairing, including button hover and dark footer.
for (const [foreground, background] of [
  ['slate', 'light-bg'],
  ['slate', 'white'],
  ['charcoal', 'light-bg'],
  ['charcoal', 'white'],
  ['charcoal', 'amber-light'],
  ['light-bg', 'charcoal'],
  ['border', 'charcoal'],
]) {
  it(`${foreground} on ${background} meets WCAG AA for ordinary text`, () => {
    const a = luminance(foreground!);
    const b = luminance(background!);
    expect(
      (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
    ).toBeGreaterThanOrEqual(4.5);
  });
}

it('forbids ordinary text on amber because the supplied palette cannot meet 4.5:1', () => {
  const a = luminance('charcoal');
  const b = luminance('amber');
  expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeLessThan(4.5);
  const app = readFileSync('artifacts/party-game/src/App.tsx', 'utf8');
  expect(app).not.toMatch(/\bbg-amber\b|\btext-amber\b/);
});
