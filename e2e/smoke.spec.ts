import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PRE_LAUNCH_NOINDEX } from '../lib/security/src/deployment';

test('home and play are accessible, reloadable and responsive', async ({
  page,
}) => {
  const homeResponse = await page.goto('/');
  expect(homeResponse?.headers()['x-robots-tag']).toBe(
    PRE_LAUNCH_NOINDEX ? 'noindex, nofollow' : undefined,
  );
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText(
    'A Stackstone game',
  );
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const firstFaqQuestion = page.locator('.public-home-faq summary').first();
  await expect(firstFaqQuestion).toHaveCSS('min-height', '52px');
  await expect
    .poll(async () => (await firstFaqQuestion.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(44);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole('link', { name: 'Start a new game' }).click();
  await expect(page).toHaveURL(/\/play\?entry=create$/);
  await expect(
    page.getByRole('heading', { name: 'Name your game' }),
  ).toBeVisible();
  const playResponse = await page.reload();
  expect(playResponse?.headers()['x-robots-tag']).toBe(
    PRE_LAUNCH_NOINDEX ? 'noindex, nofollow' : undefined,
  );
  await expect(page.getByRole('main')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Name your game' }),
  ).toBeVisible();
  await page.mouse.move(0, 0);
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 320, height: 700 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto('/');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('private role is requested only during a hold and is removed on release', async ({
  page,
}) => {
  let privateRequests = 0;
  const gameId = 'rehearsal-id';
  const publicView = {
    id: gameId,
    version: 3,
    phase: 'DEAL',
    paused: false,
    deadline: null,
    coordinatorPlays: true,
    cycle: 0,
    pot: 0,
    unit: 'points',
    seats: [{ id: 'human-seat', name: 'Morgan', status: 'alive' }],
    commitment: null,
    progress: { done: 0, total: 5 },
    ballots: {},
    winner: null,
    private: null,
    publicLog: [],
    coordinatorAlerts: [],
    fairness: null,
  };

  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'Set-Cookie': 'turnstone-csrf=test-csrf; Path=/; SameSite=Strict',
      },
      json: { csrfToken: 'test-csrf' },
    }),
  );
  await page.route(`**/api/games/${gameId}/commands`, async (route) => {
    expect(route.request().method()).toBe('POST');
    await route.fulfill({
      status: 200,
      json: { version: 4, view: publicView },
    });
  });
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({ status: 200, json: { version: 3, view: publicView } }),
  );
  await page.route(`**/api/games/${gameId}/private-view`, async (route) => {
    privateRequests += 1;
    await route.fulfill({
      status: 200,
      json: {
        version: 3,
        view: { ...publicView, private: { role: 'faithful' } },
      },
    });
  });

  await page.goto(`/game/${gameId}`);
  const shieldDialog = page.getByRole('dialog', { name: 'Shield your screen' });
  const shieldConfirmation = shieldDialog.getByRole('button', {
    name: /i’m shielded/i,
  });
  await expect(shieldConfirmation).toBeVisible();
  await expect(shieldDialog).toBeVisible();
  await expect(shieldConfirmation).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText('Faithful', { exact: true })).toHaveCount(0);
  expect(privateRequests).toBe(0);
  await expect(shieldConfirmation).toHaveAttribute('aria-disabled', 'false', {
    timeout: 6500,
  });
  await shieldConfirmation.click();

  const holdPad = page.getByRole('button', { name: /hold to reveal/i });
  await expect(holdPad).toBeVisible();
  await expect(page.getByText('Faithful', { exact: true })).toHaveCount(0);
  expect(privateRequests).toBe(0);

  const box = await holdPad.boundingBox();
  if (!box) throw new Error('Hold pad has no visible bounds');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => privateRequests).toBe(1);
  await expect(page.getByText('Faithful', { exact: true })).toHaveCount(0);
  await page.waitForTimeout(550);
  await expect(page.getByText('Faithful', { exact: true })).toBeVisible();
  await page.mouse.up();
  await expect(page.getByText('Faithful', { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      local: JSON.stringify(localStorage),
      session: JSON.stringify(sessionStorage),
    })),
  ).toEqual({
    title: 'Turnstone',
    url: expect.stringContaining(`/game/${gameId}`),
    local: '{}',
    session: '{}',
  });
});
