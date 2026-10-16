import { expect, test } from '@playwright/test';
import { APP_SHELL_ROUTE_BASES } from '../lib/shared/src/app-routes';

test('the dev server serves the shared first-paint shell only on app routes', async ({
  request,
}) => {
  for (const route of APP_SHELL_ROUTE_BASES) {
    for (const path of [route, `${route}/deep-link`]) {
      const response = await request.get(path, {
        headers: { accept: 'text/html' },
      });
      expect(response.status(), path).toBe(200);
      const html = await response.text();
      expect(html, path).toContain('class="turnstone-wordmark"');
      expect(html, path).toContain('<link rel="stylesheet"');
      expect(html, path).not.toContain('Start a new game');
      expect(html, path).not.toContain('A game of traitors and faithful.');
    }
  }

  const unknownRoute = await request.get('/not-a-turnstone-route', {
    headers: { accept: 'text/html' },
  });
  expect(unknownRoute.status()).toBe(404);
});
