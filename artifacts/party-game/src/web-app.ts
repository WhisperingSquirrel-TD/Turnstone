import express from 'express';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { APP_ROUTE_PATHS, isAppShellRoute } from '@workspace/shared/app-routes';
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
  app.get([APP_ROUTE_PATHS.faq, APP_ROUTE_PATHS.compare], async (req, res) => {
    const html = await readFile(
      path.join(publicDirectory, req.path.slice(1), 'index.html'),
      'utf8',
    );
    res
      .type('html')
      .send(html.replaceAll('__RESPONSE_NONCE__', res.locals.nonce as string));
  });
  app.use(
    express.static(publicDirectory, {
      index: false,
      etag: false,
      cacheControl: false,
    }),
  );
  app.get('/{*path}', async (req, res) => {
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
