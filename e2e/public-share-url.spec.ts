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

async function lobby(
  page: Page,
  delegateFailure: 'none' | 'load' | 'save' = 'none',
) {
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
    route.fulfill(
      delegateFailure === 'load' ||
        (delegateFailure === 'save' && route.request().method() !== 'GET')
        ? { status: 503, json: { error: 'unavailable' } }
        : { json: { limit: 1, seatIds: [] } },
    ),
  );
  await page.route(`**/api/games/${gameId}/coordinator/presence`, (route) =>
    route.fulfill({ json: { status: 'online' } }),
  );
  await page.goto(`/coordinate/${gameId}`);
  await expect(page.getByTestId('text-lobby-code')).toHaveText('ABC234');
  return view;
}

test('lobby removal requires confirmation, refreshes the roster and keeps organiser details folded', async ({
  page,
}) => {
  const view = await lobby(page);
  let removals = 0;
  const target = view.seats[0]!;
  await page.route('**/api/games/public-share-room/commands', async (route) => {
    const command = route.request().postDataJSON();
    expect(command.type).toBe('MarkDeparted');
    expect(command.seatId).toBe(target.id);
    removals++;
    view.seats = view.seats.map((seat) =>
      seat.id === target.id ? { ...seat, status: 'departed' as const } : seat,
    );
    view.version++;
    return route.fulfill({
      json: { view, version: view.version, serverNow: Date.now() },
    });
  });
  await expect(
    page.getByTestId('coordinator-console').locator('details'),
  ).toHaveCount(3);
  await expect(
    page.getByTestId('coordinator-console').locator('details[open]'),
  ).toHaveCount(0);
  await page.getByTestId(`button-remove-lobby-${target.id}`).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toContainText(
    `Remove ${target.name} from the lobby?`,
  );
  expect(removals).toBe(0);
  await confirmation
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(confirmation).toHaveCount(0);
  expect(removals).toBe(0);
  await page.getByTestId(`button-remove-lobby-${target.id}`).click();
  await page.getByTestId('button-confirm-remove-lobby').click();
  await expect(
    page.getByTestId(`coordinator-seat-row-${target.id}`),
  ).toHaveCount(0);
  expect(removals).toBe(1);
  await expect(page.getByTestId('coordinator-presenter')).not.toHaveAttribute(
    'open',
  );
  await page.getByTestId('coordinator-presenter').locator('summary').click();
  await expect(
    page.getByTestId('button-create-presenter-pairing'),
  ).toBeVisible();
});

test('a failed background delegate load does not claim an unsaved action', async ({
  page,
}) => {
  const failedLoad = page.waitForResponse(
    (response) =>
      response.url().endsWith('/coordinator/delegates') &&
      response.status() === 503,
  );
  await lobby(page, 'load');
  await failedLoad;
  await page.getByTestId('coordinator-delegates').locator('summary').click();
  await expect(
    page.getByText(
      'Co-coordinators could not be saved. Check the connection and try again.',
      { exact: true },
    ),
  ).toHaveCount(0);
});

test('a failed organiser save still shows its action error', async ({
  page,
}) => {
  await lobby(page, 'save');
  const delegates = page.getByTestId('coordinator-delegates');
  await delegates.locator('summary').click();
  await delegates.getByRole('checkbox').first().check();
  await delegates.getByRole('button').click();
  await expect(delegates.getByRole('alert')).toHaveText(
    'Co-coordinators could not be saved. Check the connection and try again.',
  );
});

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
  const qr = page.getByTestId('img-lobby-qr');
  await expect(qr.locator('svg path').first()).toHaveCSS('stroke', 'none');
  const qrFits = await qr.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const svg = element.querySelector('svg')!.getBoundingClientRect();
    return (
      svg.left >= box.left &&
      svg.right <= box.right &&
      svg.top >= box.top &&
      svg.bottom <= box.bottom
    );
  });
  expect(qrFits).toBe(true);
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
  // Share sends the same Lobby code link as the QR (owner, 27 October 2026).
  await expect
    .poll(() => shared[0])
    .toBe('https://public.example/game/join#code=ABC234');
});

// Owner phone test (27 October 2026): reloading the organiser's Lobby made a
// new invitation, so a link already shared stopped working. Share and QR now
// carry the one Lobby code, which the server keeps for the whole Lobby.
test('after a Lobby reload, Share and QR still carry the same code link', async ({
  page,
}) => {
  await shareConfiguration(page, 'https://public.example/game/');
  await lobby(page);
  await page.reload();
  await expect(page.getByTestId('text-lobby-code')).toHaveText('ABC234');
  const qrUrl = await page
    .getByTestId('lobby-join-qr')
    .getAttribute('data-join-url');
  expect(qrUrl).toBe('https://public.example/game/join#code=ABC234');
  const shared: string[] = [];
  await page.exposeFunction('recordReloadShareUrl', (url: string) =>
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
              recordReloadShareUrl: (url: string) => Promise<void>;
            }
          ).recordReloadShareUrl(url),
      },
    });
  });
  await page.getByTestId('button-share-game').click();
  await expect.poll(() => shared[0]).toBe(qrUrl);
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
