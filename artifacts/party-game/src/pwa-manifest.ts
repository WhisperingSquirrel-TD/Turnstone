import { config } from './config';

export function createWebManifest(basePath: string) {
  const scope = basePath.startsWith('/') ? basePath : `/${basePath}`;
  const normalizedScope = scope.endsWith('/') ? scope : `${scope}/`;

  return {
    id: normalizedScope,
    name: config.appName,
    short_name: config.appName,
    description: config.tagline,
    start_url: normalizedScope,
    scope: normalizedScope,
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#3D3A38',
    theme_color: '#3D3A38',
    icons: [
      {
        src: `${normalizedScope}${config.appIconPath}`,
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable any',
      },
    ],
  } as const;
}
