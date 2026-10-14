import { test, expect } from '@playwright/test';

test('mobile join and rehearsal stay enabled after the same-origin CSRF handshake', async ({
  page,
}, testInfo) => {
  test.skip(
    !['Pixel', 'iPhone'].includes(testInfo.project.name),
    'CSRF mobile regression runs on Pixel and iPhone profiles',
  );

  const csrfRequests: string[] = [];
  const csrfFailures: string[] = [];
  const scriptRequests: string[] = [];
  const scriptResponses: string[] = [];
  const scriptFailures: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const redact = (value: string) =>
    value
      .replace(/https?:\/\/[^\s)]+/g, '[url]')
      .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]');
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/csrf')
      csrfRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
    if (request.resourceType() === 'script' && request.url()) {
      scriptRequests.push(`${url.origin}${url.pathname}`);
    }
  });
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/csrf') {
      csrfFailures.push(
        `${url.origin}${url.pathname}: ${request.failure()?.errorText ?? 'failed'}`,
      );
    }
    if (request.resourceType() === 'script') {
      scriptFailures.push(
        `${url.origin}${url.pathname}: ${request.failure()?.errorText ?? 'failed'}`,
      );
    }
  });
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script') {
      const url = new URL(response.url());
      scriptResponses.push(`${response.status()} ${url.origin}${url.pathname}`);
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error')
      consoleErrors.push(redact(message.text().split('\n')[0]));
  });
  page.on('pageerror', (error) =>
    pageErrors.push(redact(`${error.name}: ${error.message.split('\n')[0]}`)),
  );
  const csrfResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/csrf',
    { timeout: 15_000 },
  );
  await page.goto('/play');
  const csrfResponse = await csrfResponsePromise.catch(async () => {
    const browserState = await page
      .evaluate(() => ({
        readyState: document.readyState,
        title: document.title,
        scripts: Array.from(document.scripts, (script) => {
          if (!script.src) return '[inline]';
          const url = new URL(script.src);
          return `${url.origin}${url.pathname}`;
        }),
        bodyText: document.body.innerText.slice(0, 240),
      }))
      .catch(() => null);
    throw new Error(
      `CSRF bootstrap timed out. Requests: ${csrfRequests.join(', ') || 'none'}; failures: ${csrfFailures.join(', ') || 'none'}; scripts requested: ${scriptRequests.join(', ') || 'none'}; script responses: ${scriptResponses.join(', ') || 'none'}; script failures: ${scriptFailures.join(', ') || 'none'}; console errors: ${consoleErrors.join(', ') || 'none'}; page errors: ${pageErrors.join(', ') || 'none'}; browser state: ${JSON.stringify(browserState)}`,
    );
  });

  expect(csrfResponse.ok()).toBe(true);
  expect(csrfResponse.headers()['content-type']).toContain('application/json');
  const csrfCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'turnstone-csrf',
  );
  expect(csrfCookie?.httpOnly).toBe(true);
  expect(csrfCookie?.sameSite).toBe('Strict');
  const csrfBody = (await csrfResponse.json()) as { csrfToken: string };

  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Join a game' })).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Practise alone first' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Join a game' }).click();
  await expect(
    page.getByRole('heading', { name: 'What’s the game code?' }),
  ).toBeVisible();
  await page.goto('/play');
  await page.getByRole('button', { name: 'Practise alone first' }).click();
  await expect(
    page.getByRole('heading', { name: 'Practise alone first' }),
  ).toBeVisible();
  await expect(page.getByLabel('Players')).toBeVisible();

  const protectedRequestStatus = await page.evaluate(async (csrfToken) => {
    const response = await fetch('/api/csrf-check', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': csrfToken },
    });
    return response.status;
  }, csrfBody.csrfToken);
  expect(protectedRequestStatus).toBe(204);
});

test('mobile CSRF setup failures explain how to recover', async ({
  page,
}, testInfo) => {
  test.skip(
    !['Pixel', 'iPhone'].includes(testInfo.project.name),
    'CSRF mobile regression runs on Pixel and iPhone profiles',
  );
  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{}',
    }),
  );

  await page.goto('/play');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Check your connection');
  await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible();
});
