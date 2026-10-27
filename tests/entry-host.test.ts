import { expect, it, vi } from 'vitest';
import { staticClient } from '../artifacts/api-server/src/static-client';
import { renderGameEntryHtml } from '../artifacts/party-game/src/public-site-content';
type MiddlewareArgs = Parameters<ReturnType<typeof staticClient>>;

it.each(['GET', 'HEAD'])(
  'permanently redirects legacy %s /play with its query intact',
  async (method) => {
    const redirect = vi.fn();
    await staticClient('/tmp/no-entry-build-needed')(
      {
        method,
        path: '/play/',
        originalUrl: '/play/?entry=rehearsal',
      } as MiddlewareArgs[0],
      { redirect } as unknown as MiddlewareArgs[1],
      vi.fn(),
    );
    expect(redirect).toHaveBeenCalledWith(301, '/?entry=rehearsal');
  },
);

it('prerenders one usable paper entry, not the former marketing home', () => {
  const html = renderGameEntryHtml('/oathstone/');
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  for (const text of [
    'Join a game',
    'Create a new game',
    'Practise alone',
    'About Oathstone',
  ])
    expect(html).toContain(text);
  expect(html).toContain('href="/oathstone/join"');
  expect(html).toContain('href="/oathstone/?entry=create"');
  expect(html).toContain('href="https://stackstoneconsulting.co.uk/oathstone"');
  expect(html).toContain('Stackstone Consulting');
  expect(html).not.toContain('public-home-hero');
  expect(html).not.toContain('How it works');
});

it('marks the static first-paint entry as a beta release', () => {
  const html = renderGameEntryHtml('/');
  expect(html).toContain('data-testid="beta-tag"');
  expect(html).toContain(
    'href="mailto:assistant@stackstoneconsulting.co.uk?subject=Oathstone%20feedback" data-testid="report-issue-link">Report an issue</a>',
  );
  expect(html).toContain(
    'Thanks for trying Oathstone early. Spotted a problem? Tap Report an issue.',
  );
});
