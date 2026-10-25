import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import request from 'supertest';
import { APP_SHELL_ROUTE_BASES } from '../lib/shared/src/app-routes';
import { createApp } from '../artifacts/api-server/src/app';

let directory: string;
const script = 'window.oathstoneTest = true;';
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'oathstone-client-'));
  await mkdir(join(directory, 'assets'));
  await mkdir(join(directory, 'faq'));
  await mkdir(join(directory, 'compare'));
  for (const page of ['about', 'how-to-play', 'coming-soon'])
    await mkdir(join(directory, page));
  for (const [name, text] of Object.entries({
    'index.html': '<main>Public home</main>',
    'app-shell.html': '<main>Oathstone shell</main>',
    'faq/index.html': '<main>Questions</main>',
    'compare/index.html': '<main>Comparison</main>',
    'about/index.html': '<main>About</main>',
    'how-to-play/index.html': '<main>How to play</main>',
    'coming-soon/index.html': '<main>Coming soon</main>',
    'manifest.webmanifest': '{"name":"Oathstone"}',
    'sw.js': 'self.addEventListener("fetch", () => {});',
    'robots.txt': 'User-agent: *\nDisallow: /\n',
    'assets/app-abcdef12.js': script,
  }))
    await writeFile(join(directory, name), text);
  await writeFile(
    join(directory, 'assets/app-abcdef12.js.br'),
    brotliCompressSync(script),
  );
  await writeFile(
    join(directory, 'assets/app-abcdef12.js.gz'),
    gzipSync(script),
  );
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

function app() {
  return createApp(async () => {}, {
    clientDirectory: directory,
    maxActiveGames: 0,
    countActiveGames: vi.fn(async () => 999),
    secureCookies: true,
  });
}

describe('single-origin production client', () => {
  it('uses exactly the shared shell route list, not a home-page catch-all', async () => {
    const server = app();
    for (const route of APP_SHELL_ROUTE_BASES) {
      for (const suffix of ['', '/example']) {
        const response = await request(server).get(route + suffix);
        if (route === '/play' && suffix === '') {
          expect(response.status).toBe(301);
          expect(response.headers.location).toBe('/');
          expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
          continue;
        }
        expect(response.status).toBe(200);
        expect(response.text).toBe('<main>Oathstone shell</main>');
        expect(response.headers['cache-control']).toBe('no-cache');
      }
    }
    for (const [path, text] of [
      ['/', 'Public home'],
      ['/faq', 'Questions'],
      ['/compare/', 'Comparison'],
      ['/about', 'About'],
      ['/how-to-play', 'How to play'],
      ['/coming-soon', 'Coming soon'],
    ]) {
      expect((await request(server).get(path!)).text).toContain(text);
    }
    expect((await request(server).get('/missing')).status).toBe(404);
    expect((await request(server).get('/api/missing')).status).toBe(404);
  });

  it('negotiates precompressed representations and caches only hashed assets immutably', async () => {
    const server = app();
    for (const encoding of ['br', 'gzip', 'identity']) {
      const response = await request(server)
        .get('/assets/app-abcdef12.js')
        .set('Accept-Encoding', encoding);
      expect(response.status).toBe(200);
      expect(response.text).toBe(script);
      expect(response.headers['content-encoding']).toBe(
        encoding === 'identity' ? undefined : encoding,
      );
      expect(response.headers.vary).toContain('Accept-Encoding');
      expect(response.headers['content-type']).toMatch(/javascript/);
      expect(response.headers['cache-control']).toBe(
        'public, max-age=31536000, immutable',
      );
      expect(response.headers.etag).toBeTruthy();
    }
    const refused = await request(server)
      .get('/assets/app-abcdef12.js')
      .set('Accept-Encoding', 'br;q=0, gzip;q=0, identity;q=0');
    expect(refused.status).toBe(406);
    for (const path of ['/', '/manifest.webmanifest', '/sw.js']) {
      const response = await request(server).head(path);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-cache');
    }
  });

  it('keeps every response protected and pre-launch, without cross-origin access', async () => {
    const server = app();
    for (const path of [
      '/',
      '/assets/app-abcdef12.js',
      '/api/healthz',
      '/missing',
    ]) {
      const response = await request(server)
        .get(path)
        .set('Origin', 'https://untrusted.example');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.headers['content-security-policy']).toContain(
        "frame-ancestors 'none'",
      );
      expect(response.headers['strict-transport-security']).toContain(
        'max-age=31536000',
      );
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['permissions-policy']).toContain('camera=()');
      expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    }
    const document = await request(server).get('/');
    expect(document.headers['content-security-policy']).toContain(
      "script-src 'self'",
    );
    expect(document.headers['content-security-policy']).not.toContain(
      "'unsafe-inline'",
    );
    expect((await request(server).get('/robots.txt')).text).toContain(
      'Disallow: /',
    );
    const csrf = await request(server).get('/api/csrf');
    const cookie = csrf.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it('serves pages and health independently of new-game admission and database readiness', async () => {
    const server = app();
    expect((await request(server).get('/')).status).toBe(200);
    expect((await request(server).get('/healthz')).body).toEqual({
      status: 'ok',
    });
    expect((await request(server).get('/readyz')).body).toEqual({
      status: 'ready',
    });
    const unavailable = createApp(
      async () => {
        throw new Error('unavailable');
      },
      { clientDirectory: directory },
    );
    expect((await request(unavailable).get('/readyz')).status).toBe(503);
    expect((await request(unavailable).get('/')).status).toBe(200);
    expect(
      (await request(unavailable).get('/assets/app-abcdef12.js')).status,
    ).toBe(200);
  });
});
