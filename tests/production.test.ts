import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { APP_SHELL_ROUTE_BASES } from '../lib/shared/src/app-routes';
import { createWebApp } from '../artifacts/party-game/src/web-app';

describe('actual built production website', () => {
  it('serves the prerendered FAQ and comparison documents at clean routes', async () => {
    const app = createWebApp(
      new URL('../artifacts/party-game/dist/public', import.meta.url).pathname,
    );
    const faq = await request(app).get('/faq');
    const compare = await request(app).get('/compare');
    expect(faq.status).toBe(200);
    expect(faq.text).toContain('Frequently asked questions');
    expect(compare.status).toBe(200);
    expect(compare.text).toContain('Compare game formats');
  });

  it('serves public content only at public routes and a styled app shell elsewhere', async () => {
    const app = createWebApp(
      new URL('../artifacts/party-game/dist/public', import.meta.url).pathname,
    );
    const home = await request(app).get('/');
    expect(home.status).toBe(200);
    expect(home.text).toContain('Create a new game');
    expect(home.text).toContain('https://stackstoneconsulting.co.uk/oathstone');

    const appShellPaths = APP_SHELL_ROUTE_BASES.flatMap((route) => [
      route,
      `${route}/deep-link`,
    ]);
    for (const path of appShellPaths) {
      const response = await request(app).get(path);
      if (path === '/play') {
        expect(response.status).toBe(301);
        expect(response.headers.location).toBe('/');
        continue;
      }
      expect(response.status, path).toBe(200);
      expect(response.text).toContain(
        '<header class="public-home-brand public-shell-header',
      );
      expect(response.text).toContain('class="oathstone-wordmark"');
      expect(response.text).toMatch(/<link\b[^>]*rel="stylesheet"/);
      expect(response.text).not.toContain('Create a new game');
      expect(response.text).not.toContain('A game of traitors and faithful.');
      expect(response.text).not.toContain('Frequently asked questions');
      expect(response.text).not.toContain('application/ld+json');
    }

    expect((await request(app).get('/not-a-oathstone-route')).status).toBe(404);
  });

  it('serves external-only scripts with fresh CSP nonces and strict headers on both routes', async () => {
    const app = createWebApp(
      new URL('../artifacts/party-game/dist/public', import.meta.url).pathname,
    );
    for (const path of ['/', '/join']) {
      const first = await request(app).get(path);
      const second = await request(app).get(path);
      expect(first.status).toBe(200);
      expect(first.headers['referrer-policy']).toBe('no-referrer');
      expect(first.headers['content-security-policy']).toContain(
        "frame-ancestors 'none'",
      );
      expect(first.headers['strict-transport-security']).toContain(
        'max-age=31536000',
      );
      expect(first.headers['permissions-policy']).toContain('camera=()');
      expect(first.headers['cache-control']).toBe('no-store');
      const nonce = /'nonce-([^']+)'/.exec(
        first.headers['content-security-policy'],
      )?.[1];
      expect(nonce).toBeTruthy();
      expect(first.text).not.toContain('__RESPONSE_NONCE__');
      const scripts =
        first.text.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) ?? [];
      const structuredData = scripts.find((script) =>
        /type="application\/ld\+json"/i.test(script),
      );
      if (path === '/') {
        expect(structuredData).toBeDefined();
        expect(() =>
          JSON.parse(
            structuredData!
              .replace(/^<script\b[^>]*>/i, '')
              .replace(/<\/script>$/i, ''),
          ),
        ).not.toThrow();
      } else {
        expect(structuredData).toBeUndefined();
      }
      const executableScripts = scripts.filter(
        (script) => !/type="application\/ld\+json"/i.test(script),
      );
      expect(executableScripts.length).toBeGreaterThan(0);
      for (const script of executableScripts) {
        expect(script).toMatch(/\bsrc="/);
        expect(script).toContain(`nonce="${nonce}"`);
        expect(script).toMatch(/><\/script>$/);
      }
      expect(first.headers['content-security-policy']).not.toBe(
        second.headers['content-security-policy'],
      );
    }
  });
});
