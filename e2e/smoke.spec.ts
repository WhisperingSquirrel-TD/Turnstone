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
  const homeCopy = (await page.getByRole('main').innerText()).toLowerCase();
  expect(homeCopy).not.toContain('vote at the round table');
  expect(homeCopy.match(/vote together/g) ?? []).toHaveLength(1);
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
  await page.goto('/faq');
  await expect(
    page.getByRole('heading', { name: 'Frequently asked questions' }),
  ).toBeVisible();
  await page.locator('.public-home-faq details summary').first().click();
  const faqCopy = (await page.getByRole('main').innerText()).toLowerCase();
  expect(faqCopy).not.toContain('vote at the round table');
  expect(faqCopy).toContain('vote together');
  await page.goto('/');
  await page.getByRole('link', { name: 'Start a new game' }).click();
  await expect(page).toHaveURL(/\/play\?entry=create$/);
  await expect(
    page.getByRole('heading', { name: 'Name your game' }),
  ).toBeVisible();
  const createNameScreen = page.locator('.entry-screen-create-name');
  const gameName = page.getByTestId('input-game-name');
  const continueCreateName = page.getByTestId('button-continue-create-name');
  const candleColor = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--candle)';
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await expect(createNameScreen).toHaveCSS('opacity', '1');
  await expect(page.getByRole('heading', { name: 'Name your game' })).toHaveCSS(
    'color',
    candleColor,
  );
  await expect(gameName).toBeEnabled();
  const gameNameCursor = await gameName.evaluate(
    (input) => getComputedStyle(input).cursor,
  );
  expect(gameNameCursor).not.toBe('not-allowed');
  await expect(gameName).toHaveCSS('color', candleColor);
  await expect(continueCreateName).toBeEnabled();
  await expect(continueCreateName).toHaveCSS('cursor', 'pointer');
  await expect(continueCreateName).toHaveCSS('opacity', '1');
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
  const readinessAcknowledgements: boolean[] = [];
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
    revote: false,
    shadowRound: 0,
    shadowSlot: 0,
    murderSlots: 1,
    endRule: 'unanimous',
    missionsEnabled: false,
    rehearsal: false,
    pot: 0,
    unit: 'points',
    seats: [{ id: 'human-seat', name: 'Morgan', status: 'alive' }],
    commitment: null,
    progress: { done: 0, total: 5 },
    actionStatus: { waiting: 5, total: 5 },
    votedSeatIds: [],
    ballots: {},
    voteCandidates: [],
    winner: null,
    publicAnnouncement: null,
    private: null,
    publicLog: [],
    coordinatorUndo: null,
    coordinatorAlerts: [],
    fairness: null,
  };

  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'Set-Cookie': 'oathstone-csrf=test-csrf; Path=/; SameSite=Strict',
      },
      json: { csrfToken: 'test-csrf' },
    }),
  );
  await page.route(`**/api/games/${gameId}/commands`, async (route) => {
    expect(route.request().method()).toBe('POST');
    const data = route.request().postDataJSON();
    if (data.type === 'AcknowledgePrivate') {
      readinessAcknowledgements.push(data.ready === true);
      if (data.ready === true) {
        publicView.progress.done = 1;
        publicView.actionStatus.waiting = 4;
      }
    }
    await route.fulfill({
      status: 200,
      json: { serverNow: Date.now(), version: 4, view: publicView },
    });
  });
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      status: 200,
      json: { serverNow: Date.now(), version: 3, view: publicView },
    }),
  );
  await page.route(`**/api/games/${gameId}/private-view`, async (route) => {
    privateRequests += 1;
    await route.fulfill({
      status: 200,
      json: {
        serverNow: Date.now(),
        version: 3,
        view: {
          ...publicView,
          private: {
            role: 'faithful',
            team: [],
            options: [],
            choices: {},
            choiceSlots: [],
            chat: [],
            task: null,
            minimumDurationMs: 0,
          },
        },
      },
    });
  });

  await page.clock.install();
  await page.goto(`/game/${gameId}`);
  const shieldDialog = page.getByRole('dialog', { name: 'Shield your screen' });
  const shieldButton = shieldDialog.getByRole('button');
  await expect(shieldButton).toBeVisible();
  await expect(
    shieldDialog.getByText('Oathstone', { exact: true }),
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
  await expect(page.getByTestId('phase-progress-status')).toHaveText(
    '0 of 5 are ready',
  );

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
  expect(readinessAcknowledgements).toEqual([false]);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect.poll(() => readinessAcknowledgements).toEqual([false, true]);
  await expect(page.getByTestId('phase-progress-status')).toHaveText(
    '1 of 5 are ready',
  );
  expect(
    await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      local: JSON.stringify(localStorage),
      session: JSON.stringify(sessionStorage),
    })),
  ).toEqual({
    title: 'Oathstone',
    url: expect.stringContaining(`/game/${gameId}`),
    local: '{}',
    session: '{}',
  });
});

