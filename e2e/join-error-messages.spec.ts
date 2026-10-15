import { expect, test } from '@playwright/test';

const CODE_UNAVAILABLE =
  'That game code or invite is not active. Check it or ask your organiser for a fresh one.';
const NAME_CHECK_FAILED =
  'We could not check that name. Check your connection and try again.';
const RECOVERY_FAILED =
  'We could not recover that seat. Check the game code or invitation, name and PIN, then try again. If you no longer know the PIN, ask your organiser to reset it.';
const JOIN_NETWORK =
  'We could not send your join request. Check your connection and try again.';
const RECOVERY_NETWORK =
  'We could not reach the game to recover your seat. Check your connection and try again.';

async function enterName(page: import('@playwright/test').Page) {
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'c'.repeat(43) } }),
  );
  await page.goto('/play');
  await page.getByRole('button', { name: 'Join a game', exact: true }).click();
  const codeBoxes = page.getByRole('textbox', {
    name: /Game code character/,
  });
  for (let index = 0; index < 6; index += 1) {
    await codeBoxes.nth(index).fill('ABC234'[index]!);
  }
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Your first name', { exact: true }).fill('Alex');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

function skipNonPhoneProfiles(projectName: string) {
  test.skip(
    !['Pixel', 'iPhone'].includes(projectName),
    'Entry failure copy is exercised on phone profiles',
  );
}

test('an unavailable game code gives a clear next step', async ({
  page,
}, testInfo) => {
  skipNonPhoneProfiles(testInfo.project.name);
  await page.route('**/api/join/name-check', (route) =>
    route.fulfill({ json: { status: 'available' } }),
  );
  await page.route('**/api/join', (route) =>
    route.fulfill({ status: 404, json: { error: CODE_UNAVAILABLE } }),
  );

  await enterName(page);
  await page.getByLabel('4-digit PIN', { exact: true }).fill('1234');
  await page.getByRole('button', { name: 'Join', exact: true }).click();

  await expect(page.getByRole('alert')).toHaveText(CODE_UNAVAILABLE);
});

test('a failed name check gives a clear next step', async ({
  page,
}, testInfo) => {
  skipNonPhoneProfiles(testInfo.project.name);
  await page.route('**/api/join/name-check', (route) =>
    route.fulfill({
      status: 503,
      json: { error: NAME_CHECK_FAILED },
    }),
  );

  await enterName(page);

  await expect(page.getByRole('alert')).toHaveText(NAME_CHECK_FAILED);
});

test('a failed PIN recovery gives a clear next step', async ({
  page,
}, testInfo) => {
  skipNonPhoneProfiles(testInfo.project.name);
  await page.route('**/api/join/name-check', (route) =>
    route.fulfill({ json: { status: 'duplicate' } }),
  );
  await page.route('**/api/recover', (route) =>
    route.fulfill({ status: 401, json: { error: RECOVERY_FAILED } }),
  );

  await enterName(page);
  await page
    .getByRole('button', { name: "Yes, that's me", exact: true })
    .click();
  await page.getByLabel('4-digit PIN', { exact: true }).fill('1234');
  await page.getByRole('button', { name: 'Join', exact: true }).click();

  await expect(page.getByRole('alert')).toHaveText(RECOVERY_FAILED);
});

test('a network failure during join gives a clear next step', async ({
  page,
}, testInfo) => {
  skipNonPhoneProfiles(testInfo.project.name);
  await page.route('**/api/join/name-check', (route) =>
    route.fulfill({ json: { status: 'available' } }),
  );
  await page.route('**/api/join', (route) => route.abort());

  await enterName(page);
  await page.getByLabel('4-digit PIN', { exact: true }).fill('1234');
  await page.getByRole('button', { name: 'Join', exact: true }).click();

  await expect(page.getByRole('alert')).toHaveText(JOIN_NETWORK);
});

test('a network failure during recovery gives a clear next step', async ({
  page,
}, testInfo) => {
  skipNonPhoneProfiles(testInfo.project.name);
  await page.route('**/api/join/name-check', (route) =>
    route.fulfill({ json: { status: 'duplicate' } }),
  );
  await page.route('**/api/recover', (route) => route.abort());

  await enterName(page);
  await page
    .getByRole('button', { name: "Yes, that's me", exact: true })
    .click();
  await page.getByLabel('4-digit PIN', { exact: true }).fill('1234');
  await page.getByRole('button', { name: 'Join', exact: true }).click();

  await expect(page.getByRole('alert')).toHaveText(RECOVERY_NETWORK);
});
