import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fontDirectory = path.join(root, 'artifacts/party-game/src/fonts');
const fontFiles = [
  'playfair-display-latin-400-normal.woff2',
  'dm-sans-latin-400-normal.woff2',
  'dm-sans-latin-500-normal.woff2',
];

describe('self-hosted typefaces', () => {
  it('keeps the required Latin WOFF2 files and licences within the 80 KB font budget', () => {
    const assets = [
      ...fontFiles,
      'OFL-Playfair-Display.txt',
      'OFL-DM-Sans.txt',
    ];
    for (const asset of assets) {
      expect(existsSync(path.join(fontDirectory, asset)), asset).toBe(true);
    }
    const totalBytes = fontFiles.reduce(
      (sum, file) => sum + statSync(path.join(fontDirectory, file)).size,
      0,
    );
    expect(totalBytes).toBeLessThanOrEqual(80 * 1024);
  });
});
