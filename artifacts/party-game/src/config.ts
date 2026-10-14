/// <reference types="vite/client" />
import { PRE_LAUNCH_NOINDEX } from '@workspace/security/deployment';

const appName = 'Turnstone';
const builder = 'Stackstone Consulting';
const siteOrigin = 'https://turnstone.stackstoneconsulting.co.uk';

export function resolveApiOrigin(
  isDevelopment: boolean,
  configuredOrigin: string | undefined,
): string | null {
  if (isDevelopment) return null;
  return configuredOrigin || null;
}

const configuredApiOrigin = resolveApiOrigin(
  Boolean(import.meta.env?.DEV),
  import.meta.env?.VITE_API_ORIGIN as string | undefined,
);

export const config = {
  appName,
  wordmarkAccentSuffix: 'stone',
  tagline: `${appName}: the traitor game where everyone plays.`,
  byline: 'A Stackstone game',
  builder,
  siteOrigin,
  productionRpId: new URL(siteOrigin).hostname,
  plannedApiOrigin: 'https://live.turnstone.stackstoneconsulting.co.uk',
  apiOrigin: configuredApiOrigin,
  brandMarkPath: 'brand/stackstone-logo-dark-outlined.svg',
  stackstoneIconPath: 'brand/stackstone-icon-dark-outlined.svg',
  appIconPath: 'brand/turnstone-emblem-dark.svg',
  socialLinks: [] as const,
  preLaunch: PRE_LAUNCH_NOINDEX,
  organisation: {
    name: builder,
    url: 'https://stackstoneconsulting.co.uk/',
    location: { locality: 'Abingdon', region: 'Oxfordshire' },
  },
  routes: {
    home: '/',
    play: '/play',
    join: '/join',
    faq: '/faq',
    compare: '/compare',
    rehearsal: '/play?entry=rehearsal',
  },
} as const;
