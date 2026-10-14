import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createWebApp } from '../artifacts/party-game/src/web-app';

describe('actual built production website', () => {
  it('serves external-only scripts with fresh CSP nonces and strict headers on both routes', async () => {
    const app = createWebApp(
      new URL('../artifacts/party-game/dist/public', import.meta.url).pathname,
    );
    for (const path of ['/', '/play']) {
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
      expect(structuredData).toBeDefined();
      expect(() =>
        JSON.parse(
          structuredData!
            .replace(/^<script\b[^>]*>/i, '')
            .replace(/<\/script>$/i, ''),
        ),
      ).not.toThrow();
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
