import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const clipDirectory = join(process.cwd(), 'artifacts/party-game/public/clips');
const requiredPhaseClips = [
  'nightfall.webm',
  'nightfall.mp4',
  'nightfall-poster.webp',
  'dawn.webm',
  'dawn.mp4',
  'dawn-poster.webp',
];
const allClips = [
  'nightfall',
  'dawn',
  'verdict',
  'gameover-faithful',
  'gameover-traitor',
  'game-start',
];
const requiredAllClipFiles = allClips.flatMap((clip) => [
  `${clip}.webm`,
  `${clip}.mp4`,
  `${clip}-poster.webp`,
]);
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

it('includes the owner-supplied nightfall and dawn clips in both formats', async () => {
  const names = await readdir(clipDirectory);
  expect(names).toEqual(expect.arrayContaining(requiredPhaseClips));
});

it('includes every owner-supplied public phase clip and poster', async () => {
  const names = await readdir(clipDirectory);
  expect(names).toEqual(expect.arrayContaining(requiredAllClipFiles));
});

it('keeps each supplied video and poster file below 450 KB', async () => {
  const sizes = await Promise.all(
    requiredAllClipFiles.map(async (name) => ({
      name,
      bytes: (await stat(join(clipDirectory, name))).size,
    })),
  );
  expect(
    sizes.filter(({ bytes }) => bytes >= 450 * 1024),
    'all individual clip and poster files must remain below 450 KB',
  ).toEqual([]);
});

it.each(allClips)('keeps %s format plus poster below 450 KB', async (clip) => {
  for (const format of ['mp4', 'webm']) {
    const bundleBytes =
      (await stat(join(clipDirectory, `${clip}.${format}`))).size +
      (await stat(join(clipDirectory, `${clip}-poster.webp`))).size;
    expect(bundleBytes, `${clip} ${format} plus poster`).toBeLessThan(
      450 * 1024,
    );
  }
});

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
