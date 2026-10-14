import { describe, expect, it } from 'vitest';
import { config } from '../artifacts/party-game/src/config';
import { createWebManifest } from '../artifacts/party-game/src/pwa-manifest';

describe('installed website manifest', () => {
  it('uses the configured identity and stays within the artifact base path', () => {
    const manifest = createWebManifest('/party-game/');

    expect(manifest.name).toBe(config.appName);
    expect(manifest.short_name).toBe(config.appName);
    expect(manifest.display).toBe('standalone');
    expect(manifest.display_override).toContain('minimal-ui');
    expect(manifest.orientation).toBe('any');
    expect(manifest.scope).toBe('/party-game/');
    expect(manifest.start_url).toBe('/party-game/');
    expect(manifest.icons).toEqual([
      expect.objectContaining({
        src: '/party-game/brand/stackstone-icon.svg',
        type: 'image/svg+xml',
        purpose: 'maskable any',
      }),
    ]);
  });

  it('uses the root scope for the standalone production site', () => {
    const manifest = createWebManifest('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.start_url).toBe('/');
  });
});
