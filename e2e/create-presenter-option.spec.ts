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

test('organiser sees the parity rule explained with an example and can switch it off (D121)', async ({
  page,
}) => {
  await page.route('**/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'screen-test-token' } }),
  );

  await page.goto('/');
  await page.getByTestId('button-create-game').click();
  await page.getByTestId('button-continue-create-name').click();
  await page.getByTestId('button-continue-player-count').click();

  const parityToggle = page.getByTestId('toggle-parity');
  await expect(parityToggle).toBeChecked();
  await expect(
    page.getByText(
      'On: the Traitors win as soon as they equal or outnumber the Faithful. Off: they must survive to the finale, as on the TV show.',
    ),
  ).toBeVisible();
  const help = page.getByTestId('parity-help');
  await expect(help).not.toHaveAttribute('open', '');
  const example = help.getByText(
    /8 players are left, 3 Traitors and 5 Faithful/,
  );
  await expect(example).toBeHidden();
  await help.getByText("What's this?").click();
  await expect(example).toBeVisible();
  await parityToggle.uncheck();
  await expect(parityToggle).not.toBeChecked();
});
