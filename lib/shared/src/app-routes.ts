export const APP_ROUTE_PATHS = {
  home: '/',
  about: '/about',
  howToPlay: '/how-to-play',
  comingSoon: '/coming-soon',
  play: '/play',
  practice: '/practice',
  create: '/create',
  join: '/join',
  joinRequest: '/join-request',
  coordinate: '/coordinate',
  game: '/game',
  tv: '/tv',
  account: '/account',
  admin: '/admin',
  recap: '/recap',
  faq: '/faq',
  compare: '/compare',
} as const;

export const PUBLIC_MARKETING_ROUTE_PATHS = [
  APP_ROUTE_PATHS.home,
  APP_ROUTE_PATHS.about,
  APP_ROUTE_PATHS.howToPlay,
  APP_ROUTE_PATHS.faq,
  APP_ROUTE_PATHS.compare,
  APP_ROUTE_PATHS.comingSoon,
] as const;

export const APP_SHELL_ROUTE_BASES = [
  APP_ROUTE_PATHS.play,
  APP_ROUTE_PATHS.practice,
  APP_ROUTE_PATHS.create,
  APP_ROUTE_PATHS.join,
  APP_ROUTE_PATHS.joinRequest,
  APP_ROUTE_PATHS.coordinate,
  APP_ROUTE_PATHS.game,
  APP_ROUTE_PATHS.tv,
  APP_ROUTE_PATHS.account,
  APP_ROUTE_PATHS.admin,
  APP_ROUTE_PATHS.recap,
] as const;

export function isAppShellRoute(pathname: string): boolean {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  return APP_SHELL_ROUTE_BASES.some(
    (base) => normalizedPath === base || normalizedPath.startsWith(`${base}/`),
  );
}

export const appShellVercelRewrites = APP_SHELL_ROUTE_BASES.map((route) => ({
  source: `${route}/:path*`,
  destination: '/app-shell.html',
}));

export const appShellStaticRewrites = APP_SHELL_ROUTE_BASES.flatMap((route) => [
  { from: route, to: '/app-shell.html' },
  { from: `${route}/*`, to: '/app-shell.html' },
]);
