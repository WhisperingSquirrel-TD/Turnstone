import { expect, test, type Page } from '@playwright/test';
import { createPublicView } from './support/public-view';

/** Browser-only module mocking: no test hook or configuration route in the app. */
async function shareConfiguration(
  page: Page,
  base: string,
  previewHost = false,
) {
  await page.route('**/src/lobby-code-url.ts*', async (route) => {
    const response = await route.fetch();
    let source = await response.text();
    const setting = /const configuredPublicBaseUrl = [^;]+;/;
    expect(source).toMatch(setting);
    source = source.replace(
      setting,
      `const configuredPublicBaseUrl = ${JSON.stringify(base)};`,
    );
    if (previewHost) {
      source = source
        .replace(
          /function previewShareWarning\(([^)]*)\) \{/,
          '$& origin = "https://private.kirk.replit.dev";',
        )
        .replace(
          'function publicShareUrl(input) {',
          '$& input = { ...input, origin: "https://private.kirk.replit.dev" };',
        );
    }
    await route.fulfill({ response, body: source });
  });
}

async function lobby(page: Page) {
  const gameId = 'public-share-room';
  const view = {
    ...createPublicView(gameId),
    phase: 'LOBBY',
    lobbyCode: 'ABC234',
  };
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'c'.repeat(64) } }),
  );
  await page.route(`**/api/games/${gameId}/invites`, (route) =>
    route.fulfill({
      status: 201,
      json: {
        gameId,
        shortCode: 'ABC234',
        joinUrl: `https://private.kirk.replit.dev/join/${gameId}#${'i'.repeat(43)}`,
      },
    }),
  );
  await page.route(`**/api/games/${gameId}/coordinator/view`, (route) =>
    route.fulfill({
      json: { view, version: view.version, serverNow: Date.now() },
    }),
  );
  await page.route(`**/api/games/${gameId}/join-requests`, (route) =>
    route.fulfill({ json: { requests: [] } }),
  );
  await page.route(`**/api/games/${gameId}/coordinator/delegates`, (route) =>
    route.fulfill({ json: { limit: 1, seatIds: [] } }),
  );
  await page.route(`**/api/games/${gameId}/coordinator/presence`, (route) =>
    route.fulfill({ json: { status: 'online' } }),
  );
  await page.goto(`/coordinate/${gameId}`);
  await expect(page.getByTestId('text-lobby-code')).toHaveText('ABC234');
}

test('configured public base drives the Lobby QR even on a simulated private preview', async ({
  page,
}) => {
  await shareConfiguration(page, 'https://public.example/game/', true);
  await lobby(page);
  await expect(page.getByTestId('lobby-join-qr')).toHaveAttribute(
    'data-join-url',
    'https://public.example/game/join#code=ABC234',
  );
  await expect(page.getByTestId('preview-share-warning')).toHaveCount(0);
  const shared: string[] = [];
  await page.exposeFunction('recordShareUrl', (url: string) =>
    shared.push(url),
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (url: string) =>
          (
            window as unknown as {
              recordShareUrl: (url: string) => Promise<void>;
            }
          ).recordShareUrl(url),
      },
    });
  });
  await page.getByTestId('button-share-game').click();
  await expect
    .poll(() => shared[0])
    .toBe(
      `https://public.example/game/join/public-share-room#${'i'.repeat(43)}`,
    );
});

test('unconfigured preview keeps its code and warns rather than sharing a private QR', async ({
  page,
}) => {
  await shareConfiguration(page, '', true);
  await lobby(page);
  await expect(page.getByTestId('preview-share-warning')).toHaveText(
    'Players outside your Replit account cannot open this preview link. It will work once the game is published.',
  );
  await expect(page.getByTestId('lobby-join-qr')).toHaveCount(0);
});

test('a non-development host retains a usable join QR without the preview warning', async ({
  page,
}) => {
  await shareConfiguration(page, '');
  await lobby(page);
  await expect(page.getByTestId('lobby-join-qr')).toHaveAttribute(
    'data-join-url',
    /\/join#code=ABC234$/,
  );
  await expect(page.getByTestId('preview-share-warning')).toHaveCount(0);
});

test('a code join link goes directly to the prefilled name step', async ({
  page,
}) => {
  let submittedCode: unknown;
  await page.route('**/api/join/name-check', (route) => {
    submittedCode = route.request().postDataJSON().shortCode;
    return route.fulfill({ json: { status: 'available' } });
  });
  await page.goto('/join#code=ABC234');
  await expect(
    page.getByRole('textbox', { name: /first name/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: /first name/i }),
  ).toBeFocused();
  await expect(page.getByTestId('button-continue-join-code')).toHaveCount(0);
  await page.getByRole('textbox', { name: /first name/i }).fill('Ava');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect.poll(() => submittedCode).toBe('ABC234');
});
