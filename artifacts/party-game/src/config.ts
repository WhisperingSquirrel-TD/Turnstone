const appName = 'Turnstone';
const builder = 'Stackstone Consulting';

export const config = {
  appName,
  tagline: `${appName}: the traitor game where everyone plays.`,
  byline: 'A Stackstone game',
  builder,
  organisation: {
    name: builder,
    url: 'https://stackstoneconsulting.co.uk/',
    location: { locality: 'Abingdon', region: 'Oxfordshire' },
  },
  routes: { home: '/', play: '/play' },
} as const;
