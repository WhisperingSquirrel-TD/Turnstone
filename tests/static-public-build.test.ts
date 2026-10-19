import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  APP_SHELL_ROUTE_BASES,
  PUBLIC_MARKETING_ROUTE_PATHS,
} from '../lib/shared/src/app-routes';
import { shouldNoindexPath } from '../lib/security/src/deployment';
import { buildStaticPublicSite } from '../artifacts/party-game/src/static-public-build';

const deploymentMode = { preLaunchNoindex: true, comingSoonMode: true };
let tempDirectory = '';

afterEach(async () => {
  if (tempDirectory) {
    await rm(tempDirectory, { recursive: true, force: true });
    tempDirectory = '';
  }
});

async function listFiles(
  directory: string,
  rootDirectory = directory,
): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory())
      files.push(...(await listFiles(path, rootDirectory)));
    else files.push(relative(rootDirectory, path));
  }
  return files;
}

it('builds public pages and an app fallback without scripts or game assets', async () => {
  tempDirectory = await mkdtemp(join(tmpdir(), 'turnstone-static-public-'));
  const sourceDirectory = join(tempDirectory, 'source');
  const outputDirectory = join(tempDirectory, 'output');
  await mkdir(join(sourceDirectory, 'assets'), { recursive: true });
  await mkdir(join(sourceDirectory, 'faq'), { recursive: true });
  await mkdir(join(sourceDirectory, 'brand'), { recursive: true });
  await writeFile(
    join(sourceDirectory, 'faq', 'index.html'),
    '<link rel="stylesheet" href="/assets/public-abc.css"><script type="module" src="/assets/app-abc.js"></script>',
  );
  await writeFile(join(sourceDirectory, 'assets', 'public-abc.css'), 'body{}');
  await writeFile(
    join(sourceDirectory, 'assets', 'app-abc.js'),
    'fetch("/api")',
  );
  await writeFile(join(sourceDirectory, 'assets', 'font-abc.woff2'), 'font');
  await writeFile(join(sourceDirectory, 'favicon.svg'), '<svg/>');
  await writeFile(
    join(sourceDirectory, 'brand', 'stackstone-icon-dark-outlined.svg'),
    '<svg/>',
  );

  await buildStaticPublicSite({
    sourceDirectory,
    outputDirectory,
    deploymentMode,
  });

  const pages = [
    'index.html',
    'about/index.html',
    'how-to-play/index.html',
    'faq/index.html',
    'compare/index.html',
    'coming-soon/index.html',
  ];
  for (const page of pages) {
    const html = await readFile(join(outputDirectory, page), 'utf8');
    expect(html).toContain('<html lang="en-GB">');
    expect(html).toContain('independent game made by Stackstone Consulting');
    expect(html).not.toMatch(/<script[^>]+(?:src=|type="module")/i);
  }

  const home = await readFile(join(outputDirectory, 'index.html'), 'utf8');
  expect(home).toContain('Everyone plays. Even the host.');
  const appShell = await readFile(
    join(outputDirectory, 'app-shell.html'),
    'utf8',
  );
  expect(appShell).toContain('Everyone plays. Even the host.');
  expect(appShell).toContain('content="noindex, nofollow"');
  expect(appShell).not.toMatch(/<script[^>]+(?:src=|type="module")/i);
  expect(await readFile(join(outputDirectory, '404.html'), 'utf8')).toContain(
    'It is coming soon.',
  );

  const robots = await readFile(join(outputDirectory, 'robots.txt'), 'utf8');
  expect(robots).toContain('Allow: /');
  expect(robots).toContain('Disallow: /play');
  expect(robots).toContain('Disallow: /practice');
  expect(robots).toContain('Disallow: /api/');
  expect(
    PUBLIC_MARKETING_ROUTE_PATHS.every(
      (route) => !shouldNoindexPath(route, deploymentMode),
    ),
  ).toBe(true);
  expect(shouldNoindexPath('/practice', deploymentMode)).toBe(true);

  const files = await listFiles(outputDirectory);
  expect(files.some((file) => file.endsWith('.js'))).toBe(false);
  expect(files).toContain('assets/public-abc.css');
  expect(files).toContain('assets/font-abc.woff2');
  expect(files).toContain('favicon.svg');
  expect(files).toContain('brand/stackstone-icon-dark-outlined.svg');
  expect(PUBLIC_MARKETING_ROUTE_PATHS).toEqual([
    '/',
    '/about',
    '/how-to-play',
    '/faq',
    '/compare',
    '/coming-soon',
  ]);
});

it('rewrites every shared app route to the static coming-soon shell', async () => {
  const replitFile = await readFile(
    new URL('../.replit', import.meta.url),
    'utf8',
  );
  const rewrites = [
    ...replitFile.matchAll(
      /\[\[deployment\.rewrites\]\]\s*from\s*=\s*"([^"]+)"\s*to\s*=\s*"([^"]+)"/g,
    ),
  ].map((match) => [match[1], match[2]]);
  const expected = APP_SHELL_ROUTE_BASES.flatMap((route) => [
    [route, '/app-shell.html'],
    [`${route}/*`, '/app-shell.html'],
  ]);

  expect(rewrites).toEqual(expected);
});
