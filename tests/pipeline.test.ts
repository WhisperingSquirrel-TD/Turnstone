import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { canPromote } from '../scripts/src/promotion-policy.mjs';
import { browserPlan } from '../scripts/src/browser-plan.mjs';

describe('owner-approved delivery policy', () => {
  it('runs every browser in CI and prints an explicit local WebKit notice', () => {
    expect(browserPlan(true)).toEqual({ notice: null, projects: [] });
    expect(browserPlan(false)).toEqual({
      notice: 'WebKit profiles run in CI',
      projects: ['Pixel', 'desktop'],
    });
  });
  it('blocks inclusive freeze dates except exact security-tagged commits', () => {
    const dates = [{ start: '2026-12-24', end: '2026-12-26' }];
    expect(canPromote(dates, 'regular commit', '2026-12-24')).toBe(false);
    expect(canPromote(dates, 'regular commit', '2026-12-26')).toBe(false);
    expect(canPromote(dates, 'fix [security] issue', '2026-12-25')).toBe(true);
    expect(canPromote(dates, 'security', '2026-12-25')).toBe(false);
    expect(canPromote(dates, 'regular commit', '2026-12-27')).toBe(true);
  });
  it('fails closed on malformed dates and reversed ranges, even security commits', () => {
    expect(() =>
      canPromote(
        [{ start: '2026-02-30', end: '2026-03-02' }],
        '[security]',
        '2026-03-01',
      ),
    ).toThrow();
    expect(() =>
      canPromote(
        [{ start: '2026-12-26', end: '2026-12-24' }],
        '[security]',
        '2026-12-25',
      ),
    ).toThrow();
    expect(() => canPromote([], 'normal', 'not-a-date')).toThrow();
  });
  it('builds only static files in Vercel', () => {
    const settings = JSON.parse(readFileSync('vercel.json', 'utf8'));
    expect(settings.outputDirectory).toBe('artifacts/party-game/dist/public');
    expect(settings.buildCommand).toContain('--filter @workspace/party-game');
    expect(settings.buildCommand).not.toMatch(/api-server|run start|run dev/);
  });
});
