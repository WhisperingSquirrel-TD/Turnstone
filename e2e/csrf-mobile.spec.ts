import { test, expect } from '@playwright/test';

test('mobile join and rehearsal stay enabled after the same-origin CSRF handshake', async ({
  page,
}, testInfo) => {
  test.skip(
    !['Pixel', 'iPhone'].includes(testInfo.project.name),
    'CSRF mobile regression runs on Pixel and iPhone profiles',
  );

  const csrfResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/csrf',
  );
  await page.goto('/play');
  const csrfResponse = await csrfResponsePromise;

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
