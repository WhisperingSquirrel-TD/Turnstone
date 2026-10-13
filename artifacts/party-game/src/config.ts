/// <reference types="vite/client" />
import { PRE_LAUNCH_NOINDEX } from '@workspace/security/deployment';

const appName = 'Turnstone';
const builder = 'Stackstone Consulting';
const siteOrigin = 'https://turnstone.stackstoneconsulting.co.uk';

export const config = {
  appName,
  tagline: `${appName}: the traitor game where everyone plays.`,
  byline: 'A Stackstone game',
  builder,
  siteOrigin,
  productionRpId: new URL(siteOrigin).hostname,
  plannedApiOrigin: 'https://live.turnstone.stackstoneconsulting.co.uk',
  apiOrigin: (import.meta.env?.VITE_API_ORIGIN as string | undefined) ?? null,
  preLaunch: PRE_LAUNCH_NOINDEX,
  organisation: {
    name: builder,
    url: 'https://stackstoneconsulting.co.uk/',
    location: { locality: 'Abingdon', region: 'Oxfordshire' },
  },
  routes: { home: '/', play: '/play' },
} as const;
