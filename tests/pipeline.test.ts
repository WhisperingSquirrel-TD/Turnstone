import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
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
      'const webPort = Number(process.env.TEST_WEB_PORT ?? 3100)',
    );
    expect(playwrightConfig).toContain(
      "command: 'pnpm exec tsx e2e/support/csrf-test-server.ts'",
    );
    expect(playwrightConfig).toContain(
      "command: 'pnpm --filter @workspace/party-game run dev'",
    );
    expect(playwrightConfig).toContain(
      'TEST_API_PROXY_TARGET: `http://127.0.0.1:${csrfTestPort}`',
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
  it('loads development styles from the document head and routes app pages to the static app shell', () => {
    const entryHtml = readFileSync('artifacts/party-game/index.html', 'utf8');
    const head = entryHtml.slice(0, entryHtml.indexOf('</head>'));
    expect(head).toContain(
      '<link rel="stylesheet" href="%BASE_URL%src/index.css"',
    );
    expect(head).toContain(
      '<link rel="stylesheet" href="%BASE_URL%src/public-home.css"',
    );

    const rewrites = JSON.parse(readFileSync('vercel.json', 'utf8'))
      .rewrites as Array<{ source: string; destination: string }>;
    for (const source of [
      '/play/:path*',
      '/create/:path*',
      '/join/:path*',
      '/join-request/:path*',
      '/coordinate/:path*',
      '/game/:path*',
      '/tv/:path*',
      '/account/:path*',
      '/admin/:path*',
      '/recap/:path*',
    ]) {
      expect(rewrites).toContainEqual({
        source,
        destination: '/app-shell.html',
      });
    }
  });
  it('keeps the public home page initial JavaScript under 15 KB', () => {
    const publicDirectory = new URL(
      '../artifacts/party-game/dist/public/',
      import.meta.url,
    );
    const html = readFileSync(new URL('index.html', publicDirectory), 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(
      ([, source]) => source,
    );
    const initialScriptBytes = scripts.reduce(
      (total, source) =>
        total +
        statSync(new URL(source!.replace(/^\/+/, ''), publicDirectory)).size,
      0,
    );
    expect(initialScriptBytes).toBeLessThan(15 * 1024);
  });
  it('keeps public home HTML, CSS, fonts and JavaScript under 200 KB before images', () => {
    const publicDirectory = new URL(
      '../artifacts/party-game/dist/public/',
      import.meta.url,
    );
    const html = readFileSync(new URL('index.html', publicDirectory), 'utf8');
    const assetSources = [...html.matchAll(/<(?:script|link)\b([^>]*)>/g)]
      .filter(([, attributes]) => {
        const isScript = /\bsrc="/.test(attributes!);
        const isStylesheet = /\brel="stylesheet"/.test(attributes!);
        const isFont = /\bas="font"/.test(attributes!);
        return isScript || isStylesheet || isFont;
      })
      .map(
        ([, attributes]) => /\b(?:src|href)="([^"]+)"/.exec(attributes!)?.[1],
      )
      .filter((source): source is string => Boolean(source));
    const pageBytes =
      Buffer.byteLength(html, 'utf8') +
      assetSources.reduce(
        (total, source) =>
          total +
          statSync(new URL(source.replace(/^\/+/, ''), publicDirectory)).size,
        0,
      );
    expect(pageBytes).toBeLessThan(200 * 1024);
  });
  it('declares the API React client used by the production app', () => {
    const manifest = JSON.parse(
      readFileSync('artifacts/party-game/package.json', 'utf8'),
    );
    expect(
      manifest.dependencies?.['@workspace/api-client-react'] ??
        manifest.devDependencies?.['@workspace/api-client-react'],
    ).toBe('workspace:*');
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
  it('runs database integration once inside the server coverage gate', () => {
    const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
    expect(scripts['test:server-coverage']).toContain(
      'tests/database.integration.test.ts',
    );
    expect(scripts['test:server-coverage']).toContain(
      'tests/late-invites.integration.test.ts',
    );
    expect(scripts['test:server-coverage']).toContain('--no-file-parallelism');
    expect(scripts['test:integration']).toContain('--no-file-parallelism');
    expect(scripts.verify).toContain('pnpm run test:server-coverage');
    expect(scripts.verify).not.toContain('pnpm run test:integration');
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
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://live.oathstone.stackstoneconsulting.co.uk wss://live.oathstone.stackstoneconsulting.co.uk; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
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
      const legacy = await fetch(
        `http://127.0.0.1:${address.port}/play?entry=rehearsal#ignored`,
        { redirect: 'manual' },
      );
      expect(legacy.status).toBe(301);
      expect(legacy.headers.get('location')).toBe('/?entry=rehearsal');
      for (const path of ['/', '/join', '/game/rehearsal-id', '/robots.txt']) {
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
          expect(html).not.toMatch(
            /<script\b(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>/i,
          );
          if (path === '/') {
            expect(html).toContain('type="application/ld+json"');
          } else {
            expect(html).not.toContain('type="application/ld+json"');
          }
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
      'rehearsal-live',
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

  it('uses the lockfile-matched official Playwright container for browser jobs', () => {
    const workflow = readFileSync('.github/workflows/verify.yml', 'utf8');
    const lockfile = readFileSync('pnpm-lock.yaml', 'utf8');
    const version = lockfile.match(
      /^\s{2}'@playwright\/test@(\d+\.\d+\.\d+)':/m,
    )?.[1];
    expect(version).toBeDefined();

    for (const name of ['browsers', 'rehearsal-live', 'lighthouse']) {
      const job =
        workflow
          .split(`\n  ${name}:\n`)[1]
          ?.split(/\n\s{2}[a-z][a-z0-9-]*:\n/)[0] ?? '';
      expect(job).not.toBe('');
      expect(job).toMatch(
        new RegExp(
          `^\\s+image:\\s+mcr\\.microsoft\\.com/playwright:v${version}-noble@sha256:[a-f0-9]{64}$`,
          'm',
        ),
      );
      expect(job).toMatch(/^\s+options:\s*--ipc=host\s*$/m);
      expect(job).not.toMatch(/playwright\s+install\s+--with-deps/);
      expect(job).not.toContain('actions/cache@');
    }
  });

  it('runs the real-server rehearsal separately from the mock-API browser matrix', () => {
    const workflow = readFileSync('.github/workflows/verify.yml', 'utf8');
    const browserJob =
      workflow.split('\n  browsers:\n')[1]?.split('\n  rehearsal-live:\n')[0] ??
      '';
    expect(browserJob).toContain('--grep-invert @rehearsal-live');

    const rehearsalJob =
      workflow
        .split('\n  rehearsal-live:\n')[1]
        ?.split('\n  lighthouse:\n')[0] ?? '';
    expect(rehearsalJob).toContain('playwright.rehearsal.config.ts');
    expect(rehearsalJob).toContain('DATABASE_URL');
    expect(rehearsalJob).toContain('SESSION_SECRET');

    const requiredChecks = workflow.split('\n  required-checks:\n')[1] ?? '';
    expect(requiredChecks).toContain('      - rehearsal-live');
  });

  it('lists mock browser tests without requiring a database URL', () => {
    const env: Record<string, string | undefined> = {
      ...process.env,
      CI: 'true',
    };
    delete env.DATABASE_URL;
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        '--config=playwright.config.ts',
        '--project=Pixel',
        '--grep-invert',
        '@rehearsal-live',
        '--list',
        'e2e/create-presenter-option.spec.ts',
        'e2e/presenter-pairing.spec.ts',
      ],
      { encoding: 'utf8', env, timeout: 15_000 },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(output).toContain('Listing tests:');
    expect(output).toContain('create-presenter-option.spec.ts');
    expect(output).toContain('presenter-pairing.spec.ts');
    expect(output).not.toContain('DATABASE_URL must be set');
    expect(output).not.toContain('rehearsal-live.spec.ts');
  });

  it('runs virtual-player H1 and H2 only with the real-server rehearsal config', () => {
    const env: Record<string, string | undefined> = {
      ...process.env,
      CI: 'true',
      DATABASE_URL: 'postgresql://127.0.0.1:5432/oathstone_test',
      SESSION_SECRET: 'test-session-secret-for-config-listing',
    };
    const standard = spawnSync(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        '--config=playwright.config.ts',
        '--project=desktop',
        '--grep-invert',
        '@rehearsal-live',
        '--list',
        'e2e/a-virtual-player-h1.spec.ts',
      ],
      { encoding: 'utf8', env, timeout: 15_000 },
    );
    const standardOutput = `${standard.stdout}\n${standard.stderr}`;

    expect(standard.error).toBeUndefined();
    expect(standard.status).toBe(1);
    expect(standardOutput).toContain('No tests found.');
    expect(standardOutput).not.toContain(
      'virtual players complete a real game',
    );

    const rehearsal = spawnSync(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        '--config=playwright.rehearsal.config.ts',
        '--list',
        'e2e/a-virtual-player-h1.spec.ts',
      ],
      { encoding: 'utf8', env, timeout: 15_000 },
    );
    const rehearsalOutput = `${rehearsal.stdout}\n${rehearsal.stderr}`;

    expect(rehearsal.error).toBeUndefined();
    expect(rehearsal.status).toBe(0);
    expect(rehearsalOutput).toContain('virtual players complete a real game');
    expect(rehearsalOutput).toContain('@virtual-player-h1');
    expect(rehearsalOutput).toContain('@virtual-player-h2');
  });

  it('uses Node 24-compatible pinned artifact actions in CI', () => {
    const workflow = readFileSync('.github/workflows/verify.yml', 'utf8');
    expect(workflow).toContain(
      'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2',
    );
    expect(workflow).toContain(
      'actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2',
    );
  });
});
