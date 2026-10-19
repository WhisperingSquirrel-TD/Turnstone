/// <reference types="vite/client" />
import { deploymentMode } from '@workspace/security/deployment';
import { APP_ROUTE_PATHS } from '@workspace/shared/app-routes';

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
  preLaunch: deploymentMode.preLaunchNoindex && !deploymentMode.comingSoonMode,
  organisation: {
    name: builder,
    url: 'https://stackstoneconsulting.co.uk/',
    location: { locality: 'Abingdon', region: 'Oxfordshire' },
  },
  routes: {
    ...APP_ROUTE_PATHS,
    rehearsal: `${APP_ROUTE_PATHS.play}?entry=rehearsal`,
  },
} as const;
