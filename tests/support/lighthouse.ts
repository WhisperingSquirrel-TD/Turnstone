import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { buildStaticPublicSite } from '../../artifacts/party-game/src/static-public-build';
import { createWebApp } from '../../artifacts/party-game/src/web-app';
import { PUBLIC_MARKETING_ROUTE_PATHS } from '../../lib/shared/src/app-routes';

// The launch-mode copy is test-only: the actual build and preview remain noindex.
const publicDirectory = new URL(
  '../../artifacts/party-game/dist/public',
  import.meta.url,
).pathname;
const launchModeDirectory = new URL(
  '../../generated-artifacts/lighthouse/launch-mode/',
  import.meta.url,
).pathname;
await mkdir('generated-artifacts/lighthouse', { recursive: true });
await rm(launchModeDirectory, { recursive: true, force: true });
await buildStaticPublicSite({
  sourceDirectory: publicDirectory,
  outputDirectory: launchModeDirectory,
  deploymentMode: { preLaunchNoindex: false, comingSoonMode: true },
});

const server = createWebApp(publicDirectory).listen(0, '127.0.0.1');
const launchModeServer = createWebApp(launchModeDirectory, {
  forLighthouseAudit: true,
}).listen(0, '127.0.0.1');
await Promise.all(
  [server, launchModeServer].map(
    (activeServer) =>
      new Promise<void>((resolve) => activeServer.once('listening', resolve)),
  ),
);
const address = server.address();
const launchModeAddress = launchModeServer.address();
if (
  !address ||
  typeof address === 'string' ||
  !launchModeAddress ||
  typeof launchModeAddress === 'string'
) {
  throw new Error('Lighthouse test server failed');
}
const browser = await chromium.launch({
  args: ['--remote-debugging-port=9222'],
});
try {
  await mkdir('generated-artifacts/lighthouse', { recursive: true });
  const publicPage = await browser.newPage();
  const publicRequests: string[] = [];
  publicPage.on('request', (request) => publicRequests.push(request.url()));
  await publicPage.goto(`http://127.0.0.1:${launchModeAddress.port}/`, {
    waitUntil: 'networkidle',
  });
  if (publicRequests.some((url) => new URL(url).pathname === '/api/csrf')) {
    throw new Error('The public home page must not request a CSRF token.');
  }
  await publicPage.close();
  const publicPages = PUBLIC_MARKETING_ROUTE_PATHS.map(
    (route) =>
      [
        route === '/' ? 'home' : route.slice(1),
        route,
        launchModeAddress.port,
      ] as const,
  );
  for (const [label, path, port] of [
    ...publicPages,
    ['play', '/play', address.port] as const,
  ]) {
    const requiredCategories =
      label === 'home'
        ? (['performance', 'accessibility', 'best-practices', 'seo'] as const)
        : label === 'play'
          ? (['accessibility'] as const)
          : (['accessibility', 'best-practices', 'seo'] as const);
    const result = await lighthouse(`http://127.0.0.1:${port}${path}`, {
      port: 9222,
      onlyCategories: [...requiredCategories],
      logLevel: 'error',
    });
    if (!result || result.lhr.runtimeError)
      throw new Error('Lighthouse audit failed');
    await writeFile(
      `generated-artifacts/lighthouse/${label}.json`,
      JSON.stringify(result.lhr, null, 2),
    );
    for (const category of requiredCategories) {
      const score = result.lhr.categories[category]?.score;
      console.info(
        `Built production ${label}: Lighthouse mobile ${category} ${score}`,
      );
      if (score === undefined || score === null || score < 0.95) {
        throw new Error(`Lighthouse ${category} gate failed: ${label}`);
      }
    }
  }
} finally {
  await browser.close();
  await Promise.all(
    [server, launchModeServer].map(
      (activeServer) =>
        new Promise<void>((resolve, reject) =>
          activeServer.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
}
