/// <reference types="vite/client" />
import { PRE_LAUNCH_NOINDEX } from '@workspace/security/deployment';

const appName = 'Turnstone';
const builder = 'Stackstone Consulting';
const byline = `made by ${builder}`;
const siteOrigin = 'https://turnstone.stackstoneconsulting.co.uk';

export function resolveApiOrigin(
  legacyConfiguredOrigin: string | undefined,
): null {
  void legacyConfiguredOrigin;
  return null;
}

const configuredApiOrigin = resolveApiOrigin(undefined);

export const config = {
  appName,
  wordmarkAccentSuffix: 'stone',
  tagline: `${appName}: the traitor game where everyone plays.`,
  byline,
  builder,
  siteOrigin,
  productionRpId: new URL(siteOrigin).hostname,
  apiOrigin: configuredApiOrigin,
  appIconPath: 'brand/stackstone-icon-dark-outlined.svg',
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
