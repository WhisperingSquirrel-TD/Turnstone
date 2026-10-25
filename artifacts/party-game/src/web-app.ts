import express from 'express';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  APP_ROUTE_PATHS,
  isAppShellRoute,
  PUBLIC_MARKETING_ROUTE_PATHS,
} from '@workspace/shared/app-routes';
import { createNonce, securityHeaders } from '@workspace/security';
import {
  deploymentMode,
  shouldNoindexPath,
  type DeploymentMode,
} from '../../../lib/security/src/deployment';

export function createWebApp(
  publicDirectory: string,
  options: {
    forLighthouseAudit?: true;
    deploymentMode?: DeploymentMode;
  } = {},
) {
  const app = express();
  const activeDeploymentMode = options.deploymentMode ?? deploymentMode;
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const nonce = createNonce();
    res.locals.nonce = nonce;
    res.set(securityHeaders(nonce));
    if (
      shouldNoindexPath(req.path, activeDeploymentMode) &&
      !options.forLighthouseAudit
    ) {
      res.set('X-Robots-Tag', 'noindex, nofollow');
    }
    next();
  });
  app.get(
    PUBLIC_MARKETING_ROUTE_PATHS.filter(
      (route) => route !== APP_ROUTE_PATHS.home,
    ),
    async (req, res) => {
      const pagePath = req.path.replace(/^\/+|\/+$/g, '');
      let html: string;
      try {
        html = await readFile(
          path.join(publicDirectory, pagePath, 'index.html'),
          'utf8',
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        try {
          html = await readFile(
            path.resolve(
              publicDirectory,
              '..',
              'static-public',
              pagePath,
              'index.html',
            ),
            'utf8',
          );
        } catch (fallbackError) {
          if ((fallbackError as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw fallbackError;
          }
          res.status(404).send('Not found');
          return;
        }
      }
      res
        .type('html')
        .send(
          html.replaceAll('__RESPONSE_NONCE__', res.locals.nonce as string),
        );
    },
  );
  app.use(
    express.static(publicDirectory, {
      index: false,
      etag: false,
      cacheControl: false,
    }),
  );
  app.get('/{*path}', async (req, res) => {
    if (
      !activeDeploymentMode.comingSoonMode &&
      req.path.replace(/\/+$/, '') === APP_ROUTE_PATHS.play
    ) {
      const query = req.originalUrl.includes('?')
        ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
        : '';
      res.redirect(301, `/${query}`);
      return;
    }
    const isHomePage = req.path === APP_ROUTE_PATHS.home;
    if (!isHomePage && !isAppShellRoute(req.path)) {
      res.status(404).type('text').send('Not Found');
      return;
    }
    let html = await readFile(
      path.join(publicDirectory, isHomePage ? 'index.html' : 'app-shell.html'),
      'utf8',
    );
    if (options.forLighthouseAudit && isHomePage) {
      html = html.replace(
        /(<meta name="robots" content=")noindex, nofollow(")/,
        '$1index, follow$2',
      );
    }
    res
      .type('html')
      .send(html.replaceAll('__RESPONSE_NONCE__', res.locals.nonce as string));
  });
  app.use(
    (
      _error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next;
      res.status(503).type('text').send('Website unavailable');
    },
  );
  return app;
}
