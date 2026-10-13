import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { canPromote } from '../scripts/src/promotion-policy.mjs';
import { browserPlan } from '../scripts/src/browser-plan.mjs';
import { config } from '../artifacts/party-game/src/config';
import { createWebApp } from '../artifacts/party-game/src/web-app';

describe('owner-approved delivery policy', () => {
  it('runs every browser in CI and prints an explicit local WebKit notice', () => {
    expect(browserPlan(true)).toEqual({ notice: null, projects: [] });
    expect(browserPlan(false)).toEqual({
      notice: 'WebKit profiles run in CI',
      projects: ['Pixel', 'desktop'],
    });
  });
  it('runs local and CI smoke tests against the dedicated Vite server', () => {
    const playwrightConfig = readFileSync('playwright.config.ts', 'utf8');
    expect(playwrightConfig).toContain(
      "baseURL: process.env.TEST_BASE_URL ?? 'http://127.0.0.1:22814'",
    );
    expect(playwrightConfig).toContain(
      "webServer: {\n    command: 'pnpm --filter @workspace/party-game run dev'",
    );
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
  it('verifies the pinned Gitleaks release checksum before scanning all history', () => {
    const workflow = readFileSync('.github/workflows/verify.yml', 'utf8');
    const staticJob = workflow.split('\n  unit:\n')[0] ?? '';
    expect(staticJob).not.toContain('gitleaks/gitleaks-action');
    expect(staticJob).toContain('fetch-depth: 0');
    expect(staticJob).toContain('GITLEAKS_VERSION: 8.30.1');
    expect(staticJob).toContain(
      'GITLEAKS_LINUX_X64_SHA256: 551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
    );
    expect(staticJob).toContain('gitleaks_${GITLEAKS_VERSION}_checksums.txt');
    expect(staticJob).toContain('sha256sum --check --strict');
    expect(staticJob).toContain('gitleaks git --redact --log-opts="--all" .');
    expect(staticJob.indexOf('sha256sum --check --strict')).toBeLessThan(
      staticJob.indexOf('gitleaks git --redact --log-opts="--all" .'),
    );
  });
  it('runs the sample scenario gate in verify and a real full suite in verify:full', () => {
    const packageManifest = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(packageManifest.scripts.verify).toContain('pnpm run test:scenarios');
    expect(packageManifest.scripts['verify:full']).toContain('scenarios:full');
    expect(packageManifest.scripts['verify:full']).not.toContain(
      'verify-full.mjs',
    );
  });
  it('keeps Vercel pre-launch and static security headers aligned with config', () => {
    const settings = JSON.parse(readFileSync('vercel.json', 'utf8'));
    const globalHeaders = settings.headers.find(
      (rule: { source: string }) => rule.source === '/(.*)',
    );
    const values = Object.fromEntries(
      globalHeaders.headers.map((header: { key: string; value: string }) => [
        header.key,
        header.value,
      ]),
    );

    expect(config.preLaunch).toBe(true);
    expect(values['X-Robots-Tag']).toBe('noindex, nofollow');
    expect(values['Strict-Transport-Security']).toContain('max-age=31536000');
    expect(values['Content-Security-Policy']).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://live.turnstone.stackstoneconsulting.co.uk wss://live.turnstone.stackstoneconsulting.co.uk; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
    );
    expect(values['Referrer-Policy']).toBe('no-referrer');
    expect(values['X-Content-Type-Options']).toBe('nosniff');
    expect(values['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(values['Permissions-Policy']).toBe(
      'camera=(), microphone=(), geolocation=(), screen-wake-lock=(self), publickey-credentials-get=(self), publickey-credentials-create=(self)',
    );
    expect(settings.headers).toContainEqual({
      source: '/assets/(.*)',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ],
    });
    expect(settings.headers).toContainEqual({
      source: '/(.*)',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=0, must-revalidate',
        },
      ],
    });
    const assetCacheRule = settings.headers.findIndex(
      (rule: { source: string }) => rule.source === '/assets/(.*)',
    );
    const htmlCacheRule = settings.headers.findIndex(
      (rule: { source: string; headers: { key: string }[] }) =>
        rule.source === '/(.*)' &&
        rule.headers.some((header) => header.key === 'Cache-Control'),
    );
    expect(htmlCacheRule).toBeLessThan(assetCacheRule);
    expect(readFileSync('artifacts/party-game/public/robots.txt', 'utf8')).toBe(
      'User-agent: *\nDisallow: /\n',
    );
  });
  it('serves the built production HTML and preview routes with pre-launch headers', async () => {
    const publicDirectory = new URL(
      '../artifacts/party-game/dist/public',
      import.meta.url,
    ).pathname;
    const server = createWebApp(publicDirectory).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Production test server did not start');

    try {
      for (const path of ['/', '/play', '/robots.txt']) {
        const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
        expect(response.status).toBe(200);
        expect(response.headers.get('x-robots-tag')).toBe(
          config.preLaunch ? 'noindex, nofollow' : null,
        );
        expect(response.headers.get('content-security-policy')).toContain(
          "script-src 'nonce-",
        );
        if (path !== '/robots.txt') {
          const html = await response.text();
          expect(html).not.toMatch(/<script\b(?![^>]*\bsrc=)[^>]*>/i);
          expect(html).not.toMatch(/<style\b/i);
          expect(html).not.toMatch(/\sstyle=/i);
        }
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  it('runs each required CI suite independently on pinned Node 24-compatible actions', () => {
    const workflow = readFileSync('.github/workflows/verify.yml', 'utf8');
    const requiredJobs = [
      'static-checks',
      'unit',
      'property',
      'integration',
      'scenarios',
      'merge-scenario-reports',
      'browsers',
      'lighthouse',
      'audit',
      'required-checks',
    ];
    for (const job of requiredJobs) expect(workflow).toContain(`  ${job}:`);
    const unitJob =
      workflow.split('\n  unit:\n')[1]?.split('\n  property:')[0] ?? '';
    expect(unitJob.indexOf('pnpm run test:build')).toBeGreaterThanOrEqual(0);
    expect(unitJob.indexOf('pnpm run test:build')).toBeLessThan(
      unitJob.indexOf('pnpm run test:unit'),
    );
    expect(workflow).toContain('runs-on: ubuntu-24.04');
    expect(workflow).toContain('profile: iPhone');
    expect(workflow).toContain('profile: iPad');
    expect(workflow).toContain(
      'actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9',
    );
    expect(workflow).toContain(
      'pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413',
    );
    expect(workflow).not.toContain('f40ffcd9367d9f12939873eb1018b921a783ffaa');
    expect(workflow).not.toContain('0057852bfaa89a56745cba8c7296529d2fc39830');
    expect(workflow.match(/^\s+timeout-minutes:/gm)).toHaveLength(
      requiredJobs.length,
    );
    const promotion = readFileSync('.github/workflows/promote.yml', 'utf8');
    expect(promotion).toContain("vars.TURNSTONE_PROMOTION_ENABLED == 'true'");
    expect(promotion).toContain('ubuntu-24.04');
  });
});
