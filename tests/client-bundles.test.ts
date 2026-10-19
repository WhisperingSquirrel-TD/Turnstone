import { readdir, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const publicOutput = join(process.cwd(), 'artifacts/party-game/dist/public');
const assetsOutput = join(publicOutput, 'assets');
const lazyRouteChunks = ['EntryPage-', 'CoordinatorConsole-', 'PresenterPage-'];

describe('party game route bundles', () => {
  it('keeps the wizard, coordinator and presenter in separate lazy chunks', async () => {
    const assets = await readdir(assetsOutput);
    for (const prefix of lazyRouteChunks) {
      expect(
        assets.some(
          (asset) => asset.startsWith(prefix) && asset.endsWith('.js'),
        ),
        `expected a built route chunk with prefix ${prefix}`,
      ).toBe(true);
    }

    const findChunk = (prefix: string) => {
      const chunk = assets.find(
        (asset) => asset.startsWith(prefix) && asset.endsWith('.js'),
      );
      expect(
        chunk,
        `expected a built route chunk with prefix ${prefix}`,
      ).toBeDefined();
      return chunk!;
    };
    const entryPageChunk = findChunk('EntryPage-');
    const coordinatorChunk = findChunk('CoordinatorConsole-');
    const presenterChunk = findChunk('PresenterPage-');
    const appSource = await readFile(
      join(assetsOutput, findChunk('App-')),
      'utf8',
    );
    const entryPageSource = await readFile(
      join(assetsOutput, entryPageChunk),
      'utf8',
    );
    expect(appSource).toContain(entryPageChunk);
    expect(appSource).toContain(presenterChunk);
    expect(entryPageSource).toContain(coordinatorChunk);

    const appShell = await readFile(
      join(publicOutput, 'app-shell.html'),
      'utf8',
    );
    expect(appShell).not.toMatch(
      /(?:EntryPage|CoordinatorConsole|PresenterPage)-[A-Za-z0-9_-]+\.js/,
    );
  });

  it('keeps initial and shared JavaScript below the 250 KB gzip budget', async () => {
    const javascript = (await readdir(assetsOutput)).filter(
      (asset) =>
        asset.endsWith('.js') &&
        !lazyRouteChunks.some((prefix) => asset.startsWith(prefix)),
    );
    const compressedBytes = await Promise.all(
      javascript.map(
        async (asset) =>
          gzipSync(await readFile(join(assetsOutput, asset))).byteLength,
      ),
    );

    expect(
      compressedBytes.reduce((total, size) => total + size, 0),
    ).toBeLessThan(250 * 1024);
  });
});
