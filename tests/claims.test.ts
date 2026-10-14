import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('public comparative claims', () => {
  it('records the owner-supplied evidence and a pre-launch recheck', () => {
    const claims = readFileSync(
      new URL('../docs/CLAIMS.md', import.meta.url),
      'utf8',
    );
    expect(claims).toContain('Pocket Gamer');
    expect(claims).toContain('CityDays');
    expect(claims).toContain('12 October 2026');
    expect(claims).toContain('Recheck before launch');
    expect(claims).toContain('Remove any claim that is no longer true');
  });
});
