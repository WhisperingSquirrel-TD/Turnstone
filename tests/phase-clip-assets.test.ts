import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const clipDirectory = join(process.cwd(), 'artifacts/party-game/public/clips');
const sharedPosters = ['nightfall-poster.webp', 'dawn-poster.webp'];
const formatBundles = [
  {
    format: 'WebM',
    files: ['nightfall.webm', 'dawn.webm', ...sharedPosters],
  },
  {
    format: 'MP4',
    files: ['nightfall.mp4', 'dawn.mp4', ...sharedPosters],
  },
];

it.each(formatBundles)(
  'keeps the supplied $format clips and posters under 450 KiB',
  async ({ files }) => {
    let names: string[] = [];
    try {
      names = await readdir(clipDirectory);
    } catch {
      // Clip files are optional until the owner supplies them.
    }
    const present = files.filter((name) => names.includes(name));
    if (present.length === 0) return;

    const sizes = await Promise.all(
      present.map(async (name) => ({
        name,
        bytes: (await stat(join(clipDirectory, name))).size,
      })),
    );
    expect(
      sizes.reduce((total, file) => total + file.bytes, 0),
      `${sizes.map(({ name, bytes }) => `${name}: ${bytes} bytes`).join(', ')}`,
    ).toBeLessThan(450 * 1024);
  },
);
