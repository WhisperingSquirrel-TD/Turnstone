import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const wordmarkPairs = [
  ['stackstone-logo-full.svg', 'stackstone-logo-full-outlined.svg'],
  ['stackstone-logo-dark.svg', 'stackstone-logo-dark-outlined.svg'],
  ['stackstone-logo-horizontal.svg', 'stackstone-logo-horizontal-outlined.svg'],
  ['stackstone-logo-stacked.svg', 'stackstone-logo-stacked-outlined.svg'],
] as const;

describe('font-independent Stackstone wordmarks', () => {
  it('keeps source artwork intact and provides compact, outlined product variants', () => {
    for (const [sourceName, outlinedName] of wordmarkPairs) {
      const source = readFileSync(
        `assets/brand/stackstone/${sourceName}`,
        'utf8',
      );
      const outlinedPath = `assets/brand/stackstone/${outlinedName}`;
      const outlined = readFileSync(outlinedPath, 'utf8');

      expect(source).toMatch(/<text\b/);
      expect(outlined).toMatch(/<path\b[^>]*\bd=/);
      expect(outlined).not.toMatch(
        /<text\b|font-family|font-size|font-weight/i,
      );
      expect(Buffer.byteLength(outlined)).toBeLessThan(5_000);
    }
  });
});
