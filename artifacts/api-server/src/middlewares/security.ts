import type { RequestHandler } from 'express';
import { createNonce, securityHeaders } from '@workspace/security';
import {
  deploymentMode,
  shouldNoindexPath,
  type DeploymentMode,
} from '@workspace/security/deployment';

export function security(
  mode: DeploymentMode = deploymentMode,
): RequestHandler {
  return (request, response, next) => {
    const nonce = createNonce();
    response.locals.nonce = nonce;
    response.set(securityHeaders(nonce));
    if (shouldNoindexPath(request.path, mode)) {
      response.set('X-Robots-Tag', 'noindex, nofollow');
    }
    next();
  };
}
