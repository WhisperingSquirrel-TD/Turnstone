import type { RequestHandler } from 'express';
import { stat, access, readFile } from 'node:fs/promises';
import { resolve, sep, join, extname } from 'node:path';
import { isAppShellRoute, APP_ROUTE_PATHS } from '@workspace/shared/app-routes';
import {
  deploymentMode,
  renderRobotsTxt,
  type DeploymentMode,
} from '@workspace/security/deployment';

export async function assertClientBuild(
  directory: string,
  options: { prepared?: boolean; deploymentMode?: DeploymentMode } = {},
): Promise<void> {
  const activeDeploymentMode = options.deploymentMode ?? deploymentMode;
  await Promise.all(
    ['index.html', 'app-shell.html', 'robots.txt'].map((file) =>
      access(join(directory, file)),
    ),
  );
  const robots = (await readFile(join(directory, 'robots.txt'), 'utf8'))
    .trim()
    .replace(/\r/g, '');
  const expectedRobots = renderRobotsTxt(activeDeploymentMode)
    .trim()
    .replace(/\r/g, '');
  if (robots !== expectedRobots) {
    throw new Error(
      activeDeploymentMode.comingSoonMode
        ? 'Built client robots policy does not match coming-soon mode'
        : 'Built client must disallow pre-launch crawling',
    );
  }
  if (options.prepared) {
    for (const file of ['index.html', 'app-shell.html']) {
      const html = await readFile(join(directory, file), 'utf8');
      if (/<style\b/i.test(html))
        throw new Error('Built client must have external first-paint CSS');
    }
    await Promise.all(
      ['index.html', 'app-shell.html', 'robots.txt'].flatMap((file) =>
        ['.br', '.gz'].map((suffix) => access(join(directory, file + suffix))),
      ),
    );
  }
}

export function staticClient(directory: string): RequestHandler {
  const root = resolve(directory);
  return async (request, response, next) => {
    if (
      !['GET', 'HEAD'].includes(request.method) ||
      /^\/(?:api|socket\.io)(?:\/|$)/.test(request.path)
    )
      return next();
    try {
      let pathname: string;
      try {
        pathname = decodeURIComponent(request.path);
      } catch {
        response.status(400).end();
        return;
      }
      if (
        pathname.includes('\0') ||
        pathname.includes('\\') ||
        pathname.split('/').some((part) => part.startsWith('.'))
      ) {
        response.status(404).end();
        return;
      }
      const publicPages: Record<string, string> = {
        [APP_ROUTE_PATHS.home]: '/index.html',
        [APP_ROUTE_PATHS.faq]: '/faq/index.html',
        [APP_ROUTE_PATHS.compare]: '/compare/index.html',
      };
      const normalized = pathname.replace(/\/+$/, '') || '/';
      const resource = isAppShellRoute(pathname)
        ? '/app-shell.html'
        : (publicPages[normalized] ?? pathname);
      const file = resolve(root, `.${resource}`);
      if (!file.startsWith(root + sep)) {
        response.status(404).end();
        return;
      }
      let metadata;
      try {
        metadata = await stat(file);
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code === 'ENOENT' ||
          (error as NodeJS.ErrnoException).code === 'ENOTDIR'
        )
          return next();
        throw error;
      }
      if (!metadata.isFile()) return next();
      const representations: Record<string, string> = { identity: file };
      for (const [encoding, suffix] of [
        ['br', '.br'],
        ['gzip', '.gz'],
      ]) {
        try {
          await access(file + suffix);
          representations[encoding!] = file + suffix;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      const encoding = request.acceptsEncodings(
        ...['br', 'gzip', 'identity'].filter(
          (value) => value in representations,
        ),
      );
      response.vary('Accept-Encoding');
      if (!encoding) {
        response.status(406).end();
        return;
      }
      if (encoding !== 'identity') response.set('Content-Encoding', encoding);
      // Built documents have external scripts/styles only. API responses retain
      // the existing nonce policy; static resources allow this origin only.
      const policy = String(response.getHeader('Content-Security-Policy') ?? '')
        .split('; ')
        .map((rule) =>
          /^(script|style)-src /.test(rule)
            ? `${rule.split(' ')[0]} 'self'`
            : rule,
        )
        .join('; ');
      response.set(
        'Content-Security-Policy',
        `${policy}; manifest-src 'self'; worker-src 'self'`,
      );
      response.set('Cross-Origin-Resource-Policy', 'same-origin');
      response.set(
        'Cache-Control',
        /\/assets\/[^/]+-[\w-]{8,}\.[^/]+$/.test(resource)
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      );
      response.type(extname(file));
      response.sendFile(
        representations[encoding]!,
        { cacheControl: false, dotfiles: 'deny' },
        (error) => {
          if (error) next(error);
        },
      );
    } catch (error) {
      next(error);
    }
  };
}
