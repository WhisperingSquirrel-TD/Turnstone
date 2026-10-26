import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const client = join(process.cwd(), 'artifacts/party-game');

// A bare package first imported lazily makes the Vite dev server optimise it
// mid-session and reload every open page, which can strand a browser test.
it('pre-bundles every bare package the client entry imports lazily', async () => {
  const entry = await readFile(join(client, 'src/main.tsx'), 'utf8');
  const config = await readFile(join(client, 'vite.config.ts'), 'utf8');
  const lazyPackages = [
    ...entry.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
  ]
    .map((match) => match[1]!)
    .filter((specifier) => !/^(?:\.|\/|@\/)/.test(specifier));
  const includeBlock = /optimizeDeps:\s*\{\s*include:\s*\[([^\]]*)\]/.exec(
    config,
  )?.[1];

  expect(lazyPackages).toContain('react-dom/client');
  expect(includeBlock, 'vite.config.ts optimizeDeps.include').toBeDefined();
  const included = [...includeBlock!.matchAll(/['"]([^'"]+)['"]/g)].map(
    (match) => match[1],
  );
  for (const specifier of lazyPackages)
    expect(included, `optimizeDeps.include lacks ${specifier}`).toContain(
      specifier,
    );
});
