import {
  APP_ROUTE_PATHS,
  APP_SHELL_ROUTE_BASES,
  PUBLIC_MARKETING_ROUTE_PATHS,
} from '@workspace/shared/app-routes';

export type DeploymentMode = {
  preLaunchNoindex: boolean;
  comingSoonMode: boolean;
};

type DeploymentEnvironment = {
  PRE_LAUNCH_NOINDEX?: string;
  COMING_SOON_MODE?: string;
};

function parseBooleanFlag(
  name: keyof DeploymentEnvironment,
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Invalid deployment setting: ${name}`);
}

export function resolveDeploymentMode(
  environment: DeploymentEnvironment,
): DeploymentMode {
  const preLaunchNoindex = parseBooleanFlag(
    'PRE_LAUNCH_NOINDEX',
    environment.PRE_LAUNCH_NOINDEX,
    true,
  );
  const comingSoonMode = parseBooleanFlag(
    'COMING_SOON_MODE',
    environment.COMING_SOON_MODE,
    false,
  );
  if (!preLaunchNoindex && !comingSoonMode) {
    throw new Error(
      'COMING_SOON_MODE must be explicitly true before crawling is permitted.',
    );
  }
  return { preLaunchNoindex, comingSoonMode };
}

const processEnvironment = (
  globalThis as typeof globalThis & {
    process?: { env?: DeploymentEnvironment };
  }
).process?.env;

export const deploymentMode = resolveDeploymentMode(processEnvironment ?? {});
export const PRE_LAUNCH_NOINDEX = deploymentMode.preLaunchNoindex;
export const COMING_SOON_MODE = deploymentMode.comingSoonMode;

function normalizePath(pathname: string): string {
  const pathOnly = pathname.split('?')[0] ?? pathname;
  return pathOnly.replace(/\/+$/, '') || APP_ROUTE_PATHS.home;
}

export function shouldNoindexPath(
  pathname: string,
  mode: DeploymentMode = deploymentMode,
): boolean {
  const path = normalizePath(pathname);
  if (
    mode.comingSoonMode &&
    (PUBLIC_MARKETING_ROUTE_PATHS as readonly string[]).includes(path)
  ) {
    return false;
  }
  return mode.preLaunchNoindex || mode.comingSoonMode;
}

export function renderRobotsTxt(
  mode: DeploymentMode = deploymentMode,
  sitemapUrl?: string,
): string {
  const closedRoutes = [
    ...APP_SHELL_ROUTE_BASES.map((route) => `Disallow: ${route}`),
    'Disallow: /api/',
    'Disallow: /socket.io/',
    'Disallow: /app-shell.html',
    'Disallow: /404.html',
  ];
  if (!mode.comingSoonMode) {
    // Pre-launch (D119): every page stays noindex, but agents may read the
    // public pages and llms.txt. App routes, the API and any address with a
    // query string (game codes, invites, recovery) stay closed. No sitemap,
    // because noindex pages do not belong in one.
    return [
      'User-agent: *',
      'Allow: /$',
      ...PUBLIC_MARKETING_ROUTE_PATHS.filter((route) => route !== '/').map(
        (route) => `Allow: ${route}`,
      ),
      'Allow: /llms.txt',
      ...closedRoutes,
      'Disallow: /*?',
      '',
    ].join('\n');
  }
  const rules = ['Allow: /', ...closedRoutes];
  const searchAgents = [
    'OAI-SearchBot',
    'GPTBot',
    'ChatGPT-User',
    'ClaudeBot',
    'Claude-SearchBot',
    'Claude-User',
    'PerplexityBot',
    'Google-Extended',
    'Applebot-Extended',
  ];
  return [
    'User-agent: *',
    ...rules,
    '',
    ...searchAgents.map((agent) => `User-agent: ${agent}`),
    ...rules,
    '',
    ...(sitemapUrl ? [`Sitemap: ${sitemapUrl}`] : []),
    '',
  ].join('\n');
}
