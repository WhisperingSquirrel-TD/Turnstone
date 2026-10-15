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
    'made by Stackstone Consulting',
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
  await page.goto('/play');
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
    voteCandidates: [],
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

  await page.clock.install();
  await page.goto(`/game/${gameId}`);
  const shieldDialog = page.getByRole('dialog', { name: 'Shield your screen' });
  const shieldButton = shieldDialog.getByRole('button');
  await expect(shieldButton).toBeVisible();
  await expect(
    shieldDialog.getByText('Turnstone', { exact: true }),
  ).toBeVisible();
  await expect(shieldDialog).toBeVisible();
  await expect(shieldButton).toHaveText('Ready in 3');
  await expect(shieldButton).toBeDisabled();
  await expect(shieldDialog.getByText(/Continue in/)).toHaveCount(0);
  await expect(page.getByText('Faithful', { exact: true })).toHaveCount(0);
  expect(privateRequests).toBe(0);
  await page.clock.fastForward(1000);
  await expect(shieldButton).toHaveText('Ready in 2');
  await page.clock.fastForward(1000);
  await expect(shieldButton).toHaveText('Ready in 1');
  await page.clock.fastForward(1000);
  await expect(shieldButton).toHaveText('I’m shielded');
  await expect(shieldButton).toBeEnabled();
  await shieldButton.click();

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

test('entry welcome title and actions stay high in a short desktop viewport', async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.toLowerCase().includes('desktop'),
    'Desktop entry layout check runs once in Chromium',
  );

  const viewport = { width: 1024, height: 696 };
  await page.setViewportSize(viewport);
  await page.goto('/play');
  const title = page.locator('#entry-title');
  const actions = page.locator('.entry-choice-list');
  await expect(title).toBeVisible();
  await expect(actions).toBeVisible();

  const [titleBounds, actionBounds] = await Promise.all([
    title.boundingBox(),
    actions.boundingBox(),
  ]);
  if (!titleBounds || !actionBounds) {
    throw new Error('Entry title or actions have no visible bounds');
  }
  expect(
    titleBounds.y,
    'welcome title should begin in the upper third',
  ).toBeLessThan(viewport.height * 0.35);
  expect(
    actionBounds.y + actionBounds.height,
    'welcome actions should not drift into the bottom quarter',
  ).toBeLessThan(viewport.height * 0.75);
});

