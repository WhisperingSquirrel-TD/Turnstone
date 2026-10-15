import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { FullView } from '../lib/shared/src/contracts';
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
  const publicView: FullView = {
    id: gameId,
    viewerSeatId: 'human-seat',
    canAdvancePhase: false,
    version: 3,
    phase: 'DEAL',
    paused: false,
    deadline: null,
    coordinatorPlays: true,
    cycle: 0,
    shadowRound: 0,
    missionsEnabled: false,
    rehearsal: false,
    pot: 0,
    unit: 'points',
    seats: [{ id: 'human-seat', name: 'Morgan', status: 'alive' }],
    commitment: null,
    progress: { done: 0, total: 5 },
    ballots: {},
    winner: null,
    publicAnnouncement: null,
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

  const holdPad = page.getByRole('button', {
    name: /hold the seal to see your role/i,
  });
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

test('the revealed role stays above the seal and inside small phone viewports', async ({
  page,
}) => {
  const gameId = 'role-viewport-fit';
  let privateRequests = 0;
  const publicView: FullView = {
    id: gameId,
    viewerSeatId: 'human-seat',
    canAdvancePhase: false,
    version: 3,
    phase: 'DEAL',
    paused: false,
    deadline: null,
    coordinatorPlays: true,
    cycle: 0,
    shadowRound: 0,
    missionsEnabled: false,
    rehearsal: false,
    pot: 0,
    unit: 'points',
    seats: [{ id: 'human-seat', name: 'Morgan', status: 'alive' }],
    commitment: null,
    progress: { done: 0, total: 5 },
    ballots: {},
    winner: null,
    publicAnnouncement: null,
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
  await page.route(`**/api/games/${gameId}/commands`, (route) =>
    route.fulfill({
      status: 200,
      json: { version: 4, view: publicView },
    }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({ status: 200, json: { version: 3, view: publicView } }),
  );
  await page.route(`**/api/games/${gameId}/private-view`, (route) => {
    privateRequests += 1;
    return route.fulfill({
      status: 200,
      json: {
        version: 3,
        view: { ...publicView, private: { role: 'faithful' } },
      },
    });
  });

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    privateRequests = 0;
    await page.setViewportSize(viewport);
    await page.goto(`/game/${gameId}`);

    const shieldDialog = page.getByRole('dialog', {
      name: 'Shield your screen',
    });
    const shieldConfirmation = shieldDialog.getByRole('button', {
      name: /i’m shielded/i,
    });
    await expect(shieldConfirmation).toHaveAttribute('aria-disabled', 'false', {
      timeout: 6500,
    });
    await shieldConfirmation.click();

    const seal = page.getByTestId('button-hold-reveal');
    const sealBounds = await seal.boundingBox();
    if (!sealBounds) throw new Error('Hold seal has no visible bounds');
    expect(sealBounds.y).toBeGreaterThanOrEqual(0);
    expect(sealBounds.y + sealBounds.height).toBeLessThanOrEqual(
      viewport.height,
    );
    await page.mouse.move(
      sealBounds.x + sealBounds.width / 2,
      sealBounds.y + sealBounds.height / 2,
    );
    await page.mouse.down();
    await expect.poll(() => privateRequests).toBe(1);

    const roleLabel = page.getByText('Your private role', { exact: true });
    const role = page.getByRole('heading', { name: 'Faithful', exact: true });
    await expect(role).toBeVisible({ timeout: 2000 });
    const [labelBounds, roleBounds, revealedSealBounds] = await Promise.all([
      roleLabel.boundingBox(),
      role.boundingBox(),
      seal.boundingBox(),
    ]);
    expect(labelBounds).not.toBeNull();
    expect(roleBounds).not.toBeNull();
    expect(revealedSealBounds).not.toBeNull();
    for (const bounds of [labelBounds!, roleBounds!]) {
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    }
    expect(roleBounds!.y + roleBounds!.height).toBeLessThan(
      revealedSealBounds!.y,
    );
    const scrollLock = await page.evaluate(() => ({
      root: getComputedStyle(document.documentElement).overflow,
      body: getComputedStyle(document.body).overflow,
    }));
    expect(scrollLock).toEqual({ root: 'hidden', body: 'hidden' });
    await page.evaluate(() => window.scrollTo(0, 400));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.mouse.up();
  }
});
