import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createApp } from '../artifacts/api-server/src/app';
import { prepareClientBuild } from '../artifacts/api-server/src/client-build';
import { assertClientBuild } from '../artifacts/api-server/src/static-client';
import { en } from '../artifacts/party-game/src/locale/en-GB';

test.describe('built client through the real Node server', () => {
  test.describe.configure({ mode: 'serial' });
  let directory: string;
  let server: Server;
  let origin: string;
  test.beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'oathstone-production-browser-'));
    await promisify(execFile)(
      'pnpm',
      [
        '--filter',
        '@workspace/party-game',
        'exec',
        'vite',
        'build',
        '--outDir',
        directory,
      ],
      {
        timeout: 60_000,
        env: { ...process.env, PORT: '4173', BASE_PATH: '/' },
      },
    );
    await prepareClientBuild(directory);
    await assertClientBuild(directory, { prepared: true });
    server = createServer(
      createApp(async () => {}, { clientDirectory: directory }),
    );
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing test server address');
    origin = `http://127.0.0.1:${address.port}`;
  });
  test.afterAll(async () => {
    server?.closeAllConnections();
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  test('hydrates under strict CSP and navigates without another document request', async ({
    page,
  }) => {
    const violations: string[] = [];
    let documents = 0;
    page.on('request', (request) => {
      if (request.resourceType() === 'document') documents++;
    });
    page.on('console', (message) => {
      if (
        /Content Security Policy|Refused to (?:execute|apply|load)/i.test(
          message.text(),
        )
      )
        violations.push(message.text());
    });
    const response = await page.goto(origin + '/');
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toContain('text/html');
    await expect(
      page.getByText('Join a game', { exact: true }),
      JSON.stringify(violations),
    ).toBeVisible({ timeout: 5_000 });
    await page.getByText('Join a game', { exact: true }).click();
    await expect(
      page.getByRole('heading', { name: en.entry.codeHeading, exact: true }),
    ).toBeVisible();
    expect(documents).toBe(1);
    expect(violations).toEqual([]);
  });
  test('has a styled first paint with JavaScript disabled and no home content on app routes', async ({
    browser,
    page,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: page.viewportSize() ?? undefined,
    });
    try {
      const plain = await context.newPage();
      for (const path of ['/', '/join']) {
        const response = await plain.goto(origin + path);
        expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
        await expect(plain.locator('html')).toHaveCSS(
          'background-color',
          'rgb(46, 43, 41)',
        );
        await expect(plain.getByTestId('text-entry-brand')).toBeVisible();
        await expect(plain.getByTestId('text-entry-brand')).toHaveCSS(
          'font-family',
          /Playfair Display/,
        );
        if (path === '/join')
          expect(await response!.text()).not.toContain(
            'Frequently asked questions',
          );
      }
    } finally {
      await context.close();
    }
  });
});
