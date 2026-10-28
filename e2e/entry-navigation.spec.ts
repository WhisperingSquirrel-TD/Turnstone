import { expect, test, type Page } from '@playwright/test';

// Owner phone screenshots (Pixel, Chrome, 390 px, 28 October 2026): Back from
// "What's the game code?" was a small link, the phone's back button left the
// site, the hint under Continue sat under the gesture bar, "0 joined" and a
// clipped dot showed before joining, the code label repeated the heading, and
// "Practise alone" had a border.

async function start(page: Page) {
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'c'.repeat(64) } }),
  );
  await page.goto('/');
  await expect(page.getByTestId('button-create-game')).toBeVisible();
}

async function expectStart(page: Page) {
  const where = await page.evaluate(
    () => `${location.href} (history ${history.length})`,
  );
  await expect(
    page.getByTestId('button-create-game'),
    `start screen at ${where}`,
  ).toBeVisible();
  await expect(page.getByTestId('button-join-game')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
}

async function expectTouchable(page: Page, testId: string) {
  const control = page.getByTestId(testId);
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.height, `${testId} height`).toBeGreaterThanOrEqual(44);
  expect(box!.width, `${testId} width`).toBeGreaterThanOrEqual(44);
  expect(box!.y, `${testId} in view`).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `${testId} in view`).toBeLessThanOrEqual(
    viewport.height,
  );
}

for (const [label, buttonId, readyId] of [
  ['Join', 'button-join-game', 'input-join-name'],
  ['Create', 'button-create-game', 'input-game-name'],
  ['Practise', 'button-practise-alone', 'input-rehearsal-name'],
] as const) {
  test(`${label}: the top Back control returns to the start screen`, async ({
    page,
  }) => {
    await start(page);
    await page.getByTestId(buttonId).click();
    await expect(page.getByTestId(readyId)).toBeVisible();
    await expectTouchable(page, 'button-back-top');
    await page.getByTestId('button-back-top').click();
    await expectStart(page);
  });

  test(`${label}: the phone's back button returns to the start screen`, async ({
    page,
  }) => {
    await start(page);
    await page.getByTestId(buttonId).click();
    await expect(page.getByTestId(readyId)).toBeVisible();
    // The flow must have its own history entry before going back.
    await expect(page).toHaveURL(/\/\?entry=(join|create|rehearsal)$/);
    await page.goBack();
    await expectStart(page);
  });
}

test('Join and Create: the lower Back is a 44 px button that returns to start', async ({
  page,
}) => {
  await start(page);
  await page.getByTestId('button-join-game').click();
  await expect(page.getByTestId('input-join-name')).toBeVisible();
  const back = page.getByTestId('button-back-entry');
  const box = await back.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await expect(back).toHaveCSS('text-decoration-line', 'none');
  await back.click();
  await expectStart(page);
  await page.getByTestId('button-create-game').click();
  await expect(page.getByTestId('input-game-name')).toBeVisible();
  await expect(page.getByTestId('button-back-entry')).toHaveCSS(
    'text-decoration-line',
    'none',
  );
});

test('the join hint under Continue keeps clear of the bottom edge', async ({
  page,
}) => {
  await start(page);
  await page.getByTestId('button-join-game').click();
  const hint = page.getByTestId('entry-primary-hint');
  await expect(hint).toHaveText('Enter your first name and the game code.');
  await page.evaluate(() => {
    document.querySelector('#entry-main')?.scrollTo(0, 1e6);
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  const box = await hint.boundingBox();
  const viewport = page.viewportSize()!;
  // Clear of a phone's gesture bar even where the browser reports no inset.
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height - 16);
});

test('before joining, the join screen shows no player count or status dot', async ({
  page,
}) => {
  await start(page);
  await page.getByTestId('button-join-game').click();
  await expect(page.getByTestId('input-join-name')).toBeVisible();
  const chrome = page.locator('.entry-stage-chrome');
  await expect(chrome.getByTestId('game-status-remaining')).toHaveCount(0);
  await expect(chrome.locator('.game-connection-state')).toHaveCount(0);
  await expect(page.getByText(/\b0 joined\b/)).toHaveCount(0);
});

test('the game code is labelled once and the focused box is marked', async ({
  page,
}) => {
  await start(page);
  await page.getByTestId('button-join-game').click();
  await expect(page.getByTestId('input-join-name')).toBeVisible();
  await expect(
    page.getByText('What’s the game code?', { exact: true }),
  ).toHaveCount(1);
  const first = page.getByTestId('input-join-code-1');
  const second = page.getByTestId('input-join-code-2');
  await first.focus();
  const style = (locator: typeof first) =>
    locator.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        border: computed.borderTopColor,
        outline: computed.outlineStyle,
        caret: computed.caretColor,
      };
    });
  const focused = await style(first);
  const resting = await style(second);
  expect(focused.border).not.toBe(resting.border);
  expect(focused.outline).not.toBe('none');
  expect(focused.caret).not.toBe('transparent');
});

test('the organiser name field says what it is even when scrolled', async ({
  page,
}) => {
  await start(page);
  await page.getByTestId('button-create-game').click();
  await page.getByTestId('button-continue-create-name').click();
  await page.getByTestId('button-continue-player-count').click();
  const field = page.getByTestId('input-organiser-name');
  await expect(field).toHaveAttribute('placeholder', 'First name');
  const label = page.getByText('Your first name', { exact: true });
  await expect(label).toBeVisible();
  expect((await label.boundingBox())!.y).toBeLessThan(
    (await field.boundingBox())!.y,
  );
});

test('"Practise alone" has no border on the start screen', async ({ page }) => {
  await start(page);
  const practise = page.getByTestId('button-practise-alone');
  await expect(practise).toHaveCSS('border-top-style', 'none');
  const box = await practise.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

// Owner decision (28 October 2026): "made by Stackstone Consulting" is always
// the last line of the screen, with any main button docked above it.
for (const [label, buttonId, readyId] of [
  ['start', null, 'button-create-game'],
  ['Join', 'button-join-game', 'input-join-name'],
  ['Create', 'button-create-game', 'input-game-name'],
  ['Practise', 'button-practise-alone', 'input-rehearsal-name'],
] as const) {
  test(`${label}: the credit is the last line of the screen`, async ({
    page,
  }) => {
    await start(page);
    if (buttonId) await page.getByTestId(buttonId).click();
    await expect(page.getByTestId(readyId)).toBeVisible();
    const footer = page.getByTestId('brand-footer-entry');
    const box = (await footer.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThanOrEqual(
      1,
    );
    await expect(footer.getByTestId('report-issue-link')).toHaveCount(0);
    const action = page.locator(
      '[data-testid="entry-action-dock"], .entry-inline-primary',
    );
    if (await action.count()) {
      const actionBox = (await action.first().boundingBox())!;
      expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(box.y + 1);
    }
  });
}
