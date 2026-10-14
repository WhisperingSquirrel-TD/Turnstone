import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { noncePlugin } from './vite.security';
import { config } from './src/config';
import { createWebManifest } from './src/pwa-manifest';
import { getPublicTitle, renderPublicHomeHtml, structuredPublicData } from './src/public-site-content';
import { en } from './src/locale/en-GB';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const port = Number(process.env.PORT);
const basePath = process.env.BASE_PATH;
const testApiProxyTarget = process.env.TEST_API_PROXY_TARGET;
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Missing or invalid environment variable: PORT');
if (!basePath?.startsWith('/'))
  throw new Error('Missing or invalid environment variable: BASE_PATH');

export default defineConfig({
  base: basePath,
  plugins: [
    {
      name: 'identity-web-app-manifest',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const pathname = new URL(
            request.url ?? '/',
            'http://vite.local',
          ).pathname;
          if (!pathname.endsWith('/manifest.webmanifest')) {
            next();
            return;
          }
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/manifest+json');
          response.end(JSON.stringify(createWebManifest(basePath)));
        });
      },
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'manifest.webmanifest',
          source: JSON.stringify(createWebManifest(basePath), null, 2),
        });
      },
    },
    {
      name: 'prerender-public-home-and-metadata',
      transformIndexHtml: {
        order: 'pre',
        handler: (html) =>
          html
            .replaceAll('__PUBLIC_TITLE__', escapeHtml(getPublicTitle()))
            .replaceAll(
              '__PUBLIC_DESCRIPTION__',
              escapeHtml(en.publicSite.answer(config.appName)),
            )
            .replaceAll('__CANONICAL_URL__', escapeHtml(config.siteOrigin))
            .replaceAll(
              '__PUBLIC_JSON_LD__',
              JSON.stringify(structuredPublicData()).replaceAll('<', '\\u003c'),
            )
            .replaceAll('__PUBLIC_HOME__', renderPublicHomeHtml(basePath)),
      },
    },
    react(),
    tailwindcss(),
    noncePlugin(),
  ],
  html: { cspNonce: '__RESPONSE_NONCE__' },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
    dedupe: ['react', 'react-dom'],
  },
  root: import.meta.dirname,
  build: { outDir: 'dist/public', emptyOutDir: true },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: { strict: true },
    ...(testApiProxyTarget
      ? {
          proxy: {
            '/api': {
              target: testApiProxyTarget,
              changeOrigin: false,
              ws: true,
            },
          },
        }
      : {}),
  },
});
