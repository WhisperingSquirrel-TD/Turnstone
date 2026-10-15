import express from 'express';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createNonce, securityHeaders } from '@workspace/security';
import { PRE_LAUNCH_NOINDEX } from '../../../lib/security/src/deployment';

export function createWebApp(
  publicDirectory: string,
  options: { forLighthouseAudit?: true } = {},
) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    const nonce = createNonce();
    res.locals.nonce = nonce;
    res.set(securityHeaders(nonce));
    if (PRE_LAUNCH_NOINDEX && !options.forLighthouseAudit) {
      res.set('X-Robots-Tag', 'noindex, nofollow');
    }
    next();
  });
  app.get(['/faq', '/compare'], async (req, res) => {
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
    const isHomePage = req.path === '/';
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
