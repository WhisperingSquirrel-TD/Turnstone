import path from 'node:path';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { noncePlugin } from './vite.security';
import { config } from './src/config';
import { createWebManifest } from './src/pwa-manifest';
import {
  getPublicTitle,
  renderLlmsTxt,
  renderPublicCompareHtml,
  renderPublicFaqHtml,
  renderPublicHomeHtml,
  renderPublicAppShellHtml,
  renderPublicStaticDocument,
  structuredPublicData,
} from './src/public-site-content';
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
const baseHref = basePath.endsWith('/') ? basePath : `${basePath}/`;

function appRelativePath(pathname: string): string {
  const prefix = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const withoutBase = pathname.startsWith(prefix)
    ? `/${pathname.slice(prefix.length)}`
    : pathname;
  const route = withoutBase.replace(/\/+$/, '') || '/';
  return route === '/index.html' ? '/' : route;
}

function pageDocument(
  kind: 'faq' | 'compare',
  stylesheetHrefs: readonly string[],
  fontPreloadHrefs: readonly string[],
): string {
  const isFaq = kind === 'faq';
  return renderPublicStaticDocument({
    content: isFaq
      ? renderPublicFaqHtml(basePath)
      : renderPublicCompareHtml(basePath),
    title: isFaq
      ? `${config.appName}: ${en.publicSite.faqHeading}`
      : `${config.appName}: ${en.publicSite.compareHeading}`,
    description: isFaq
      ? en.publicSite.faqDescription
      : en.publicSite.compareDescription,
    canonicalUrl: new URL(`/${kind}`, config.siteOrigin).href,
    basePath,
    stylesheetHrefs,
    fontPreloadHrefs,
  });
}

function appShellDocument(html: string, basePath: string): string {
  const shell = html.replace(
    /(<div id="static-home" class="safe-page">)[\s\S]*?(<\/div>\s*<div id="root"><\/div>)/,
    (_match, opening: string, closing: string) =>
      `${opening}${renderPublicAppShellHtml(basePath)}${closing}`,
  );
  if (shell === html) {
    throw new Error('Could not create the app shell from the Vite document.');
  }
  return shell
    .replace(
      /<title>[\s\S]*?<\/title>/,
      `<title>${escapeHtml(config.appName)}</title>`,
    )
    .replace(/<meta name="description"[^>]*>/, '')
    .replace(
      /<meta name="robots"[^>]*>/,
      '<meta name="robots" content="noindex, nofollow">',
    )
    .replace(/<link rel="canonical"[^>]*>/, '')
    .replace(/<meta property="og:[^"]*"[^>]*>/g, '')
    .replace(/<meta name="twitter:[^"]*"[^>]*>/g, '')
    .replace(
      /<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/i,
      '',
    );
}

