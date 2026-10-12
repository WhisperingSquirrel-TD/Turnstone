import type { RequestHandler } from 'express';
import { createNonce, securityHeaders } from '@workspace/security';

export const security: RequestHandler = (_req, res, next) => {
  const nonce = createNonce();
  res.locals.nonce = nonce;
  res.set(securityHeaders(nonce));
  next();
};
