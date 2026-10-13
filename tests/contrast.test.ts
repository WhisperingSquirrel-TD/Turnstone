import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const theme = readFileSync('artifacts/party-game/src/theme.css', 'utf8');
const tokens = Object.fromEntries(
  [...theme.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/gi)].map((match) => [
    match[1],
    match[2],
  ]),
);
it('contains the six exact owner-approved candlelit tokens',()=>{
  expect(Object.fromEntries(['peat','walnut','bark','gilt','candle','ash'].map(key=>[key,tokens[key]]))).toEqual({
    peat:'#16110d',walnut:'#241c16',bark:'#3d3a38',gilt:'#c8944a',candle:'#fafaf5',ash:'#d4cdc4',
  });
});
for(const [foreground,background] of [
  ['candle','peat'],['candle','walnut'],['candle','bark'],
  ['ash','peat'],['ash','walnut'],['ash','bark'],
  ['gilt','peat'],['gilt','walnut'],['peat','gilt'],
]){
  it(`${foreground} on ${background} passes AA for the new dark screens`,()=>{
    const a=luminance(tokens[foreground!]!);const b=luminance(tokens[background!]!);
    expect((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)).toBeGreaterThanOrEqual(4.5);
  });
}
it('rejects normal-size gold on Bark and Candle on gold',()=>{
  for(const [foreground,background] of [['gilt','bark'],['candle','gilt']]){
    const a=luminance(tokens[foreground!]!);const b=luminance(tokens[background!]!);
    expect((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)).toBeLessThan(4.5);
  }
});
function luminance(hex: string) {
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
    const a = luminance(tokens[foreground!]!);
    const b = luminance(tokens[background!]!);
    expect(
      (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
    ).toBeGreaterThanOrEqual(4.5);
  });
}

it('forbids ordinary text on amber because the supplied palette cannot meet 4.5:1', () => {
  const a = luminance(tokens.charcoal!);
  const b = luminance(tokens.amber!);
  expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeLessThan(4.5);
  const app = readFileSync('artifacts/party-game/src/App.tsx', 'utf8');
  expect(app).not.toMatch(/\bbg-amber\b|\btext-amber\b/);
});
