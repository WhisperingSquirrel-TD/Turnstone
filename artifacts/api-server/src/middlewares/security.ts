import type { RequestHandler } from 'express';
import { createNonce, securityHeaders } from '@workspace/security';
import { PRE_LAUNCH_NOINDEX } from '@workspace/security/deployment';

export const security: RequestHandler = (_req, res, next) => {
  const nonce = createNonce();
  res.locals.nonce = nonce;
  res.set(securityHeaders(nonce));
  if (PRE_LAUNCH_NOINDEX) res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
};
