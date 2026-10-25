import { expect, test } from '@playwright/test';

test('the root is one paper entry with three working choices', async ({
  page,
}) => {
  const choices = [
    {
      label: 'Create a new game',
      testId: 'button-create-game',
      next: 'button-continue-create-name',
    },
    {
      label: 'Join a game',
      testId: 'button-join-game',
      next: 'input-join-code-1',
    },
    {
      label: 'Practise alone',
      testId: 'button-practise-alone',
      next: 'input-rehearsal-name',
    },
  ];
  for (const choice of choices) {
    await page.goto('/');
    await expect(page.locator('.entry-experience')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Oathstone',
    );
    const action = page.getByTestId(choice.testId);
    await expect(action).toBeVisible();
    await expect(action).toHaveAccessibleName(choice.label);
    await action.click();
    await expect(page.getByTestId(choice.next)).toBeVisible();
  }
});

test('legacy /play redirects with HTTP 301 and keeps query and fragment', async ({
  request,
  page,
}) => {
  const response = await request.get('/play?entry=create&source=paper', {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(301);
  const location = response.headers().location;
  expect(location).toBeTruthy();
  const redirectUrl = new URL(location!, 'https://stackstoneconsulting.co.uk');
  expect(redirectUrl.pathname).toBe('/');
  expect(redirectUrl.search).toBe('?entry=create&source=paper');

  await page.goto('/play?entry=create&source=paper#keep-fragment');
  await expect(page).toHaveURL(/\/\?entry=create&source=paper#keep-fragment$/);
  await expect(page.getByTestId('button-continue-create-name')).toBeVisible();
});

test('the root advertises the approved canonical company URL', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://stackstoneconsulting.co.uk/oathstone',
  );
  await expect(
    page.getByRole('link', { name: 'About Oathstone', exact: true }),
  ).toHaveAttribute('href', 'https://stackstoneconsulting.co.uk/oathstone');
});

test('join and game routes are noindex', async ({ request }) => {
  for (const route of ['/join', '/game/entry-routing-noindex-check']) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(200);
    expect(response.headers()['x-robots-tag'], route).toBe('noindex, nofollow');
  }
});

test('a code link opens directly on the focused name step with its code prefilled', async ({
  page,
}) => {
  let submittedCode: unknown;
  await page.route('**/api/join/name-check', (route) => {
    submittedCode = route.request().postDataJSON().shortCode;
    return route.fulfill({ json: { status: 'available' } });
  });

  await page.goto('/join#code=ABC234');
  const nameField = page.getByRole('textbox', { name: /first name/i });
  await expect(nameField).toBeVisible();
  await expect(nameField).toBeFocused();
  await expect(page.getByTestId('button-continue-join-code')).toHaveCount(0);
  await nameField.fill('Riley');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect.poll(() => submittedCode).toBe('ABC234');
});
