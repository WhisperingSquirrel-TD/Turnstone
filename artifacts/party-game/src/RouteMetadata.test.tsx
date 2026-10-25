import { expect, it } from 'vitest';
import { routeMetadata } from './RouteMetadata';

it('canonicalises the game entry to the company page, never an app session', () => {
  expect(routeMetadata('/').canonical).toBe(
    'https://stackstoneconsulting.co.uk/oathstone',
  );
  for (const path of [
    '/join/ABC123',
    '/game/session',
    '/coordinate/session',
    '/tv/session',
  ])
    expect(routeMetadata(path)).toEqual({
      canonical: null,
      robots: 'noindex, nofollow',
    });
});

it('preserves canonical information pages separately from the entry', () => {
  expect(routeMetadata('/faq').canonical).toBe(
    'https://oathstone.stackstoneconsulting.co.uk/faq',
  );
});
