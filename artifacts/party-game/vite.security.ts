import type { Plugin } from 'vite';
import { createNonce, securityHeaders } from '@workspace/security';
import { PRE_LAUNCH_NOINDEX } from '@workspace/security/deployment';

export function noncePlugin(): Plugin {
  return {
    name: 'per-response-csp',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        const nonce = createNonce();
        for (const [key, value] of Object.entries(securityHeaders(nonce, true)))
          res.setHeader(key, value);
        if (PRE_LAUNCH_NOINDEX)
          res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        const end = res.end.bind(res);
        // Vite's cspNonce puts the placeholder on scripts/styles and in its nonce meta.
        // Replace only the final HTML response, not JS/CSS assets.
        res.end = ((chunk: unknown, ...args: unknown[]) => {
          const isHtml = String(res.getHeader('content-type')).includes(
            'text/html',
          );
          const body =
            isHtml && (typeof chunk === 'string' || Buffer.isBuffer(chunk))
              ? chunk.toString().replaceAll('__RESPONSE_NONCE__', nonce)
              : chunk;
          if (isHtml) res.removeHeader('content-length');
          return Reflect.apply(end, res, [body, ...args]);
        }) as typeof res.end;
        next();
      });
    },
  };
}
