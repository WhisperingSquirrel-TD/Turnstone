import type { IncomingHttpHeaders } from 'node:http';

type SocketOriginHeaders = Pick<IncomingHttpHeaders, 'host' | 'origin'>;

export function isAllowedSocketOrigin(
  headers: SocketOriginHeaders,
  allowedOrigins: readonly string[],
): boolean {
  if (headers.origin !== undefined)
    return allowedOrigins.includes(headers.origin);

  const host = headers.host;
  if (!host) return false;

  return allowedOrigins.some((allowedOrigin) => {
    try {
      const origin = new URL(allowedOrigin);
      if (!['http:', 'https:'].includes(origin.protocol)) return false;

      const requestUrl = new URL(`${origin.protocol}//${host}`);
      return (
        !requestUrl.username &&
        !requestUrl.password &&
        requestUrl.pathname === '/' &&
        !requestUrl.search &&
        !requestUrl.hash &&
        requestUrl.host.toLowerCase() === origin.host.toLowerCase()
      );
    } catch {
      return false;
    }
  });
}
