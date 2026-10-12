import express from 'express';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createNonce, securityHeaders } from '@workspace/security';

export function createWebApp(publicDirectory: string) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    const nonce = createNonce();
    res.locals.nonce = nonce;
    res.set(securityHeaders(nonce));
    next();
  });
  app.use(
    express.static(publicDirectory, {
      index: false,
      etag: false,
      cacheControl: false,
    }),
  );
  app.get('/{*path}', async (_req, res) => {
    const html = await readFile(
      path.join(publicDirectory, 'index.html'),
      'utf8',
    );
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
