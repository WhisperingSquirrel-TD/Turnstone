import { test, expect } from '@playwright/test';

test('mobile join and rehearsal stay enabled after the same-origin CSRF handshake', async ({
  page,
}, testInfo) => {
  test.skip(
    !['Pixel', 'iPhone'].includes(testInfo.project.name),
    'CSRF mobile regression runs on Pixel and iPhone profiles',
  );

  const csrfResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/csrf',
  );
  await page.goto('/play');
  const csrfResponse = await csrfResponsePromise;

  expect(csrfResponse.ok()).toBe(true);
  expect(csrfResponse.headers()['content-type']).toContain('application/json');
  const setCookie = csrfResponse.headers()['set-cookie'] ?? '';
  expect(/HttpOnly/i.test(setCookie)).toBe(true);
  expect(/SameSite=(Strict|Lax|None)/i.test(setCookie)).toBe(true);
  const csrfBody = (await csrfResponse.json()) as { csrfToken: string };

  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Join game' })).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Rehearse a full game' }),
  ).toBeEnabled();

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

test('mobile CSRF setup failures explain how to recover', async ({ page }, testInfo) => {
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
