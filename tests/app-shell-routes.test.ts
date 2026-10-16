import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  APP_SHELL_ROUTE_BASES,
  appShellVercelRewrites,
  isAppShellRoute,
} from '../lib/shared/src/app-routes';

describe('shared app-shell route configuration', () => {
  it('recognises each route and its nested URLs without matching lookalikes', () => {
    for (const route of APP_SHELL_ROUTE_BASES) {
      expect(isAppShellRoute(route), route).toBe(true);
      expect(isAppShellRoute(`${route}/deep-link`), route).toBe(true);
      expect(isAppShellRoute(`${route}-not-a-route`), route).toBe(false);
    }

    expect(isAppShellRoute('/')).toBe(false);
    expect(isAppShellRoute('/faq')).toBe(false);
    expect(isAppShellRoute('/compare')).toBe(false);
  });

  it('keeps Vercel shell rewrites in sync with the shared route list', () => {
    const vercel = JSON.parse(
      readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
    ) as { rewrites: { source: string; destination: string }[] };
    const shellRewrites = vercel.rewrites.filter(
      ({ destination }) => destination === '/app-shell.html',
    );

    expect(shellRewrites).toEqual(appShellVercelRewrites);
  });
});
