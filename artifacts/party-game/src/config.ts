/// <reference types="vite/client" />
import { deploymentMode } from '@workspace/security/deployment';
import { APP_ROUTE_PATHS } from '@workspace/shared/app-routes';

const appName = 'Oathstone';
const builder = 'Stackstone Consulting';
const byline = `made by ${builder}`;
const siteOrigin = 'https://oathstone.stackstoneconsulting.co.uk';

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
  tagline: 'A game of traitors and faithful.',
  byline,
  builder,
  siteOrigin,
  companyPageUrl: 'https://stackstoneconsulting.co.uk/oathstone',
  productionRpId: new URL(siteOrigin).hostname,
  apiOrigin: configuredApiOrigin,
  appIconPath: 'brand/stackstone-icon-dark.svg',
  stackstoneIcons: {
    onLight: 'brand/stackstone-icon.svg',
    onDark: 'brand/stackstone-icon-dark.svg',
  },
  socialLinks: [] as const,
  preLaunch: deploymentMode.preLaunchNoindex && !deploymentMode.comingSoonMode,
  organisation: {
    name: builder,
    url: 'https://stackstoneconsulting.co.uk/',
    location: { locality: 'Abingdon', region: 'Oxfordshire' },
  },
  /** Opens the player's own mail app; the game itself sends nothing. */
  feedbackMailto:
    'mailto:assistant@stackstoneconsulting.co.uk?subject=Oathstone%20feedback',
  routes: {
    ...APP_ROUTE_PATHS,
    rehearsal: `${APP_ROUTE_PATHS.play}?entry=rehearsal`,
  },
} as const;