test('notes show one privacy line without nested scrolling or excess top space', async ({
  page,
}) => {
  let privateRequests = 0;
  const gameId = 'notes-screen-baseline';
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: undefined,
    });
  });
  const publicView: FullView = {
    id: gameId,
    viewerSeatId: 'human-seat',
    canAdvancePhase: false,
    version: 1,
    phase: 'DEBATE',
    paused: false,
    deadline: null,
    coordinatorPlays: true,
    cycle: 1,
    revote: false,
    shadowRound: 0,
    shadowSlot: 0,
    murderSlots: 1,
    endRule: 'unanimous',
    missionsEnabled: false,
    rehearsal: false,
    pot: 0,
    unit: 'points',
    seats: [{ id: 'human-seat', name: 'Morgan', status: 'alive' }],
    commitment: null,
    progress: { done: 0, total: 1 },
    actionStatus: { waiting: 0, total: 1 },
    votedSeatIds: [],
    voteCandidates: [],
    ballots: {},
    winner: null,
    publicAnnouncement: null,
    private: null,
    publicLog: [],
    coordinatorUndo: null,
    coordinatorAlerts: [],
    fairness: null,
  };

  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'Set-Cookie': 'oathstone-csrf=test-csrf; Path=/; SameSite=Strict',
      },
      json: { csrfToken: 'test-csrf' },
    }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      status: 200,
      json: { serverNow: Date.now(), version: 1, view: publicView },
    }),
  );
  await page.route(`**/api/games/${gameId}/private-view`, async (route) => {
    privateRequests += 1;
    await route.fulfill({
      status: 200,
      json: {
        serverNow: Date.now(),
        version: 1,
        view: {
          ...publicView,
          private: {
            role: 'faithful',
            team: [],
            options: [],
            choices: {},
            choiceSlots: [],
            chat: [],
            task: null,
            minimumDurationMs: 0,
          },
        },
      },
    });
  });

  await page.setViewportSize({ width: 320, height: 568 });
  await page.clock.install();
  await page.goto(`/game/${gameId}`);
  await expect(
    page.getByText(
      'Your screen may lock during play. Tap it to keep the game visible.',
    ),
  ).toBeVisible();
  await page.getByTestId('button-open-notes').click();

  await expect(
    page.getByRole('dialog', { name: 'Shield your screen' }),
  ).toHaveCount(0);
  await expect(page.getByTestId('private-notes-content')).toBeVisible({
    timeout: 1500,
  });
  await expect(page.getByLabel('Write a note')).toBeVisible();
  await expect(
    page.getByText('Only you can see your notes.', { exact: true }),
  ).toHaveCount(1);
  const notesBounds = await page
    .getByTestId('private-notes-content')
    .getByRole('heading')
    .boundingBox();
  const panelBounds = await page.locator('.private-moment-panel').boundingBox();
  if (!notesBounds || !panelBounds) {
    throw new Error('Notes heading or private panel has no visible bounds');
  }
  expect(
    notesBounds.y - panelBounds.y,
    'notes should start near the top of the private panel',
  ).toBeLessThanOrEqual(40);
  const nestedScrollAreas = await page
    .getByTestId('private-notes-content')
    .evaluate((root) => {
      const nodes = [root, ...Array.from(root.querySelectorAll('*'))].filter(
        (node) => !(node instanceof HTMLTextAreaElement),
      );
      return nodes.filter((node) => {
        const style = getComputedStyle(node);
        const scrollableOverflow = ['auto', 'scroll'].includes(style.overflowY);
        return scrollableOverflow && node.scrollHeight > node.clientHeight + 1;
      }).length;
    });
  expect(nestedScrollAreas).toBe(0);
  expect(privateRequests).toBe(1);
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
    revote: false,
    shadowRound: 0,
    shadowSlot: 0,
    murderSlots: 1,
    endRule: 'unanimous',
    missionsEnabled: false,
    rehearsal: false,
    pot: 0,
    unit: 'points',
    seats: [{ id: 'human-seat', name: 'Morgan', status: 'alive' }],
    commitment: null,
    progress: { done: 0, total: 5 },
    actionStatus: { waiting: 5, total: 5 },
    votedSeatIds: [],
    ballots: {},
    voteCandidates: [],
    winner: null,
    publicAnnouncement: null,
    private: null,
    publicLog: [],
    coordinatorUndo: null,
    coordinatorAlerts: [],
    fairness: null,
  };

  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'Set-Cookie': 'oathstone-csrf=test-csrf; Path=/; SameSite=Strict',
      },
      json: { csrfToken: 'test-csrf' },
    }),
  );
  await page.route(`**/api/games/${gameId}/commands`, (route) =>
    route.fulfill({
      status: 200,
      json: { serverNow: Date.now(), version: 4, view: publicView },
    }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      status: 200,
      json: { serverNow: Date.now(), version: 3, view: publicView },
    }),
  );
  await page.route(`**/api/games/${gameId}/private-view`, (route) => {
    privateRequests += 1;
    return route.fulfill({
      status: 200,
      json: {
        serverNow: Date.now(),
        version: 3,
        view: {
          ...publicView,
          private: {
            role: 'faithful',
            team: [],
            options: [],
            choices: {},
            choiceSlots: [],
            chat: [],
            task: null,
            minimumDurationMs: 0,
          },
        },
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
    await expect(shieldFooter).toHaveCount(0);
    await expect(shieldConfirmation).toBeVisible();
    const shieldConfirmationBounds = await shieldConfirmation.boundingBox();
    if (!shieldConfirmationBounds)
      throw new Error('The shield confirmation action has no bounds.');
    expect(
      shieldConfirmationBounds.y + shieldConfirmationBounds.height,
    ).toBeLessThanOrEqual(viewport.height);
    const brand = shieldDialog.getByTestId('text-entry-brand');
    const brandVisual = await brand.evaluate((element) => ({
      fontFamily: getComputedStyle(element).fontFamily,
      fontSize: getComputedStyle(element).fontSize,
      parts: Array.from(element.querySelectorAll('span')).map((part) => ({
        text: part.textContent,
        color: getComputedStyle(part).color,
      })),
    }));
    expect(brandVisual.fontFamily).toContain('Playfair Display');
    expect(brandVisual.parts).toEqual([
      { text: 'Oath', color: 'rgb(61, 58, 56)' },
      { text: 'stone', color: 'color(srgb 0.391765 0.312745 0.206078)' },
    ]);
    const shellBrandVisual = await page
      .locator('header.public-shell-header .oathstone-wordmark')
      .evaluate((element) => ({
        fontFamily: getComputedStyle(element).fontFamily,
        fontSize: getComputedStyle(element).fontSize,
      }));
    expect(brandVisual.fontFamily).toBe(shellBrandVisual.fontFamily);
    expect(brandVisual.fontSize).toBe(shellBrandVisual.fontSize);
    const [shieldBrandBounds, shellBrandBounds] = await Promise.all([
      brand.boundingBox(),
      page
        .locator('header.public-shell-header .oathstone-wordmark')
        .boundingBox(),
    ]);
    if (!shieldBrandBounds || !shellBrandBounds) {
      throw new Error('The shield or shell wordmark has no visible bounds.');
    }
    expect(
      shieldBrandBounds.x,
      JSON.stringify({ shieldBrandBounds, shellBrandBounds }),
    ).toBe(shellBrandBounds.x);
    expect(shieldBrandBounds.y).toBe(shellBrandBounds.y);
    expect(shieldBrandBounds.height).toBe(shellBrandBounds.height);
    await shieldConfirmation.click();

    const progress = page.getByTestId('phase-progress-status');
    await expect(progress).toHaveText('0 of 5 are ready');
    const seal = page.getByTestId('button-hold-reveal');
    const sealBounds = await seal.boundingBox();
    expect(
      await page
        .locator('.game-shell-main')
        .evaluate((element) => getComputedStyle(element).overflowY),
    ).toBe('visible');
    const roleHeading = await page
      .getByRole('heading', { name: 'Your role', exact: true })
      .boundingBox();
    const headerBounds = await page
      .locator('.player-shell-header')
      .boundingBox();
    await expect(page.getByTestId('brand-footer-shell')).toHaveCount(0);
    expect(roleHeading!.y).toBeGreaterThanOrEqual(
      headerBounds!.y + headerBounds!.height,
    );
    if (!sealBounds) throw new Error('Hold seal has no visible bounds');
    const progressBounds = await progress.boundingBox();
    if (!progressBounds)
      throw new Error('Phase progress has no visible bounds');
    expect(progressBounds.y + progressBounds.height).toBeLessThanOrEqual(
      sealBounds.y,
    );
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

    const roleLabel = page.getByRole('heading', {
      name: 'Your role',
      exact: true,
    });
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
    const progressAfterReveal = await progress.boundingBox();
    expect(progressAfterReveal).not.toBeNull();
    expect(
      progressAfterReveal!.y + progressAfterReveal!.height,
    ).toBeLessThanOrEqual(labelBounds!.y);
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

test('game wordmark stays top-left and active-play actions stay unobstructed', async ({
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
    revote: false,
    shadowRound: 0,
    shadowSlot: 0,
    murderSlots: 1,
    endRule: 'unanimous',
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
    actionStatus: { waiting: 0, total: 12 },
    votedSeatIds: [],
    voteCandidates: [],
    ballots: {},
    winner: null,
    publicAnnouncement: null,
    private: null,
    publicLog: [],
    coordinatorUndo: null,
    coordinatorAlerts: [],
    fairness: null,
  };
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'Set-Cookie': 'oathstone-csrf=test-csrf; Path=/; SameSite=Strict',
      },
      json: { csrfToken: 'test-csrf' },
    }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      status: 200,
      json: { serverNow: Date.now(), version: view.version, view },
    }),
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
        .locator('header.public-shell-header .oathstone-wordmark')
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
  expect(
    guideWordmarkBounds.y,
    JSON.stringify({ guideWordmarkBounds, shellWordmarkBounds }),
  ).toBe(shellWordmarkBounds.y);
  await expect(guide).toHaveAccessibleName('The conversation');
  await expect(guide).toContainText(
    'Share what you have noticed before the vote.',
  );
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
  await expect(guide).toHaveCount(0);

  const actionBar = page.getByTestId('rehearsal-action-bar');
  const footer = page.getByTestId('brand-footer-shell');
  const wordmark = page.locator(
    'header.public-shell-header .oathstone-wordmark',
  );
  await expect(actionBar).toBeVisible();
  await expect(footer).toHaveCount(0);
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
  expect(scrollMetrics.mainScrollHeight).toBe(scrollMetrics.mainHeight);
  expect(scrollMetrics.mainOverflowY).toBe('visible');
  expect(scrollMetrics.documentHeight).toBeGreaterThan(
    scrollMetrics.viewportHeight,
  );
  await page.evaluate(() => window.scrollTo(0, 300));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  const [actionBounds, actionButtonBounds, wordmarkBounds] = await Promise.all([
    actionBar.boundingBox(),
    actionBar.getByRole('button').first().boundingBox(),
    wordmark.boundingBox(),
  ]);
  if (!actionBounds || !actionButtonBounds || !wordmarkBounds) {
    throw new Error(
      'The rehearsal action, action bar or Oathstone wordmark has no bounds.',
    );
  }
  expect(wordmarkBounds.x).toBeLessThanOrEqual(24);
  expect(wordmarkBounds.y).toBeLessThanOrEqual(40);
  expect(actionBounds.y + actionBounds.height).toBeCloseTo(
    scrollMetrics.viewportHeight,
    0,
  );
  expect(actionButtonBounds.y + actionButtonBounds.height).toBeLessThanOrEqual(
    scrollMetrics.viewportHeight,
  );
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const [notesBounds, scrolledActionBounds] = await Promise.all([
    page.getByTestId('button-open-notes').boundingBox(),
    actionBar.boundingBox(),
  ]);
  if (!notesBounds || !scrolledActionBounds)
    throw new Error('The scrolled notes button or action bar has no bounds.');
  expect(notesBounds.y + notesBounds.height).toBeLessThanOrEqual(
    scrolledActionBounds.y,
  );
  expect(scrolledActionBounds.y + scrolledActionBounds.height).toBeCloseTo(
    scrollMetrics.viewportHeight,
    0,
  );
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.setViewportSize({ width: 1024, height: 768 });
  const [
    desktopActionBounds,
    desktopActionButtonBounds,
    desktopWordmarkBounds,
  ] = await Promise.all([
    actionBar.boundingBox(),
    actionBar.getByRole('button').first().boundingBox(),
    wordmark.boundingBox(),
  ]);
  if (
    !desktopActionBounds ||
    !desktopActionButtonBounds ||
    !desktopWordmarkBounds
  ) {
    throw new Error('The desktop game header or action has no bounds.');
  }
  const desktopContentBounds = await page
    .getByTestId('player-game')
    .boundingBox();
  expect(desktopWordmarkBounds.x).toBe(desktopContentBounds!.x);
  expect(desktopWordmarkBounds.y).toBeLessThanOrEqual(40);
  expect(desktopActionBounds.y + desktopActionBounds.height).toBeCloseTo(
    768,
    0,
  );
  expect(
    desktopActionButtonBounds.y + desktopActionButtonBounds.height,
  ).toBeLessThanOrEqual(768);

  await page.setViewportSize({ width: 1440, height: 900 });
  const [wideWordmarkBounds] = await Promise.all([wordmark.boundingBox()]);
  if (!wideWordmarkBounds) {
    throw new Error('The wide-screen game wordmark has no bounds.');
  }
  const wideContentBounds = await page.getByTestId('player-game').boundingBox();
  expect(wideWordmarkBounds.x).toBe(wideContentBounds!.x);

  view.rehearsal = false;
  await page.reload();
  await page.getByRole('button', { name: 'Move everyone on' }).click();
  const confirmation = page.getByRole('dialog');
  const confirmationCard = confirmation.locator(':scope > div').first();
  const confirmationFooter = page.getByTestId('brand-footer-confirmation');
  const confirmationWordmark = confirmation.getByTestId('text-entry-brand');
  await expect(confirmation).toBeVisible();
  await expect(confirmationFooter).toHaveCount(0);
  await expect(confirmationWordmark).toBeVisible();
  const [cardBounds, confirmButtonBounds, confirmationWordmarkBounds] =
    await Promise.all([
      confirmationCard.boundingBox(),
      confirmation.getByRole('button').first().boundingBox(),
      confirmationWordmark.boundingBox(),
    ]);
  if (!cardBounds || !confirmButtonBounds || !confirmationWordmarkBounds) {
    throw new Error(
      'The organiser confirmation, header or action has no bounds.',
    );
  }
  expect(confirmationWordmarkBounds.x).toBe(wideWordmarkBounds.x);
  expect(confirmationWordmarkBounds.y).toBe(wideWordmarkBounds.y);
  expect(cardBounds.y + cardBounds.height).toBeLessThanOrEqual(900);
  expect(
    confirmButtonBounds.y + confirmButtonBounds.height,
  ).toBeLessThanOrEqual(900);

  await page.goto('/');
  const publicFooterBounds = await page
    .getByTestId('brand-footer-static')
    .boundingBox();
  if (!publicFooterBounds) {
    throw new Error('The public-site footer has no bounds.');
  }
  expect(publicFooterBounds.x).toBeGreaterThanOrEqual(0);
  expect(publicFooterBounds.width).toBeGreaterThan(0);
  expect(publicFooterBounds.x + publicFooterBounds.width).toBeLessThanOrEqual(
    1440,
  );
});
