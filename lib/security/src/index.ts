import { randomBytes } from 'node:crypto';

export function createNonce() {
  return randomBytes(24).toString('base64');
}

export function securityHeaders(nonce: string, development = false) {
  const scriptPolicy = development
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : `script-src 'nonce-${nonce}' 'strict-dynamic'`;
  const stylePolicy = development
    ? "style-src 'self' 'unsafe-inline'"
    : `style-src 'self' 'nonce-${nonce}'`;
  return {
    'Content-Security-Policy': [
      "default-src 'none'",
      scriptPolicy,
      stylePolicy,
      "img-src 'self' data:",
      "font-src 'self'",
      "media-src 'self'",
      `connect-src 'self'${development ? ' ws: wss:' : ''}`,
      "base-uri 'none'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join('; '),
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store',
  };
}