export default defineConfig({
  base: basePath,
  plugins: [
    noncePlugin(),
    {
      name: 'identity-web-app-manifest',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const pathname = new URL(request.url ?? '/', 'http://vite.local')
            .pathname;
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
      name: 'prerender-public-content-pages',
      transformIndexHtml: {
        order: 'pre',
        handler: (html, context) => {
          const pathname = new URL(context.path, 'http://vite.local').pathname;
          const route = appRelativePath(pathname);
          if (route === '/faq' || route === '/compare') {
            return pageDocument(
              route === '/faq' ? 'faq' : 'compare',
              [`${baseHref}src/index.css`, `${baseHref}src/public-home.css`],
              [
                `${baseHref}src/fonts/playfair-display-latin-400-normal.woff2`,
                `${baseHref}src/fonts/dm-sans-latin-400-normal.woff2`,
                `${baseHref}src/fonts/dm-sans-latin-500-normal.woff2`,
              ],
            );
          }
          if (route === '/app-shell.html') {
            return html.replaceAll(
              '__APP_SHELL_HEADER__',
              renderPublicAppShellHtml(basePath),
            );
          }
          if (route !== '/') {
            return appShellDocument(
              html
                .replaceAll('__PUBLIC_TITLE__', escapeHtml(config.appName))
                .replaceAll('__PUBLIC_DESCRIPTION__', '')
                .replaceAll('__CANONICAL_URL__', '')
                .replaceAll('__PUBLIC_JSON_LD__', ''),
              basePath,
            );
          }
          return html
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
            .replaceAll('__PUBLIC_HOME__', renderPublicHomeHtml(basePath));
        },
      },
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const pathname = new URL(request.url ?? '/', 'http://vite.local')
            .pathname;
          const route = appRelativePath(pathname);
          if (route === '/faq' || route === '/compare') {
            const fontPreloadHrefs = [
              `${baseHref}src/fonts/playfair-display-latin-400-normal.woff2`,
              `${baseHref}src/fonts/dm-sans-latin-400-normal.woff2`,
              `${baseHref}src/fonts/dm-sans-latin-500-normal.woff2`,
            ];
            const document = pageDocument(
              route === '/faq' ? 'faq' : 'compare',
              [`${baseHref}src/index.css`, `${baseHref}src/public-home.css`],
              fontPreloadHrefs,
            );
            void server
              .transformIndexHtml(request.url ?? route, document)
              .then((html) => {
                response.statusCode = 200;
                response.setHeader('Content-Type', 'text/html; charset=utf-8');
                response.end(html);
              })
              .catch(next);
            return;
          }
          if (route !== '/llms.txt') {
            if (
              route === '/' ||
              route === '/app-shell.html' ||
              request.method !== 'GET' ||
              !request.headers.accept?.includes('text/html')
            ) {
              next();
              return;
            }
            const indexHtml = readFileSync(
              path.resolve(import.meta.dirname, 'index.html'),
              'utf8',
            );
            void server
              .transformIndexHtml(request.url ?? route, indexHtml)
              .then((html) => {
                response.statusCode = 200;
                response.setHeader('Content-Type', 'text/html; charset=utf-8');
                response.end(html);
              })
              .catch(next);
            return;
          }
          response.statusCode = 200;
          response.setHeader('Content-Type', 'text/plain; charset=utf-8');
          response.end(renderLlmsTxt());
        });
      },
      generateBundle(_options, bundle) {
        const stylesheet = Object.values(bundle).find(
          (item) => item.type === 'asset' && item.fileName.endsWith('.css'),
        );
        if (!stylesheet || stylesheet.type !== 'asset') {
          throw new Error('Expected a compiled stylesheet for public pages.');
        }
        const stylesheetHrefs = [`${baseHref}${stylesheet.fileName}`];
        const fontPreloadHrefs = Object.values(bundle)
          .filter(
            (item) => item.type === 'asset' && item.fileName.endsWith('.woff2'),
          )
          .map((item) => `${baseHref}${item.fileName}`);
        if (fontPreloadHrefs.length !== 3) {
          throw new Error('Expected three self-hosted public font assets.');
        }
        for (const page of ['faq', 'compare'] as const) {
          this.emitFile({
            type: 'asset',
            fileName: `${page}/index.html`,
            source: pageDocument(page, stylesheetHrefs, fontPreloadHrefs),
          });
        }
        this.emitFile({
          type: 'asset',
          fileName: 'llms.txt',
          source: renderLlmsTxt(),
        });
      },
    },
    react(),
    tailwindcss(),
  ],
  html: { cspNonce: '__RESPONSE_NONCE__' },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      '@tanstack/react-query',
      'qrcode.react',
      'react-router-dom',
      'socket.io-client',
      '@workspace/shared > zod',
    ],
  },
  root: import.meta.dirname,
  build: {
    outDir: 'dist/public',
    emptyOutDir: true,
    rollupOptions: {
      input: [
        path.resolve(import.meta.dirname, 'index.html'),
        path.resolve(import.meta.dirname, 'app-shell.html'),
      ],
    },
  },
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
            '^/socket\\.io(?:/|$)': {
              target: testApiProxyTarget,
              changeOrigin: false,
              ws: true,
            },
          },
        }
      : {}),
  },
});
