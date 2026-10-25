import { expect, test } from '@playwright/test';

test('presenter screen is off by default and can be opted into at game creation', async ({
  page,
}) => {
  await page.route('**/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'screen-test-token' } }),
  );

  await page.goto('/');
  await page.getByTestId('button-create-game').click();
  await page.getByTestId('button-continue-create-name').click();
  await page.getByTestId('button-continue-player-count').click();

  const presenterToggle = page.getByTestId('toggle-presenter');
  await expect(presenterToggle).not.toBeChecked();
  await presenterToggle.check();
  await expect(presenterToggle).toBeChecked();
});
