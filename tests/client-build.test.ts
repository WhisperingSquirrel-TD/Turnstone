import { afterEach, expect, it } from 'vitest';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  readdir,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { prepareClientBuild } from '../artifacts/api-server/src/client-build';
import { assertClientBuild } from '../artifacts/api-server/src/static-client';
let root = '';
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});
async function fixture(
  html = '<style>html{background:#2e2b29}</style><script type="module" src="/assets/main-abcdef12.js"></script>',
) {
  root = await mkdtemp(join(tmpdir(), 'turnstone-precompress-'));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'), html);
  await writeFile(join(root, 'app-shell.html'), html);
  await writeFile(join(root, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  await writeFile(
    join(root, 'assets/main-abcdef12.js'),
    'export const ready = true;',
  );
}
it('externalises first-paint CSS and precompresses exact HTML, CSS, scripts and robots bytes', async () => {
  await fixture();
  await assertClientBuild(root);
  await prepareClientBuild(root);
  const html = await readFile(join(root, 'index.html'), 'utf8');
  expect(html).not.toContain('<style');
  expect(html).toMatch(/href="\/assets\/first-paint-[a-f0-9]{12}\.css"/);
  const css = (await readdir(join(root, 'assets'))).find((file) =>
    /^first-paint-.*\.css$/.test(file),
  )!;
  expect(await readFile(join(root, 'assets', css), 'utf8')).toBe(
    'html{background:#2e2b29}',
  );
  for (const file of [
    'index.html',
    'app-shell.html',
    'robots.txt',
    `assets/${css}`,
    'assets/main-abcdef12.js',
  ]) {
    const original = await readFile(join(root, file));
    expect(
      brotliDecompressSync(await readFile(join(root, file + '.br'))),
    ).toEqual(original);
    expect(gunzipSync(await readFile(join(root, file + '.gz')))).toEqual(
      original,
    );
  }
});
it('rejects executable inline scripts rather than weakening CSP', async () => {
  await fixture('<script>alert("inline")</script>');
  await expect(prepareClientBuild(root)).rejects.toThrow(
    'inline executable script',
  );
});
it('preserves non-executable JSON-LD data', async () => {
  await fixture('<script type="application/ld+json">{"@type":"Game"}</script>');
  await prepareClientBuild(root);
  expect(await readFile(join(root, 'index.html'), 'utf8')).toContain(
    'application/ld+json',
  );
});
it('refuses an unprepared production build and accepts the compressed strict-CSP output', async () => {
  await fixture();
  await expect(assertClientBuild(root, { prepared: true })).rejects.toThrow();
  await prepareClientBuild(root);
  await expect(
    assertClientBuild(root, { prepared: true }),
  ).resolves.toBeUndefined();
});
it('fails startup if the built client is incomplete or permits pre-launch crawling', async () => {
  await fixture();
  await writeFile(join(root, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  await expect(assertClientBuild(root)).rejects.toThrow('pre-launch');
  await rm(join(root, 'app-shell.html'));
  await expect(assertClientBuild(root)).rejects.toThrow();
});