test('private role, seal and footer stay inside small phone viewports', async ({
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
    voteCandidates: [],
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
    const shieldFooter = shieldDialog.getByTestId('brand-footer-overlay');
    const shieldConfirmation = shieldDialog.getByRole('button', {
      name: /i’m shielded/i,
    });
    await expect(shieldConfirmation).toHaveAttribute('aria-disabled', 'false', {
      timeout: 6500,
    });
    await expect(shieldFooter).toBeVisible();
    const shieldFooterBounds = await shieldFooter.boundingBox();
    if (!shieldFooterBounds) {
      throw new Error('The shield footer has no visible bounds.');
    }
    expect(
      Math.abs(
        viewport.height - shieldFooterBounds.y - shieldFooterBounds.height,
      ),
    ).toBeLessThanOrEqual(1);
    const brand = shieldDialog.getByTestId('text-entry-brand');
    const brandVisual = await brand.evaluate((element) => ({
      fontFamily: getComputedStyle(element).fontFamily,
      parts: Array.from(element.querySelectorAll('span')).map((part) => ({
        text: part.textContent,
        color: getComputedStyle(part).color,
      })),
    }));
    expect(brandVisual.fontFamily).toContain('Playfair Display');
    expect(brandVisual.parts).toEqual([
      { text: 'Turn', color: 'rgb(250, 250, 245)' },
      { text: 'stone', color: 'rgb(200, 148, 74)' },
    ]);
    await shieldConfirmation.click();

    const seal = page.getByTestId('button-hold-reveal');
    const sealBounds = await seal.boundingBox();
    if (!sealBounds) throw new Error('Hold seal has no visible bounds');
    expect(sealBounds.y).toBeGreaterThanOrEqual(0);
    expect(
      sealBounds.y,
      `hold seal should stay in the upper portion at ${viewport.width}x${viewport.height}`,
    ).toBeLessThan(viewport.height * 0.42);
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

test('game wordmark stays top-left and the action banner stays above the footer', async ({
  page,
}) => {
  const gameId = 'rehearsal-footer-layout';
  const view: FullView = {
    id: gameId,
    viewerSeatId: 'human-seat',
    canAdvancePhase: true,
    version: 1,
    phase: 'DEBATE',
    paused: false,
    deadline: Date.now() + 60_000,
    coordinatorPlays: true,
    cycle: 1,
    shadowRound: 0,
    missionsEnabled: false,
    rehearsal: true,
    pot: 0,
    unit: 'points',
    seats: Array.from({ length: 12 }, (_, index) => ({
      id: index === 0 ? 'human-seat' : `seat-${index}`,
      name: index === 0 ? 'Morgan' : `Practice player ${index}`,
      status: 'alive' as const,
    })),
    commitment: null,
    progress: { done: 0, total: 1 },
    voteCandidates: [],
    ballots: {},
    winner: null,
    publicAnnouncement: null,
    private: null,
    publicLog: [],
    coordinatorAlerts: [],
    fairness: null,
  };
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'Set-Cookie': 'turnstone-csrf=test-csrf; Path=/; SameSite=Strict',
      },
      json: { csrfToken: 'test-csrf' },
    }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({ status: 200, json: { version: view.version, view } }),
  );
  await page.goto(`/game/${gameId}`);
  const guide = page.getByTestId('rehearsal-explainer');
  await expect(guide).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('main#main')
        .evaluate((main) => getComputedStyle(main).overflowY),
    )
    .toBe('hidden');
  const guideFooter = guide.getByTestId('brand-footer-overlay');
  await expect(guideFooter).toBeVisible();
  const [guideFooterBounds, guideWordmarkBounds, shellWordmarkBounds] =
    await Promise.all([
      guideFooter.boundingBox(),
      guide.getByTestId('text-entry-brand').boundingBox(),
      page
        .locator('header.public-shell-header .turnstone-wordmark')
        .boundingBox(),
    ]);
  if (!guideFooterBounds || !guideWordmarkBounds || !shellWordmarkBounds) {
    throw new Error('The rehearsal guide brand elements have no bounds.');
  }
  expect(
    Math.abs(568 - guideFooterBounds.y - guideFooterBounds.height),
  ).toBeLessThanOrEqual(1);
  expect(guideWordmarkBounds.x).toBeLessThanOrEqual(24);
  expect(guideWordmarkBounds.x).toBe(shellWordmarkBounds.x);
  expect(guideWordmarkBounds.y).toBe(shellWordmarkBounds.y);
  await expect(guide).toContainText('Each step explains itself');
  await guide.getByRole('button', { name: 'Got it' }).click();
  await expect(guide).toContainText('Everyone talks it over');
  const guideScrollMetrics = await guide.evaluate((overlay) => ({
    overlayHeight: overlay.clientHeight,
    overlayScrollHeight: overlay.scrollHeight,
    mainOverflowY: getComputedStyle(document.querySelector('main#main')!)
      .overflowY,
  }));
  expect(guideScrollMetrics.overlayScrollHeight).toBeLessThanOrEqual(
    guideScrollMetrics.overlayHeight,
  );
  expect(guideScrollMetrics.mainOverflowY).toBe('hidden');
  await guide.getByRole('button', { name: 'Got it' }).click();

  const actionBar = page.getByTestId('rehearsal-action-bar');
  const footer = page.getByTestId('brand-footer-shell');
  const wordmark = page.locator(
    'header.public-shell-header .turnstone-wordmark',
  );
  await expect(actionBar).toBeVisible();
  await expect(footer).toBeVisible();
  await expect(wordmark).toHaveCount(1);
  const scrollMetrics = await page.evaluate(() => {
    const main = document.querySelector('main#main');
    if (!main) throw new Error('Game main region is missing.');
    return {
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      mainHeight: main.clientHeight,
      mainScrollHeight: main.scrollHeight,
      mainOverflowY: getComputedStyle(main).overflowY,
    };
  });
  expect(scrollMetrics.mainScrollHeight).toBeGreaterThan(
    scrollMetrics.mainHeight,
  );
  expect(scrollMetrics.mainOverflowY).toBe('auto');
  expect(scrollMetrics.documentHeight).toBeLessThanOrEqual(
    scrollMetrics.viewportHeight,
  );
  await page.evaluate(() => window.scrollTo(0, 300));
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const [actionBounds, footerBounds, wordmarkBounds] = await Promise.all([
    actionBar.boundingBox(),
    footer.boundingBox(),
    wordmark.boundingBox(),
  ]);
  if (!actionBounds || !footerBounds || !wordmarkBounds) {
    throw new Error(
      'The rehearsal action bar or Stackstone footer has no bounds.',
    );
  }
  expect(wordmarkBounds.x).toBeLessThanOrEqual(24);
  expect(wordmarkBounds.y).toBeLessThanOrEqual(40);
  expect(actionBounds.y + actionBounds.height).toBeLessThanOrEqual(
    footerBounds.y,
  );
  expect(footerBounds.y + footerBounds.height).toBeLessThanOrEqual(568);
  expect(
    Math.abs(568 - footerBounds.y - footerBounds.height),
  ).toBeLessThanOrEqual(1);
  const mainRegion = page.locator('main#main');
  await mainRegion.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const [notesBounds, scrolledActionBounds, scrolledFooterBounds] =
    await Promise.all([
      page.getByTestId('button-open-notes').boundingBox(),
      actionBar.boundingBox(),
      footer.boundingBox(),
    ]);
  if (!notesBounds || !scrolledActionBounds || !scrolledFooterBounds) {
    throw new Error(
      'The scrolled notes button, action bar or footer has no bounds.',
    );
  }
  expect(notesBounds.y + notesBounds.height).toBeLessThanOrEqual(
    scrolledActionBounds.y,
  );
  expect(
    scrolledActionBounds.y + scrolledActionBounds.height,
  ).toBeLessThanOrEqual(scrolledFooterBounds.y);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.setViewportSize({ width: 1024, height: 768 });
  const [desktopActionBounds, desktopFooterBounds, desktopWordmarkBounds] =
    await Promise.all([
      actionBar.boundingBox(),
      footer.boundingBox(),
      wordmark.boundingBox(),
    ]);
  if (!desktopActionBounds || !desktopFooterBounds || !desktopWordmarkBounds) {
    throw new Error(
      'The desktop game header, action bar or footer has no bounds.',
    );
  }
  expect(desktopWordmarkBounds.x).toBeLessThanOrEqual(24);
  expect(desktopWordmarkBounds.y).toBeLessThanOrEqual(40);
  expect(
    desktopActionBounds.y + desktopActionBounds.height,
  ).toBeLessThanOrEqual(desktopFooterBounds.y);
  expect(
    desktopFooterBounds.y + desktopFooterBounds.height,
  ).toBeLessThanOrEqual(768);
  expect(
    Math.abs(768 - desktopFooterBounds.y - desktopFooterBounds.height),
  ).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 1440, height: 900 });
  const [wideWordmarkBounds, wideFooterBounds] = await Promise.all([
    wordmark.boundingBox(),
    footer.boundingBox(),
  ]);
  if (!wideWordmarkBounds || !wideFooterBounds) {
    throw new Error('The wide-screen game wordmark or footer has no bounds.');
  }
  expect(wideWordmarkBounds.x).toBeLessThanOrEqual(24);

  view.rehearsal = false;
  await page.reload();
  await page.getByRole('button', { name: 'Move everyone on' }).click();
  const confirmation = page.getByRole('dialog');
  const confirmationCard = confirmation.locator(':scope > div').first();
  const confirmationFooter = page.getByTestId('brand-footer-confirmation');
  const confirmationWordmark = confirmation.getByTestId('text-entry-brand');
  await expect(confirmation).toBeVisible();
  await expect(confirmationFooter).toBeVisible();
  await expect(confirmationWordmark).toBeVisible();
  const [cardBounds, confirmationFooterBounds, confirmationWordmarkBounds] =
    await Promise.all([
      confirmationCard.boundingBox(),
      confirmationFooter.boundingBox(),
      confirmationWordmark.boundingBox(),
    ]);
  if (!cardBounds || !confirmationFooterBounds || !confirmationWordmarkBounds) {
    throw new Error(
      'The organiser confirmation, header or footer has no bounds.',
    );
  }
  expect(confirmationWordmarkBounds.x).toBe(desktopWordmarkBounds.x);
  expect(confirmationWordmarkBounds.y).toBe(desktopWordmarkBounds.y);
  expect(
    Math.abs(confirmationFooterBounds.width - wideFooterBounds.width),
  ).toBeLessThanOrEqual(1);
  expect(cardBounds.y + cardBounds.height).toBeLessThanOrEqual(
    confirmationFooterBounds.y,
  );
  expect(
    confirmationFooterBounds.y + confirmationFooterBounds.height,
  ).toBeLessThanOrEqual(900);
  expect(
    Math.abs(
      900 - confirmationFooterBounds.y - confirmationFooterBounds.height,
    ),
  ).toBeLessThanOrEqual(1);

  await page.goto('/');
  const publicFooterBounds = await page
    .getByTestId('brand-footer-static')
    .boundingBox();
  if (!publicFooterBounds) {
    throw new Error('The public-site footer has no bounds.');
  }
  expect(
    Math.abs(wideFooterBounds.x - publicFooterBounds.x),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(wideFooterBounds.width - publicFooterBounds.width),
  ).toBeLessThanOrEqual(1);
});
