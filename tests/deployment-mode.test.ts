import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createWebApp } from '../artifacts/party-game/src/web-app';
import {
  renderRobotsTxt,
  resolveDeploymentMode,
  shouldNoindexPath,
} from '../lib/security/src/deployment';

const comingSoonMode = resolveDeploymentMode({
  COMING_SOON_MODE: 'true',
});

describe('coming-soon crawl boundaries', () => {
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'oathstone-coming-soon-'));
    await mkdir(join(directory, 'faq'));
    await mkdir(join(directory, 'compare'));
    await writeFile(join(directory, 'index.html'), '<main>Public home</main>');
    await writeFile(join(directory, 'faq', 'index.html'), '<main>FAQ</main>');
    await writeFile(
      join(directory, 'compare', 'index.html'),
      '<main>Compare</main>',
    );
    await writeFile(
      join(directory, 'app-shell.html'),
      '<main>App shell</main>',
    );
    await writeFile(
      join(directory, 'robots.txt'),
      renderRobotsTxt(comingSoonMode),
    );
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('defaults to noindex and rejects crawlable startup outside coming-soon mode', () => {
    expect(resolveDeploymentMode({})).toEqual({
      preLaunchNoindex: true,
      comingSoonMode: false,
    });
    expect(() =>
      resolveDeploymentMode({ PRE_LAUNCH_NOINDEX: 'false' }),
    ).toThrow('COMING_SOON_MODE');
  });

  it('marks only public marketing routes crawlable in coming-soon mode', () => {
    for (const route of ['/', '/faq', '/compare']) {
      expect(shouldNoindexPath(route, comingSoonMode)).toBe(false);
    }
    for (const route of [
      '/play',
      '/join',
      '/create',
      '/game/example',
      '/api/healthz',
    ]) {
      expect(shouldNoindexPath(route, comingSoonMode)).toBe(true);
    }
  });

  it('serves public and app routes with different robot headers and directives', async () => {
    const app = createWebApp(directory, { deploymentMode: comingSoonMode });
    for (const path of ['/', '/faq', '/compare']) {
      const page = await request(app).get(path);
      expect(page.status).toBe(200);
      expect(page.headers['x-robots-tag']).toBeUndefined();
    }
    for (const path of ['/play', '/join', '/game/example']) {
      const page = await request(app).get(path);
      expect(page.status).toBe(200);
      expect(page.headers['x-robots-tag']).toBe('noindex, nofollow');
    }

    const robots = await request(app).get('/robots.txt');
    expect(robots.status).toBe(200);
    expect(robots.text).toContain('Allow: /');
    for (const route of [
      '/play',
      '/join',
      '/create',
      '/game',
      '/api/',
      '/socket.io/',
    ]) {
      expect(robots.text).toContain(`Disallow: ${route}`);
    }
  });
});
