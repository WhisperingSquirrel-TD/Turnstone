import type { Plugin } from 'vite';
import { createNonce, securityHeaders } from '@workspace/security';
import { PRE_LAUNCH_NOINDEX } from '@workspace/security/deployment';

export function devSecurityHeaders(nonce: string, apiOrigin?: string) {
  const headers = securityHeaders(nonce, true);
  if (!apiOrigin) return headers;

  const parsedOrigin = new URL(apiOrigin);
  if (
    !['http:', 'https:'].includes(parsedOrigin.protocol) ||
    parsedOrigin.username ||
    parsedOrigin.password ||
    parsedOrigin.pathname !== '/' ||
    parsedOrigin.search ||
    parsedOrigin.hash
  ) {
    throw new Error('VITE_API_ORIGIN must be an HTTP(S) origin.');
  }

  headers['Content-Security-Policy'] =
    headers['Content-Security-Policy'].replace(
      "connect-src 'self'",
      `connect-src 'self' ${parsedOrigin.origin}`,
    );
  return headers;
}

export function noncePlugin(): Plugin {
  return {
    name: 'per-response-csp',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const nonce = createNonce();
        for (const [key, value] of Object.entries(
          devSecurityHeaders(nonce, process.env.VITE_API_ORIGIN),
        ))
          res.setHeader(key, value);
        if (PRE_LAUNCH_NOINDEX)
          res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        const pathname = new URL(req.url ?? '/', 'http://vite.local').pathname;
        if (
          pathname === '/api' ||
          pathname.startsWith('/api/') ||
          pathname === '/socket.io' ||
          pathname.startsWith('/socket.io/')
        ) {
          next();
          return;
        }
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
          if (isHtml && !res.headersSent) res.removeHeader('content-length');
          return Reflect.apply(end, res, [body, ...args]);
        }) as typeof res.end;
        next();
      });
    },
  };
}
