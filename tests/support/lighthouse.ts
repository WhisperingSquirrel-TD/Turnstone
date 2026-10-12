import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import { mkdir, writeFile } from 'node:fs/promises';
import { createWebApp } from '../../artifacts/party-game/src/web-app';

// Temporary production build fixture, not a second app workflow or deployment.
const server = createWebApp(
  new URL('../../artifacts/party-game/dist/public', import.meta.url).pathname,
).listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string')
  throw new Error('Test server failed');
const browser = await chromium.launch({
  args: ['--remote-debugging-port=9222'],
});
try {
  await mkdir('generated-artifacts/lighthouse', { recursive: true });
  for (const [label, path] of [
    ['home', '/'],
    ['play', '/play'],
  ]) {
    const result = await lighthouse(`http://127.0.0.1:${address.port}${path}`, {
      port: 9222,
      onlyCategories: ['accessibility'],
      logLevel: 'error',
    });
    if (!result || result.lhr.runtimeError)
      throw new Error('Lighthouse audit failed');
    await writeFile(
      `generated-artifacts/lighthouse/${label}.json`,
      JSON.stringify(result.lhr, null, 2),
    );
    const score = result.lhr.categories.accessibility?.score;
    console.info(
      `Built production ${label}: Lighthouse accessibility ${score}`,
    );
    if (score !== 1) throw new Error(`Accessibility gate failed: ${label}`);
  }
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())),
  );
}
