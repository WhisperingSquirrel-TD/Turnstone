import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { brotliCompress, gzip, constants } from 'node:zlib';

async function filesIn(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? filesIn(join(directory, entry.name))
        : Promise.resolve([join(directory, entry.name)]),
    ),
  );
  return groups.flat();
}

export async function prepareClientBuild(directory: string): Promise<void> {
  await mkdir(join(directory, 'assets'), { recursive: true });
  for (const file of (await filesIn(directory)).filter(
    (file) => extname(file) === '.html',
  )) {
    let html = await readFile(file, 'utf8');
    for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
      const css = match[1]!;
      const hash = createHash('sha256').update(css).digest('hex').slice(0, 12);
      const name = `first-paint-${hash}.css`;
      await writeFile(join(directory, 'assets', name), css);
      html = html.replace(
        match[0],
        `<link rel="stylesheet" href="/assets/${name}">`,
      );
    }
    for (const match of html.matchAll(
      /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
    )) {
      if (
        !/\bsrc\s*=/.test(match[1]!) &&
        !/\btype=["']application\/(?:ld\+)?json["']/.test(match[1]!)
      ) {
        throw new Error('Built client contains an inline executable script');
      }
    }
    if (/\sstyle\s*=/i.test(html))
      throw new Error('Built client contains inline style attributes');
    await writeFile(file, html);
  }
  for (const file of await filesIn(directory)) {
    if (!/\.(?:html|css|js|json|webmanifest|svg|txt|xml)$/i.test(file))
      continue;
    const content = await readFile(file);
    const [br, gz] = await Promise.all([
      promisify(brotliCompress)(content, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 9 },
      }),
      promisify(gzip)(content, { level: 9 }),
    ]);
    await Promise.all([
      writeFile(`${file}.br`, br),
      writeFile(`${file}.gz`, gz),
    ]);
  }
}
