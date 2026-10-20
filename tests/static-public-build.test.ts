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
const liveMode = { preLaunchNoindex: false, comingSoonMode: false };
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
  tempDirectory = await mkdtemp(join(tmpdir(), 'oathstone-static-public-'));
  const sourceDirectory = join(tempDirectory, 'source');
  const outputDirectory = join(tempDirectory, 'output');
  await mkdir(join(sourceDirectory, 'assets'), { recursive: true });
  await mkdir(join(sourceDirectory, 'faq'), { recursive: true });
  await mkdir(join(sourceDirectory, 'brand'), { recursive: true });
  await mkdir(join(sourceDirectory, 'clips'), { recursive: true });
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
  await writeFile(join(sourceDirectory, 'clips', 'nightfall.webm'), 'video');
  await writeFile(join(sourceDirectory, 'clips', 'dawn.mp4'), 'video');

  await buildStaticPublicSite({
    sourceDirectory,
    outputDirectory,
    deploymentMode,
  });

  const pages = PUBLIC_MARKETING_ROUTE_PATHS.map((route) =>
    route === '/' ? 'index.html' : `${route.slice(1)}/index.html`,
  );
  for (const page of pages) {
    const html = await readFile(join(outputDirectory, page), 'utf8');
    expect(html).toContain('<html lang="en-GB">');
    expect(html).toContain('independent game made by Stackstone Consulting');
    expect(html).not.toMatch(/<script[^>]+(?:src=|type="module")/i);
  }

  const publicPageHtml = await Promise.all(
    pages.map((page) => readFile(join(outputDirectory, page), 'utf8')),
  );
  const forbiddenGameRoute =
    /href="\/(?:play|join|create|practice|coordinate)(?:[/?#"])/;
  expect(
    publicPageHtml.filter((html) => forbiddenGameRoute.test(html)),
  ).toEqual([]);
  expect(publicPageHtml.join('\n')).not.toContain('/clips/');
  const metadata = publicPageHtml.map((html) => ({
    title: html.match(/<title>(.*?)<\/title>/)?.[1],
    description: html.match(/<meta name="description" content="(.*?)">/)?.[1],
  }));
  expect(new Set(metadata.map((page) => page.title)).size).toBe(pages.length);
  expect(new Set(metadata.map((page) => page.description)).size).toBe(
    pages.length,
  );
  const aboutHeading = publicPageHtml[1]?.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1];
  const howToPlayHeading =
    publicPageHtml[2]?.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1];
  expect(aboutHeading).toBeTruthy();
  expect(howToPlayHeading).toBeTruthy();
  expect(aboutHeading).not.toBe(howToPlayHeading);
  const firstCopy = publicPageHtml
    .slice(1, 3)
    .map((html) => html.match(/<main[^>]*>[\s\S]*?<p[^>]*>(.*?)<\/p>/)?.[1]);
  expect(firstCopy[0]).toBeTruthy();
  expect(firstCopy[1]).toBeTruthy();
  expect(firstCopy[0]).not.toBe(firstCopy[1]);

  const home = await readFile(join(outputDirectory, 'index.html'), 'utf8');
  expect(home).toContain('Everyone plays. Even the host.');
  expect(home).toContain(
    'Oathstone is a free hidden-traitor party game for 5 to 40 people, played on phones in the same room or over a video call. It is coming soon.',
  );
  expect(home).toContain('A Stackstone game.');
  expect(home).toContain('How it works');
  expect(home).toContain('Choose your format');
  expect(home).toContain('Quick');
  expect(home).toContain('Frequently asked questions');
  expect(home).toContain('5 to 40 players');
  expect(home).not.toMatch(/<form\b/i);
  expect(home).not.toMatch(/\b(?:opening|launch)\s+date\b/i);
  expect(home).not.toContain('Start a new game');
  expect(home).not.toContain('Join a game');
  expect(home).not.toContain('Practise alone first');
  const appShell = await readFile(
    join(outputDirectory, 'app-shell.html'),
    'utf8',
  );
  expect(appShell).toContain('Everyone plays. Even the host.');
  expect(appShell).toContain('content="noindex, nofollow"');
  expect(appShell).not.toMatch(/<script[^>]+(?:src=|type="module")/i);
  const comingSoonPage = await readFile(
    join(outputDirectory, 'coming-soon', 'index.html'),
    'utf8',
  );
  expect(comingSoonPage).toContain(
    '<link rel="canonical" href="https://oathstone.stackstoneconsulting.co.uk/">',
  );
  const notFound = await readFile(join(outputDirectory, '404.html'), 'utf8');
  expect(notFound).toContain('It is coming soon.');
  for (const fallback of [appShell, notFound]) {
    expect(fallback).toContain('href="/">Back to home</a>');
    expect(fallback).toContain('content="noindex, nofollow"');
    expect(fallback).not.toContain('<link rel="canonical"');
    expect(fallback).not.toContain('application/ld+json');
    expect(fallback).not.toMatch(forbiddenGameRoute);
  }

  const robots = await readFile(join(outputDirectory, 'robots.txt'), 'utf8');
  const sitemap = await readFile(join(outputDirectory, 'sitemap.xml'), 'utf8');
  const llms = await readFile(join(outputDirectory, 'llms.txt'), 'utf8');
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
  expect(sitemap).not.toContain('/coming-soon');
  expect(sitemap).not.toContain('/play');
  expect(llms).toContain('/how-to-play');
  expect(llms).not.toContain('/coming-soon');

  const files = await listFiles(outputDirectory);
  expect(files.some((file) => file.endsWith('.js'))).toBe(false);
  expect(files).toContain('assets/public-abc.css');
  expect(files).toContain('assets/font-abc.woff2');
  expect(files).toContain('favicon.svg');
  expect(files).toContain('brand/stackstone-icon-dark-outlined.svg');
  expect(files.some((file) => file.startsWith('clips/'))).toBe(false);
  expect(PUBLIC_MARKETING_ROUTE_PATHS).toEqual([
    '/',
    '/about',
    '/how-to-play',
    '/faq',
    '/compare',
    '/coming-soon',
  ]);

  const liveOutputDirectory = join(tempDirectory, 'live-output');
  await buildStaticPublicSite({
    sourceDirectory,
    outputDirectory: liveOutputDirectory,
    deploymentMode: liveMode,
  });
  const liveHome = await readFile(
    join(liveOutputDirectory, 'index.html'),
    'utf8',
  );
  expect(liveHome).toContain('Start a new game');
  expect(liveHome).toContain('Join a game');
  expect(liveHome).toContain('Practise alone first');
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
