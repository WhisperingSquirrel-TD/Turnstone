import { devices, expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { cookieNameForGame } from '../artifacts/api-server/src/session-auth';
import {
  fullViewSchema,
  gameViewResponseSchema,
  type FullView,
} from '../lib/shared/src/contracts';
import { pendingJoinRequestsResponseSchema } from '../lib/shared/src/contracts';
import {
  coldSeatGameId,
  coldSeatToken,
  createPublicView,
} from './support/public-view';

async function browserStorageText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const storageEntries = (storage: Storage) =>
      Array.from({ length: storage.length }, (_, index) => {
        const key = storage.key(index);
        return `${key ?? ''}=${key === null ? '' : (storage.getItem(key) ?? '')}`;
      });
    return [
      ...storageEntries(window.localStorage),
      ...storageEntries(window.sessionStorage),
    ].join('\n');
  });
}

async function installLiveSocketViewFixture(
  page: Page,
  getView: () => { serverNow: number; version: number; view: FullView },
): Promise<void> {
  let sequence = 0;
  const pendingPolls = new Map<string, (packet: string) => void>();
  const queuedPackets = new Map<string, string[]>();
  const replyToPoll = (sid: string, packet: string) => {
    const waiting = pendingPolls.get(sid);
    if (waiting) {
      pendingPolls.delete(sid);
      waiting(packet);
      return;
    }
    queuedPackets.set(sid, [...(queuedPackets.get(sid) ?? []), packet]);
  };

  page.on('close', () => {
    for (const resolve of pendingPolls.values()) resolve('6');
    pendingPolls.clear();
  });

  await page.route('**/socket.io**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const sid = url.searchParams.get('sid');
    if (request.method() === 'GET' && !sid) {
      for (const resolve of pendingPolls.values()) resolve('6');
      pendingPolls.clear();
      const nextSid = `round-7-live-${++sequence}`;
      queuedPackets.set(nextSid, []);
      await route.fulfill({
        contentType: 'text/plain; charset=UTF-8',
        body: `0${JSON.stringify({
          sid: nextSid,
          upgrades: [],
          pingInterval: 600_000,
          pingTimeout: 60_000,
          maxPayload: 1_000_000,
        })}`,
      });
      return;
    }
    if (!sid) {
      await route.fulfill({ status: 400, body: 'Missing session.' });
      return;
    }
    if (request.method() === 'GET') {
      const packet = queuedPackets.get(sid)?.shift();
      if (packet) {
        await route.fulfill({
          contentType: 'text/plain; charset=UTF-8',
          body: packet,
        });
        return;
      }
      const nextPacket = await new Promise<string>((resolve) => {
        pendingPolls.set(sid, resolve);
      });
      await route
        .fulfill({
          contentType: 'text/plain; charset=UTF-8',
          body: nextPacket,
        })
        .catch(() => {});
      return;
    }

    const body = (request.postData() ?? '').replace(/^\d+:/, '');
    if (body.startsWith('40')) {
      replyToPoll(sid, `40${JSON.stringify({ sid: `${sid}-namespace` })}`);
    } else if (body.startsWith('42')) {
      const [eventName] = JSON.parse(body.slice(2)) as [string, unknown];
      if (eventName === 'game:watch')
        replyToPoll(sid, `42${JSON.stringify(['game:view', getView()])}`);
    }
    await route.fulfill({
      contentType: 'text/plain; charset=UTF-8',
      body: 'ok',
    });
  });
}

async function expectOnlyCurrentChoiceIdStored(
  page: Page,
  phase: 'VOTE' | 'SHADOW',
  choiceId: string,
) {
  const storage = await page.evaluate(() => {
    const entries = (store: Storage) =>
      Array.from({ length: store.length }, (_, index) => {
        const key = store.key(index);
        return {
          key: key ?? '',
          value: key === null ? '' : (store.getItem(key) ?? ''),
        };
      });
    return {
      local: entries(window.localStorage),
      session: entries(window.sessionStorage),
    };
  });
  const draftPrefix = 'oathstone:choice-draft:';
  const drafts = storage.session.filter(({ key }) =>
    key.startsWith(draftPrefix),
  );
  expect(drafts).toHaveLength(1);
  expect(drafts[0].key).toMatch(
    new RegExp(`^${draftPrefix}[^:]+:[^:]+:${phase}:\\d+:\\d+$`),
  );
  expect(drafts[0].value).toBe(choiceId);

  const otherStorageText = JSON.stringify([
    ...storage.local,
    ...storage.session.filter(({ key }) => !key.startsWith(draftPrefix)),
  ]);
  expect(otherStorageText).not.toContain(choiceId);
  expect(otherStorageText).not.toMatch(
    /Jamie|Faithful|Traitor|PRIVATE_TASK_SENTINEL/i,
  );
}

test('game-clock colours and Always dark keep text accessible in both palettes', async ({
  page,
}) => {
  const gameId = 'theme-clock';
  const view = createPublicView(gameId);
  view.canAdvancePhase = true;
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-csrf' } }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );
  await page.goto(`/game/${gameId}`);
  const shell = page.locator('.game-shell');
  await expect(shell).toHaveAttribute('data-game-theme', 'day');
  const gameMenu = page.getByTestId('game-status-menu');
  await gameMenu.locator('summary').click();
  const alwaysDark = gameMenu.getByRole('checkbox', { name: 'Always dark' });
  await expect(alwaysDark).not.toBeChecked();
  await alwaysDark.check();
  await expect(shell).toHaveAttribute('data-game-theme', 'night');
  expect(
    await page
      .getByTestId('game-status-phase')
      .evaluate((element) => getComputedStyle(element).color),
  ).toBe('rgb(243, 238, 228)');
  await alwaysDark.uncheck();
  await expect(shell).toHaveAttribute('data-game-theme', 'day');
  await gameMenu.locator('summary').click();
  const statusBar = page.getByTestId('game-status-bar');
  await expect(statusBar.getByTestId('game-status-remaining')).toHaveCount(0);
  const connection = statusBar.locator('.game-connection-state');
  await expect(connection).toBeVisible();
  await expect
    .poll(() => connection.getAttribute('aria-label'))
    .toMatch(/^Connection status: (Live|Reconnecting|Offline)$/);
  const connectionName = await connection.getAttribute('aria-label');
  const connectionLabel = connection.locator('.game-connection-label');
  if (connectionName === 'Connection status: Live') {
    await expect(connectionLabel).toHaveClass(
      /game-connection-label--visually-hidden/,
    );
  } else {
    await expect(connectionLabel).toBeVisible();
  }
  for (const width of [320, 360, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const geometry = await statusBar.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const phase = element.querySelector('[data-testid="game-status-phase"]')!;
      const right = element.querySelector('.game-status-right')!;
      const phaseRect = phase.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      const actionRects = Array.from(right.children).map((child) => {
        const childRect = child.getBoundingClientRect();
        return {
          left: childRect.left,
          right: childRect.right,
          top: childRect.top,
          centerY: childRect.top + childRect.height / 2,
          width: childRect.width,
          height: childRect.height,
        };
      });
      return {
        left: rect.left,
        right: rect.right,
        rowWidth: rect.width,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        documentWidth: document.documentElement.scrollWidth,
        phaseRight: phaseRect.right,
        phaseTop: phaseRect.top,
        actionsLeft: rightRect.left,
        actionsTop: rightRect.top,
        actionsCenterY: rightRect.top + rightRect.height / 2,
        actions: actionRects,
        flexWrap: getComputedStyle(element).flexWrap,
      };
    });
    expect(geometry.left, `${width}px left gutter`).toBeGreaterThanOrEqual(16);
    expect(
      width - geometry.right,
      `${width}px right gutter`,
    ).toBeGreaterThanOrEqual(16);
    expect(
      geometry.documentWidth,
      `${width}px document width`,
    ).toBeLessThanOrEqual(width);
    expect(
      geometry.scrollWidth,
      `${width}px status row width ${JSON.stringify(geometry)}`,
    ).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.flexWrap).toBe('nowrap');
    expect(
      Math.abs(geometry.phaseTop + 22 - geometry.actionsCenterY),
    ).toBeLessThanOrEqual(1);
    expect(geometry.actionsLeft - geometry.phaseRight).toBeGreaterThanOrEqual(
      8,
    );
    expect(geometry.actions).toHaveLength(3);
    for (const [index, action] of geometry.actions.entries()) {
      expect(action.centerY, `${width}px item ${index} alignment`).toBeCloseTo(
        geometry.actionsCenterY,
        0,
      );
      if (index > 0) {
        expect(
          action.width,
          `${width}px action ${index} width`,
        ).toBeGreaterThanOrEqual(44);
        expect(
          action.height,
          `${width}px action ${index} height`,
        ).toBeGreaterThanOrEqual(44);
      }
      if (index > 0) {
        expect(
          action.left - geometry.actions[index - 1].right,
          `${width}px gap before action ${index}`,
        ).toBeGreaterThanOrEqual(8);
      }
    }
  }
  const primaryAction = page.getByRole('button', {
    name: 'Move everyone on',
    exact: true,
  });
  for (const theme of ['day', 'night']) {
    await shell.evaluate((element, palette) => {
      (element as HTMLElement).dataset.gameTheme = palette;
    }, theme);
    await expect(primaryAction).toHaveCSS(
      'background-color',
      theme === 'day' ? 'rgb(122, 78, 29)' : 'rgb(227, 179, 95)',
    );
    const transitionProperties = await primaryAction.evaluate((element) =>
      getComputedStyle(element)
        .transitionProperty.split(',')
        .map((property) => property.trim()),
    );
    expect(transitionProperties).not.toContain('background-color');
    const result = await new AxeBuilder({ page })
      .withRules(['color-contrast'])
      .analyze();
    expect(result.violations).toEqual([]);
  }
  for (const phase of ['SHADOW', 'DAWN'] as const) {
    view.phase = phase;
    view.version += 1;
    await page.goto(`/game/${gameId}`);
    await expect(shell).toHaveAttribute(
      'data-game-theme',
      phase === 'SHADOW' ? 'night' : 'day',
    );
  }
});

test('a public player can open Display from Menu without organiser controls', async ({
  page,
}) => {
  const gameId = 'public-display-menu';
  const view = createPublicView(gameId);
  view.canAdvancePhase = false;
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-csrf' } }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );

  await page.goto(`/game/${gameId}`);
  await expect(page.getByTestId('player-game')).toHaveAttribute(
    'data-phase',
    view.phase,
  );
  const menu = page.getByTestId('game-status-menu');
  await expect(menu).toBeVisible();
  await menu.locator('summary').click();
  await expect(menu).toContainText('Display');
  await expect(menu).toContainText('Always dark');
  await expect(menu).not.toContainText('Organiser controls');
});

test('night status card has identical four-row geometry for both roles in both themes', async ({
  page,
}) => {
  await page.clock.install();
  let view = createPublicView('night-theme-uniformity');
  view.phase = 'SHADOW';
  view.shadowSlot = 1;
  let role = 'faithful';
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-csrf' } }),
  );
  const envelope = () => ({
    serverNow: Date.now(),
    version: view.version,
    view,
  });
  await page.route('**/api/games/night-theme-uniformity/view', (route) =>
    route.fulfill({ json: envelope() }),
  );
  await page.route('**/api/games/night-theme-uniformity/commands', (route) =>
    route.fulfill({ json: envelope() }),
  );
  await page.route(
    '**/api/games/night-theme-uniformity/private-view',
    (route) =>
      route.fulfill({
        json: {
          ...envelope(),
          view: {
            ...view,
            private: {
              role,
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
      }),
  );
  const snapshots: Record<string, unknown> = {};
  const shellSnapshots: Record<string, unknown> = {};
  for (role of ['faithful', 'traitor']) {
    view = { ...view, version: view.version + 1 };
    await page.goto('/game/night-theme-uniformity');
    await expect(
      page.getByRole('dialog', { name: 'Shield your screen' }),
    ).toBeVisible();
    await page.clock.fastForward(3_000);
    await page.getByRole('button', { name: 'I’m shielded' }).click();
    const status = page.getByTestId('shadow-status');
    await expect(status).toBeVisible();
    await expect(status.locator('p')).toHaveCount(4);
    const shellStatus = await page
      .getByTestId('game-status-bar')
      .evaluate((el) => ({
        text: el.textContent?.replace(/\s+/g, ' ').trim(),
        childCount: el.children.length,
        phase: el.querySelector('[data-testid="game-status-phase"]')
          ?.textContent,
        remaining: el.querySelector('[data-testid="game-status-remaining"]')
          ?.textContent,
        connection: el
          .querySelector('.game-connection-state')
          ?.getAttribute('aria-label'),
        rightItems: Array.from(
          el.querySelector('.game-status-right')?.children ?? [],
        ).map((child) => ({
          tag: child.tagName,
          testId: child.getAttribute('data-testid'),
          className: child.className,
        })),
      }));
    const happening = await page
      .getByTestId('game-tab-panel')
      .getByTestId('game-happening-card')
      .evaluate((el) => ({
        text: el.textContent?.replace(/\s+/g, ' ').trim(),
        childCount: el.children.length,
      }));
    if (role === 'faithful') {
      shellSnapshots.status = shellStatus;
      shellSnapshots.happening = happening;
    } else {
      expect(shellStatus).toEqual(shellSnapshots.status);
      expect(happening).toEqual(shellSnapshots.happening);
    }
    for (const theme of ['day', 'night']) {
      await page.locator('.game-shell').evaluate((element, palette) => {
        (element as HTMLElement).dataset.gameTheme = palette;
      }, theme);
      const geometry = await status.evaluate((element) => {
        const box = element.getBoundingClientRect(),
          style = getComputedStyle(element);
        return {
          width: Math.round(box.width * 1000) / 1000,
          height: Math.round(box.height * 1000) / 1000,
          color: style.color,
          fontSize: style.fontSize,
          lines: Array.from(element.children).map(
            (line) =>
              Math.round(line.getBoundingClientRect().height * 1000) / 1000,
          ),
        };
      });
      if (role === 'faithful') snapshots[theme] = geometry;
      else expect(geometry).toEqual(snapshots[theme]);
      expect(geometry.height).toBe(112.375);
      expect(geometry.lines).toEqual([24, 24, 24, 24]);
    }
  }
});

test('Round 5 screen matrix keeps headers and the bottom stack clear at every width', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'Pixel',
    'The full geometry matrix runs once; WebKit also runs the dedicated role and header bounds specs.',
  );
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  const gameId = 'r5-screen-matrix';
  let view = createPublicView(gameId);
  let role: 'faithful' | 'traitor' = 'faithful';
  const capture =
    process.env.R5_CAPTURE_SCREENS === '1' ||
    process.env.R7_CAPTURE_SCREENS === '1' ||
    process.env.R7_LIGHTER_CAPTURE_SCREENS === '1' ||
    process.env.R7_IMPROVEMENTS_CAPTURE_SCREENS === '1';
  const captureLighter = process.env.R7_LIGHTER_CAPTURE_SCREENS === '1';
  const captureImprovements =
    process.env.R7_IMPROVEMENTS_CAPTURE_SCREENS === '1';
  const captureRound7 = captureLighter || captureImprovements;
  const directory = captureImprovements
    ? 'docs/screens/round-7-improvements'
    : captureLighter
      ? 'docs/screens/round-7-lighter'
      : process.env.R7_CAPTURE_SCREENS === '1'
        ? 'docs/screens/round-7-stage-1'
        : 'docs/screens/round-5';
  if (capture) await mkdir(directory, { recursive: true });
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-csrf' } }),
  );
  const envelope = () => ({
    serverNow: Date.now(),
    version: view.version,
    view,
  });
  await installLiveSocketViewFixture(page, envelope);
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({ json: envelope() }),
  );
  await page.route(`**/api/games/${gameId}/commands`, async (route) => {
    view = { ...view, version: view.version + 1 };
    await route.fulfill({ json: envelope() });
  });
  await page.route(`**/api/games/${gameId}/join-requests`, (route) =>
    route.fulfill({ json: { requests: [] } }),
  );
  await page.route(`**/api/games/${gameId}/private-view`, (route) =>
    route.fulfill({
      json: {
        ...envelope(),
        view: {
          ...view,
          private: {
            role,
            team: [],
            options: view.seats
              .filter(
                (seat) =>
                  seat.id !== view.viewerSeatId && seat.status === 'alive',
              )
              .map(({ id, name }) => ({ id, name })),
            choices: {},
            choiceSlots: [],
            chat: [],
            task: null,
            minimumDurationMs: 0,
          },
        },
      },
    }),
  );
  const widths = [320, 360, 375, 390, 430, 1280];
  async function snapshot(label: string, held = false) {
    for (const width of widths) {
      const height =
        width === 320
          ? 568
          : width === 360
            ? 740
            : width === 375
              ? 667
              : width === 430
                ? 932
                : width === 1280
                  ? 900
                  : 844;
      await page.setViewportSize({ width, height });
      // Establish the viewport before opening a secret. A live resize correctly
      // covers private content, so each visual scene starts with a fresh load.
      await page.goto(`/game/${gameId}`);
      await expect(page.getByTestId('player-game')).toHaveAttribute(
        'data-phase',
        view.phase,
      );
      await expect(page.getByTestId('game-status-bar')).toBeVisible();
      await expect(page.locator('.game-connection-state')).toHaveAttribute(
        'aria-label',
        'Connection status: Live',
      );
      await expect(
        page.getByTestId('game-tab-panel').getByTestId('game-happening-card'),
      ).toBeVisible();
      await expect(
        page.getByRole('tablist', { name: 'Game views' }),
      ).toBeVisible();
      await expect(page.getByTestId('game-status-phase')).toContainText(
        view.phase === 'LOBBY'
          ? 'Lobby'
          : view.phase === 'SHADOW'
            ? 'Night'
            : 'Day',
      );
      await page.evaluate(() => document.fonts.ready);
      const privacyShield = page.getByRole('dialog', {
        name: 'Shield your screen',
      });
      if (!label.startsWith('shield-') && (await privacyShield.isVisible())) {
        const acknowledge = privacyShield.getByRole('button', {
          name: 'I’m shielded',
        });
        await page.clock.fastForward(6_000);
        await expect(acknowledge).toHaveAttribute('aria-disabled', 'false');
        await acknowledge.click();
        await expect(privacyShield).not.toBeVisible();
      }
      if (label === 'notes') {
        await page.getByRole('button', { name: 'Notes', exact: true }).click();
        await expect(page.getByTestId('private-notes-content')).toBeVisible();
      }
      for (const palette of ['day', 'night']) {
        if (view.phase === 'SHADOW' && !label.startsWith('shield-'))
          await expect(page.getByTestId('shadow-status')).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.locator('.game-shell').evaluate((element, theme) => {
          (element as HTMLElement).dataset.gameTheme = theme;
        }, palette);
        if (
          ['debate', 'vote', 'shadow', 'dawn'].includes(label) &&
          (width === 360 || width === 390)
        ) {
          const heading = page.locator('main h1').first();
          const happening = page
            .getByTestId('game-tab-panel')
            .getByTestId('game-happening-card');
          const firstAction = page
            .locator(
              '.game-action-bar .primary-action, .game-action-dock .primary-action, .game-action-dock button',
            )
            .first();
          await expect(heading).toBeVisible();
          await expect(happening).toBeVisible();
          await expect(firstAction).toBeVisible();
          const [headingBox, happeningBox, actionBox] = await Promise.all([
            heading.boundingBox(),
            happening.boundingBox(),
            firstAction.boundingBox(),
          ]);
          expect(headingBox).not.toBeNull();
          expect(happeningBox).not.toBeNull();
          expect(actionBox).not.toBeNull();
          expect(headingBox!.y + headingBox!.height).toBeLessThanOrEqual(
            happeningBox!.y,
          );
          expect(happeningBox!.y + happeningBox!.height).toBeLessThan(
            actionBox!.y,
          );
          expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(height);
        }
        if (held) {
          const seal = page.getByTestId('button-hold-reveal');
          const box = await seal.boundingBox();
          expect(box).not.toBeNull();
          await page.mouse.move(
            box!.x + box!.width / 2,
            box!.y + box!.height / 2,
          );
          await page.mouse.down();
          await page.clock.fastForward(1_200);
          await expect(page.getByTestId('private-role-content')).toBeVisible();
        }
        const footer = page.getByRole('dialog', { name: 'Shield your screen' });
        const shielded = await footer.isVisible();
        const header = shielded
          ? footer.getByTestId('text-entry-brand')
          : page.locator('header.public-shell-header');
        const headerBox = await header.boundingBox();
        expect(headerBox).not.toBeNull();
        const main = shielded ? footer : page.locator('main');
        const textBoxes = await main
          .locator(
            'h1, h2, p, [role="status"], [data-testid="game-commentary"]',
          )
          .evaluateAll((elements) =>
            elements
              .filter(
                (element) =>
                  element.getClientRects().length > 0 &&
                  getComputedStyle(element).visibility !== 'hidden',
              )
              .map((element) => {
                const box = element.getBoundingClientRect();
                return { text: element.textContent, top: box.top };
              }),
          );
        for (const box of textBoxes)
          expect(
            box.top,
            `${label}/${palette}/${width}: ${box.text}`,
          ).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const phaseChip = page.getByTestId('game-status-phase');
        const phaseChipSize = await phaseChip
          .locator('.game-status-phase-label')
          .evaluate((element) => {
            const chip = element.parentElement;
            const row = chip?.parentElement;
            return {
              text: element.textContent,
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
              chipWidth: chip?.getBoundingClientRect().width,
              rowWidth: row?.clientWidth,
              rowChildren: Array.from(row?.children ?? []).map((child) => ({
                text: child.textContent?.trim(),
                width: child.getBoundingClientRect().width,
                flex: getComputedStyle(child).flex,
              })),
            };
          });
        expect(
          phaseChipSize.scrollWidth,
          `${label}/${palette}/${width}: phase chip ${JSON.stringify(phaseChipSize)}`,
        ).toBeLessThanOrEqual(phaseChipSize.clientWidth);
        const bottomBar = page.getByTestId('game-bottom-bar');
        const bottomBarBox = await bottomBar.boundingBox();
        expect(bottomBarBox).not.toBeNull();
        expect(bottomBarBox!.height).toBeGreaterThanOrEqual(52);
        expect(Math.abs(bottomBarBox!.height - 52)).toBeLessThanOrEqual(1);
        for (const tab of ['Game', 'Players']) {
          const box = await page.getByRole('tab', { name: tab }).boundingBox();
          expect(box, `${tab} tab at ${width}px`).not.toBeNull();
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
        const themeTokens = await page
          .locator('.game-shell')
          .evaluate((element) => {
            const style = getComputedStyle(element);
            return {
              background: style
                .getPropertyValue('--game-bg')
                .trim()
                .toUpperCase(),
              surface: style
                .getPropertyValue('--game-surface')
                .trim()
                .toUpperCase(),
              line: style.getPropertyValue('--game-line').trim().toUpperCase(),
              text: style.getPropertyValue('--game-text').trim().toUpperCase(),
              muted: style
                .getPropertyValue('--game-muted')
                .trim()
                .toUpperCase(),
              accent: style
                .getPropertyValue('--game-accent')
                .trim()
                .toUpperCase(),
              onAccent: style
                .getPropertyValue('--game-on-accent')
                .trim()
                .toUpperCase(),
              alert: style
                .getPropertyValue('--game-alert')
                .trim()
                .toUpperCase(),
            };
          });
        expect(themeTokens).toEqual(
          palette === 'day'
            ? {
                background: '#FAF8F1',
                surface: '#F1ECDF',
                line: '#D9D1BF',
                text: '#26221D',
                muted: '#5E564B',
                accent: '#7A4E1D',
                onAccent: '#FFFFFF',
                alert: '#A3341F',
              }
            : {
                background: '#1B1815',
                surface: '#272320',
                line: '#433C34',
                text: '#F3EEE4',
                muted: '#BFB5A5',
                accent: '#E3B35F',
                onAccent: '#1B1815',
                alert: '#F2927A',
              },
        );
        if (!shielded && !held)
          expect(
            await page
              .locator('main')
              .evaluate((element) => getComputedStyle(element).overflowY),
          ).toBe('visible');
        const undersizedTargets = await page
          .locator(
            'button:visible, a:visible, input:visible, select:visible, [role="button"]:visible',
          )
          .evaluateAll((elements) =>
            elements
              .map((element) => {
                const box = element.getBoundingClientRect();
                return {
                  name:
                    element.getAttribute('aria-label') ||
                    element.textContent?.trim() ||
                    element.tagName,
                  width: box.width,
                  height: box.height,
                };
              })
              .filter((box) => box.width < 44 || box.height < 44),
          );
        expect(
          undersizedTargets,
          `${label}/${palette}/${width}: minimum touch targets`,
        ).toEqual([]);
        if (held) {
          const box = await page
            .getByTestId('private-role-content')
            .boundingBox();
          expect(box!.y).toBeGreaterThanOrEqual(
            headerBox!.y + headerBox!.height,
          );
          expect(box!.y + box!.height).toBeLessThanOrEqual(height);
        }
        if (
          capture &&
          (!captureRound7 ||
            (['debate', 'vote', 'shadow', 'dawn'].includes(label) &&
              width !== 360))
        ) {
          const screenshotLabel =
            captureRound7 && label === 'debate'
              ? 'conversation'
              : captureRound7 && label === 'shadow'
                ? 'night'
                : label;
          await page.screenshot({
            path: `${directory}/${screenshotLabel}-${palette}-${width}.jpg`,
            type: 'jpeg',
            quality: 72,
            scale: 'css',
          });
        }
        if (held) await page.mouse.up();
        await expect(page.getByTestId('brand-footer-shell')).toHaveCount(0);
        if (!shielded && !held) {
          const last = page
            .locator(
              'main button:visible:not(.game-action-bar button):not(.game-action-dock button):not(.game-notes-dock-button)',
            )
            .last();
          if (await last.count()) {
            await page.evaluate(() =>
              window.scrollTo(0, document.documentElement.scrollHeight),
            );
            const box = await last.boundingBox();
            const action = page.locator(
              '.game-action-bar:visible, .game-action-dock:visible, .game-notes-dock-button:visible',
            );
            const bottomBar = page.getByTestId('game-bottom-bar');
            const stack =
              (await action.count()) > 0 ? action.first() : bottomBar;
            const stackBox =
              (await stack.count()) > 0 ? await stack.boundingBox() : null;
            const viewportHeight =
              page.viewportSize()?.height ??
              (await page.evaluate(() => window.innerHeight));
            expect(
              box!.y + box!.height,
              `${label}/${palette}/${width}: last action clear of bottom stack`,
            ).toBeLessThanOrEqual((stackBox?.y ?? viewportHeight) + 1);
          }
          const bar = page.locator(
            '.game-action-bar:visible, .game-action-dock:visible',
          );
          if (await bar.count()) {
            const barBox = await bar.first().boundingBox();
            const tabBox = await page
              .getByTestId('game-bottom-bar')
              .boundingBox();
            expect(barBox).not.toBeNull();
            expect(tabBox).not.toBeNull();
            expect(
              Math.abs(barBox!.y + barBox!.height - tabBox!.y),
            ).toBeLessThanOrEqual(1);
            expect(barBox!.width).toBe(page.viewportSize()?.width);
          }
        }
      }
    }
  }
  for (const phase of [
    'LOBBY',
    'DEAL',
    'MISSION',
    'DEBATE',
    'VOTE',
    'VERDICT',
    'SHADOW',
    'DAWN',
    'ENDGAME',
    'FINAL_VOTE',
    'FINAL_BANISH',
    'FINISHED',
  ] as const) {
    view = {
      ...createPublicView(gameId),
      phase,
      shadowSlot: phase === 'SHADOW' ? 1 : 0,
      deadline: null,
      missionsEnabled: false,
      canAdvancePhase: phase !== 'LOBBY' && phase !== 'FINISHED',
      seats: [
        'Morgan',
        'Alex',
        'Jamie',
        'Sam',
        'Drew',
        'Blair',
        'Taylor',
        'Robin',
      ].map((name, index) => ({
        id: `seat-${name.toLowerCase()}`,
        name,
        status: index === 1 ? ('banished' as const) : ('alive' as const),
        ...(phase === 'FINISHED'
          ? { role: index === 1 ? ('traitor' as const) : ('faithful' as const) }
          : {}),
      })),
      ...(phase === 'VERDICT'
        ? {
            publicAnnouncement: {
              kind: 'verdict' as const,
              cycle: 2,
              seat: { id: 'seat-alex', name: 'Alex', role: 'traitor' as const },
            },
          }
        : {}),
      ...(phase === 'DAWN'
        ? {
            publicAnnouncement: {
              kind: 'dawn' as const,
              cycle: 2,
              victims: [],
            },
          }
        : {}),
      ...(phase === 'FINISHED'
        ? {
            winner: 'faithful' as const,
            publicAnnouncement: {
              kind: 'finished' as const,
              winner: 'faithful' as const,
            },
          }
        : {}),
    };
    await page.goto(`/game/${gameId}`);
    await expect(page.getByTestId('player-game')).toHaveAttribute(
      'data-phase',
      phase,
    );
    if (phase === 'DEAL' || phase === 'SHADOW') {
      await expect(
        page.getByRole('dialog', { name: 'Shield your screen' }),
      ).toBeVisible();
      await snapshot(`shield-${phase.toLowerCase()}`);
      await page.clock.fastForward(3_000);
      await page.getByRole('button', { name: 'I’m shielded' }).click();
    }
    if (phase === 'SHADOW')
      await expect(page.getByTestId('shadow-status')).toBeVisible();
    await snapshot(phase.toLowerCase(), phase === 'DEAL');
    if (phase === 'DEBATE') {
      await page.getByRole('button', { name: 'Notes', exact: true }).click();
      await expect(page.getByTestId('private-notes-content')).toBeVisible();
      await snapshot('notes');
    }
  }
  role = 'traitor';
  view = { ...view, phase: 'DEAL', winner: null, publicAnnouncement: null };
  await snapshot('role-traitor', true);
  view = {
    ...view,
    phase: 'SHADOW',
    shadowSlot: 1,
    winner: null,
    publicAnnouncement: null,
  };
  await page.goto(`/game/${gameId}`);
  await expect(
    page.getByRole('dialog', { name: 'Shield your screen' }),
  ).toBeVisible();
  await page.clock.fastForward(3_000);
  await page.getByRole('button', { name: 'I’m shielded' }).click();
  await expect(page.getByTestId('shadow-status')).toBeVisible();
  await snapshot('night-traitor');
});

test('coordinator creates a fresh late invitation without reopening the room code', async ({
  page,
}) => {
  const gameId = 'late-join-ui';
  const view = createPublicView(gameId);
  let pending = [
    {
      id: 'late-request',
      seatId: 'late-seat',
      name: 'Sam',
      createdAt: Date.now(),
    },
  ];
  let lobbyInviteRequests = 0;
  const decisions: unknown[] = [];
  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      json: { csrfToken: 'c'.repeat(64) },
    }),
  );
  await page.route(`**/api/games/${gameId}/coordinator/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );
  await page.route(`**/api/games/${gameId}/join-requests`, (route) =>
    route.fulfill({
      json: pendingJoinRequestsResponseSchema.parse({ requests: pending }),
    }),
  );
  await page.route(`**/api/games/${gameId}/coordinator/delegates`, (route) =>
    route.fulfill({ json: { limit: 1, seatIds: [] } }),
  );
  await page.route(`**/api/games/${gameId}/coordinator/presence`, (route) =>
    route.fulfill({ json: { status: 'online' } }),
  );
  await page.route(`**/api/games/${gameId}/invites`, (route) => {
    lobbyInviteRequests += 1;
    return route.fulfill({ status: 409, json: { error: 'Command rejected' } });
  });
  await page.route(`**/api/games/${gameId}/late-invites`, (route) =>
    route.fulfill({
      status: 201,
      json: {
        gameId,
        joinUrl: `https://oathstone.test/join/${gameId}#${'i'.repeat(43)}`,
      },
    }),
  );
  await page.route(
    `**/api/games/${gameId}/join-requests/late-request/decision`,
    (route) => {
      decisions.push(route.request().postDataJSON());
      pending = [];
      return route.fulfill({
        json: { status: 'approved', seatId: 'late-seat' },
      });
    },
  );
  await page.goto(`/coordinate/${gameId}`);
  await expect(
    page.getByRole('heading', { name: 'Invite a late player' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create a fresh invitation' }).click();
  await expect(page.getByTestId('lobby-join-qr')).toHaveAttribute(
    'data-join-url',
    new RegExp(`/join/${gameId}#i{43}$`),
  );
  await expect(page.getByTestId('text-lobby-code')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Share invitation' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByTestId('text-no-pending-joiners')).toBeVisible();
  expect(decisions).toEqual([
    { decision: 'approve', expectedVersion: view.version },
  ]);
  expect(lobbyInviteRequests).toBe(0);
  await page.route(`**/api/games/${gameId}/late-invites`, (route) =>
    route.fulfill({
      status: 409,
      json: { error: 'Command rejected' },
    }),
  );
  await page.getByRole('button', { name: 'Create a fresh invitation' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Late joining is closed or all seats are taken. You can return to the game.',
  );
  await expect(page.getByTestId('lobby-join-qr')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to game' }).click();
  await expect(page).toHaveURL(new RegExp(`/game/${gameId}$`));
});

test('organiser can start with five players while one planned seat has not joined', async ({
  page,
}) => {
  const gameId = 'early-start-ui';
  const view = {
    ...createPublicView(gameId),
    phase: 'LOBBY',
    cycle: 0,
    seats: Array.from({ length: 5 }, (_, index) => ({
      id: `seat-${index}`,
      name: `Player ${index + 1}`,
      status: 'alive',
    })),
  };
  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      json: { csrfToken: 'c'.repeat(64) },
    }),
  );
  await page.route(`**/api/games/${gameId}/coordinator/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );
  await page.route(`**/api/games/${gameId}/join-requests`, (route) =>
    route.fulfill({
      json: { requests: [] },
    }),
  );
  await page.route(`**/api/games/${gameId}/invites`, (route) =>
    route.fulfill({
      status: 201,
      json: {
        gameId,
        shortCode: 'ABC234',
        joinUrl: `https://oathstone.test/join/${gameId}#${'i'.repeat(43)}`,
      },
    }),
  );
  await page.goto(`/coordinate/${gameId}?players=6`);
  await expect(page.getByTestId('text-lobby-player-count')).toHaveText(
    '5 of 6 player seats are ready.',
  );
  await expect(page.getByTestId('button-start-game')).toBeEnabled();
});

async function revealNotes(
  page: Page,
  gameId: string,
  role: 'traitor' | 'faithful',
  palette: 'day' | 'night' = 'day',
): Promise<unknown[]> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let privateRequests = 0;
  const publicView = createPublicView(gameId);
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
      json: { serverNow: Date.now(), version: 12, view: publicView },
    }),
  );
  await page.route(`**/api/games/${gameId}/commands`, (route) =>
    route.fulfill({
      status: 200,
      json: { serverNow: Date.now(), version: 13, view: publicView },
    }),
  );
  await page.route(`**/api/games/${gameId}/private-view`, async (route) => {
    privateRequests += 1;
    expect(route.request().postDataJSON()).toEqual({ purpose: 'notes' });
    await route.fulfill({
      status: 200,
      json: {
        serverNow: Date.now(),
        version: 12,
        view: {
          ...publicView,
          private: {
            role,
            team: [],
            options: [],
            choices: {},
            choiceSlots: [],
            chat:
              role === 'traitor'
                ? [{ seatId: 'seat-morgan', text: 'Stay together', seq: 1 }]
                : [],
            task: null,
            minimumDurationMs: 0,
          },
        },
      },
    });
  });
  await page.goto(`/game/${gameId}`);
  const notesButton = page
    .getByTestId('game-status-bar')
    .getByRole('button', { name: 'Notes' });
  await expect(notesButton).toBeVisible();
  await expect(notesButton).toHaveCSS('font-size', '13px');
  await notesButton.click();
  await expect(page.getByRole('dialog', { name: 'Notes' })).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Shield your screen' }),
  ).toHaveCount(0);
  await expect(page.getByTestId('button-hold-reveal')).toHaveCount(0);
  await expect.poll(() => privateRequests).toBe(1);
  const notes = page.getByTestId('private-notes-content');
  await expect(notes).toBeVisible({ timeout: 1500 });
  await page.locator('.game-shell').evaluate((element, theme) => {
    (element as HTMLElement).dataset.gameTheme = theme;
  }, palette);
  await expect(page.getByTestId('button-hold-reveal')).toHaveCount(0);
  await expect(
    notes.getByText('Only you can see your notes.', { exact: true }),
  ).toHaveCount(1);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const snapshot = await notes.evaluate((element) =>
    [element, ...Array.from(element.querySelectorAll('*'))].map((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        tag: node.tagName,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        color: style.color,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
      };
    }),
  );
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(notes).toHaveCount(0);
  return snapshot;
}

test('phone room shows public game state without a presenter', async ({
  page,
}) => {
  const gameId = 'phone-room';
  const publicView = {
    ...createPublicView(gameId),
    canAdvancePhase: true,
  } as FullView;
  publicView.viewerSeatId = publicView.seats[0]?.id ?? null;
  publicView.seats = publicView.seats.map((seat, index) => ({
    ...seat,
    connected: index % 2 === 0,
    ...(index === 0
      ? { role: 'traitor' as const }
      : index === 1
        ? {
            role: 'faithful' as const,
            status: 'banished' as const,
          }
        : {}),
  }));
  const nextPublicLogSeq =
    Math.max(0, ...publicView.publicLog.map((entry) => entry.seq)) + 1;
  publicView.publicLog = [
    ...publicView.publicLog,
    {
      seq: nextPublicLogSeq,
      at: 1,
      action: 'dawn',
      victims: [{ id: 'seat-morgan', name: 'Morgan' }],
    },
    {
      seq: nextPublicLogSeq + 1,
      at: 2,
      action: 'dawn',
      victims: [],
    },
  ];
  let privateRequests = 0;

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
      json: { serverNow: Date.now(), version: 12, view: publicView },
    }),
  );
  await page.route(`**/api/games/${gameId}/commands`, (route) =>
    route.fulfill({
      status: 200,
      json: { serverNow: Date.now(), version: 13, view: publicView },
    }),
  );
  await page.route(`**/api/games/${gameId}/private-view`, async (route) => {
    privateRequests += 1;
    expect(route.request().postDataJSON()).toEqual({ purpose: 'notes' });
    await route.fulfill({
      status: 200,
      json: {
        serverNow: Date.now(),
        version: 12,
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

  await page.goto(`/game/${gameId}`);
  await expect(page.getByTestId('player-game')).toHaveAttribute(
    'data-phase',
    'DEBATE',
  );
  await expect(page.getByTestId('game-status-phase')).toHaveText(
    'Day 2 · Talk',
  );
  await expect(
    page.getByRole('heading', { name: 'Your room', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/players have completed this part/)).toHaveCount(
    0,
  );

  const publicGameTab = page.getByRole('tab', {
    name: 'Game',
    exact: true,
  });
  const publicPlayersTab = page.getByRole('tab', {
    name: 'Players',
    exact: true,
  });
  const gamePanel = page.getByTestId('game-tab-panel');
  const playersPanel = page.getByTestId('players-tab-panel');
  await expect(publicGameTab).toHaveAttribute('aria-selected', 'true');
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await publicPlayersTab.click();
    await expect(publicPlayersTab).toHaveAttribute('aria-selected', 'true');
    await expect(publicGameTab).toHaveAttribute('aria-selected', 'false');
    await expect(playersPanel).toBeVisible();
    await expect(gamePanel).toBeHidden();
    await expect(playersPanel).toContainText(publicView.seats[0]?.name ?? '');
    await expect(playersPanel).toContainText('You');
    await expect(playersPanel).toContainText('Playing');
    await expect(playersPanel).toContainText('Connected');
    await expect(playersPanel).not.toContainText(
      /PRIVATE_TASK_SENTINEL|SECRET_ROLE_SENTINEL/,
    );

    await publicGameTab.click();
    await expect(publicGameTab).toHaveAttribute('aria-selected', 'true');
    await expect(publicPlayersTab).toHaveAttribute('aria-selected', 'false');
    await expect(gamePanel).toBeVisible();
    await expect(playersPanel).toBeHidden();
    await expect(page.getByTestId('player-game')).toHaveAttribute(
      'data-phase',
      'DEBATE',
    );
  }

  const phaseHelp = page
    .locator('details')
    .filter({ hasText: 'Everyone talks it over.' });
  await expect(phaseHelp).toHaveCount(1);
  await expect(page.getByTestId('conversation-prompts')).toBeHidden();
  await expect(phaseHelp).not.toHaveAttribute('open', '');
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 740 },
  ]) {
    await page.setViewportSize(viewport);
    const collapsedLayout = await phaseHelp.evaluate((element) => {
      const summary = element.querySelector('summary');
      const content = element.querySelector('.game-help-disclosure__content');
      if (!summary || !content) {
        throw new Error('The collapsed help disclosure is missing its parts.');
      }
      const detailsBounds = element.getBoundingClientRect();
      const summaryBounds = summary.getBoundingClientRect();
      const nextElement = element.nextElementSibling;
      if (!nextElement) {
        throw new Error('The closed help disclosure has no following content.');
      }
      const nextBounds = nextElement.getBoundingClientRect();
      return {
        spaceBelowSummary: detailsBounds.bottom - summaryBounds.bottom,
        gapToNextElement: nextBounds.top - detailsBounds.bottom,
        marginBottom: getComputedStyle(element).marginBottom,
      };
    });
    expect(collapsedLayout.spaceBelowSummary).toBeLessThanOrEqual(1);
    expect(Math.abs(collapsedLayout.gapToNextElement)).toBeLessThanOrEqual(1);
    expect(collapsedLayout.marginBottom).toBe('0px');
  }
  await phaseHelp.locator('summary').click();
  await expect(phaseHelp).toContainText(
    'Everyone talks it over. Who is acting suspiciously, and why? In a real game this lasts as long as the organiser sets.',
  );
  const prompts = phaseHelp.getByTestId('conversation-prompts');
  await expect(prompts).toBeVisible();
  const promptItems = prompts.getByRole('listitem');
  await expect(promptItems).toHaveCount(3);
  await expect(promptItems.first()).toHaveCSS('font-size', '16px');
  const helpContent = phaseHelp.locator('.game-help-disclosure__content');
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 740 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await expect
      .poll(
        async () => {
          const [helpBox, dockBox] = await Promise.all([
            helpContent.boundingBox(),
            page.locator('.game-action-bar').boundingBox(),
          ]);
          return (
            helpBox !== null &&
            dockBox !== null &&
            helpBox.y + helpBox.height <= dockBox.y
          );
        },
        { timeout: 2_000 },
      )
      .toBe(true);
  }
  await phaseHelp.locator('summary').click();
  await expect(prompts).toBeHidden();
  await publicPlayersTab.click();
  await expect(playersPanel).toBeVisible();
  await expect(page.getByTestId('player-seat-seat-morgan')).toBeVisible();
  await expect(page.getByTestId('player-seat-seat-alex')).toContainText('Out');
  await expect(page.getByTestId('player-seat-seat-morgan')).toContainText(
    'Connected',
  );
  await expect(page.getByTestId('player-seat-seat-morgan')).not.toContainText(
    'Traitor',
  );
  await expect(page.getByTestId('player-seat-seat-alex')).toContainText(
    'Faithful',
  );
  await publicGameTab.click();
  await expect(page.getByTestId('status-prize-pot')).toContainText('18 points');
  const publicLog = page.getByTestId('list-public-log');
  await expect(publicLog).toContainText('Alex moved to a new device');
  await expect(publicLog).toContainText('Morgan was taken in the night.');
  await expect(publicLog).toContainText('No one was taken.');
  await expect(page.getByRole('button', { name: 'Full screen' })).toHaveCount(
    0,
  );
  const notesButton = page
    .getByTestId('game-status-bar')
    .getByRole('button', { name: 'Notes' });
  await expect(notesButton).toBeVisible();

  const gameMenu = page.getByTestId('game-status-menu');
  await expect(gameMenu).toBeVisible();
  await gameMenu.locator('summary').click();
  await expect(gameMenu).toContainText('Display');
  await expect(gameMenu).toContainText('Always dark');
  await expect(
    gameMenu.getByRole('link', { name: 'Organiser controls' }),
  ).toBeVisible();
  const darkMode = gameMenu.getByRole('checkbox', { name: 'Always dark' });
  const originalTheme = await page
    .locator('.game-shell')
    .getAttribute('data-game-theme');
  await darkMode.check();
  await expect(page.locator('.game-shell')).toHaveAttribute(
    'data-game-theme',
    'night',
  );
  await darkMode.uncheck();
  if (originalTheme) {
    await expect(page.locator('.game-shell')).toHaveAttribute(
      'data-game-theme',
      originalTheme,
    );
  }

  await gameMenu.locator('summary').click();
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 740 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    const headingBox = await page.locator('main h1').first().boundingBox();
    const happeningBox = await page
      .getByTestId('game-tab-panel')
      .getByTestId('game-happening-card')
      .boundingBox();
    const action = page.locator('.game-action-bar .primary-action').first();
    const actionBox = await action.boundingBox();
    expect(headingBox, `heading at ${viewport.width}px`).not.toBeNull();
    expect(happeningBox, `status card at ${viewport.width}px`).not.toBeNull();
    expect(actionBox, `first action at ${viewport.width}px`).not.toBeNull();
    expect(headingBox!.y).toBeGreaterThanOrEqual(0);
    await expect(page.locator('main h1').first()).toHaveCSS(
      'font-size',
      '30px',
    );
    expect(happeningBox!.y).toBeGreaterThan(headingBox!.y);
    expect(happeningBox!.y + happeningBox!.height).toBeLessThan(actionBox!.y);
    expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(
      viewport.height,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `no horizontal overflow at ${viewport.width}px`,
    ).toBe(true);
    await expect(
      page.locator('.game-action-bar').getByRole('button', { name: 'Notes' }),
    ).toHaveCount(0);
  }

  await notesButton.click();

  await expect(
    page.getByRole('dialog', { name: 'Shield your screen' }),
  ).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Notes' })).toBeVisible();
  await expect.poll(() => privateRequests).toBe(1);
  await expect(page.getByTestId('private-notes-content')).toBeVisible({
    timeout: 1500,
  });
  await expect(page.getByTestId('button-hold-reveal')).toHaveCount(0);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('private-notes-content')).toHaveCount(0);
  await expect(page.getByTestId('game-notes-sheet')).toHaveCount(0);
  const moveOn = page.getByRole('button', { name: 'Move everyone on' });
  await expect(moveOn).toBeEnabled();
  await publicPlayersTab.click();
  await expect(publicPlayersTab).toHaveAttribute('aria-selected', 'true');
  await expect(playersPanel).toBeVisible();
  await publicGameTab.click();
  await expect(publicGameTab).toHaveAttribute('aria-selected', 'true');
  await expect(gamePanel).toBeVisible();
});

test('shows Moving on instead of a frozen zero when a deadline passes', async ({
  page,
}) => {
  const clockStart = new Date('2030-01-01T12:00:00.000Z');
  const pausedAt = new Date(clockStart.getTime() + 10_000);
  await page.clock.install({ time: clockStart });
  await page.clock.pauseAt(pausedAt);
  const gameId = 'deadline-transition-pending';
  const view = {
    ...createPublicView(gameId),
    phase: 'DEBATE' as const,
    deadline: pausedAt.getTime() + 1000,
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
      json: { serverNow: pausedAt.getTime(), version: 12, view },
    }),
  );
  await page.goto(`/game/${gameId}`);
  await expect(page.getByText('Time left')).toBeVisible();
  await page.clock.fastForward(1100);
  await expect(page.getByText('Moving on...')).toBeVisible();
  await expect(page.getByText('0:00')).toHaveCount(0);
});

test('uses server time when the device clock is two minutes fast or slow', async ({
  browser,
}) => {
  const serverNow = Date.parse('2030-01-01T12:00:00.000Z');
  for (const skew of [120_000, -120_000]) {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    const gameId = `clock-skew-${skew}`;
    const view = {
      ...createPublicView(gameId),
      phase: 'DEBATE' as const,
      deadline: serverNow + 60_000,
    };
    try {
      await page.clock.install({ time: new Date(serverNow + skew) });
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
          json: { serverNow, version: view.version, view },
        }),
      );
      await page.goto(`/game/${gameId}`);
      await expect(page.getByText('Time left')).toBeVisible();
      await expect(page.getByText('1:00')).toBeVisible();
      await page.clock.fastForward(1_100);
      await expect(page.getByText('0:59')).toBeVisible();
    } finally {
      await page.close();
    }
  }
});

test('rehearsal player can move on from public and voting screens', async ({
  page,
}) => {
  const gameId = 'rehearsal-move-on';
  await page.setViewportSize({ width: 320, height: 568 });
  let publicView: FullView = {
    ...createPublicView(gameId),
    canAdvancePhase: true,
    rehearsal: true,
    seats: [
      { id: 'seat-morgan', name: 'Morgan', status: 'alive' },
      { id: 'seat-alex', name: 'Alex', status: 'departed' },
      { id: 'seat-jamie', name: 'Jamie', status: 'alive' },
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `seat-practice-${index + 1}`,
        name: `Practice player ${index + 1}`,
        status: 'alive' as const,
      })),
    ],
  };
  const submitted: Record<string, unknown>[] = [];
  let privateViewRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/private-view')) {
      privateViewRequests += 1;
    }
  });

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
      json: {
        serverNow: Date.now(),
        version: publicView.version,
        view: publicView,
      },
    }),
  );
  await page.route(`**/api/games/${gameId}/commands`, async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    submitted.push(body);
    const livingSeatIds = publicView.seats
      .filter((seat) => seat.status === 'alive')
      .map((seat) => seat.id);
    publicView = {
      ...publicView,
      phase: body.type === 'AdvancePhase' ? 'VOTE' : publicView.phase,
      version: publicView.version + 1,
      progress:
        body.type === 'AdvancePhase'
          ? { done: 1, total: livingSeatIds.length }
          : body.type === 'SubmitVote'
            ? {
                done: livingSeatIds.length,
                total: livingSeatIds.length,
              }
            : publicView.progress,
      votedSeatIds:
        body.type === 'AdvancePhase'
          ? ['seat-jamie']
          : body.type === 'SubmitVote'
            ? livingSeatIds
            : publicView.votedSeatIds,
      deadline:
        body.type === 'AdvancePhase'
          ? Date.now() + 60_000
          : publicView.deadline,
    };
    await route.fulfill({
      status: 200,
      json: {
        serverNow: Date.now(),
        version: publicView.version,
        view: publicView,
      },
    });
  });
  await page.route(`**/api/games/${gameId}/private-view`, async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        serverNow: Date.now(),
        version: publicView.version,
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

  await page.goto(`/game/${gameId}`);
  const stepGuide = page.getByTestId('rehearsal-explainer');
  await expect(stepGuide).toBeVisible();
  await expect(stepGuide).toHaveAccessibleName('The conversation');
  await expect(stepGuide).toContainText(
    'Share what you have noticed before the vote.',
  );
  await stepGuide.getByRole('button', { name: 'Got it' }).click();
  await expect(stepGuide).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next step' })).toBeVisible();
  await expect(
    page.getByText(
      'The organiser will move the game forward. Keep your phone close and your screen private.',
    ),
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Next step' }).click();
  const voteGuide = page.getByRole('dialog', { name: 'The vote' });
  await expect(voteGuide).toBeVisible();
  await expect(voteGuide).toContainText('Choose your suspect privately.');
  await voteGuide.getByRole('button', { name: 'Got it' }).click();
  await expect(voteGuide).toHaveCount(0);
  await expect(
    page.getByRole('dialog', { name: 'Shield your screen' }),
  ).toHaveCount(0);
  await expect(page.getByText('Who do you vote to banish?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Jamie' })).toBeVisible();
  expect(privateViewRequests).toBe(0);
  const choiceList = page.getByTestId('private-choice-list');
  await expect(page.getByTestId('button-hold-reveal')).toHaveCount(0);
  await expect(choiceList).toBeVisible();
  await expect(choiceList.getByRole('button')).toHaveCount(5);
  await expect(page.getByTestId('phase-progress-status')).toHaveCount(0);
  await expect(page.getByTestId('vote-self-status')).toContainText('Morgan');
  await expect(page.getByTestId('vote-self-status')).toContainText('You');
  await expect(choiceList.getByText('Waiting', { exact: true })).toHaveCount(0);
  await expect(choiceList.getByText('Voted', { exact: true })).toHaveCount(0);
  const voteLayout = await page.locator('main#main').evaluate((main) => ({
    contentHeight: main.scrollHeight,
    viewportHeight: main.clientHeight,
  }));
  expect(voteLayout.contentHeight).toBeLessThanOrEqual(
    voteLayout.viewportHeight,
  );
  await expect(page.getByText('Who do you vote to banish?')).toBeVisible();
  await page.getByRole('button', { name: 'Jamie', exact: true }).click();
  await page.getByRole('button', { name: 'Review this choice' }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect(privateViewRequests).toBe(0);
  await expect(choiceList).toHaveCount(0);
  await expect(page.getByTestId('waiting-for-everyone')).toHaveText(
    'Everyone has voted. Tap Next step to see the result.',
  );
  await expect(
    page.getByText('Thanks. Waiting for everyone.', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByTestId('rehearsal-action-bar')
      .getByText('Everyone has voted. Tap Next step to see the result.'),
  ).toHaveCount(0);
  expect(submitted[0]).toMatchObject({
    type: 'AdvancePhase',
    expectedVersion: 12,
  });
  expect(submitted).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'SubmitVote',
        target: 'seat-jamie',
      }),
    ]),
  );
});

test('mobile voting tiles scroll clear of the fixed dock and stay tappable', async ({
  page,
}, testInfo) => {
  test.skip(
    !['Pixel', 'iPhone'].includes(testInfo.project.name),
    'Fixed-dock touch clearance is checked on Android Chrome and iPhone WebKit.',
  );

  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-csrf' } }),
  );

  for (const width of [320, 375, 390, 430]) {
    const gameId = `dock-clearance-${width}`;
    const seats = Array.from({ length: 11 }, (_, index) => ({
      id: index === 0 ? 'seat-morgan' : `seat-player-${index}`,
      name: index === 0 ? 'Morgan' : `Player ${index}`,
      status: 'alive' as const,
    }));
    const publicView = {
      ...createPublicView(gameId),
      phase: 'VOTE',
      seats,
      voteCandidates: seats.slice(1).map(({ id }) => id),
      actionStatus: { waiting: 0, total: seats.length },
    } as FullView;

    await page.route(`**/api/games/${gameId}/view`, (route) =>
      route.fulfill({
        json: {
          serverNow: Date.now(),
          version: publicView.version,
          view: publicView,
        },
      }),
    );
    await page.route(`**/api/games/${gameId}/commands`, (route) =>
      route.fulfill({
        json: {
          serverNow: Date.now(),
          version: publicView.version,
          view: publicView,
        },
      }),
    );

    await page.setViewportSize({ width, height: 640 });
    await page.goto(`/game/${gameId}`);
    const choices = page.getByTestId('private-choice-list');
    await expect(choices.getByRole('button')).toHaveCount(seats.length - 1);
    const lastChoice = choices.getByRole('button').last();
    await lastChoice.evaluate((element) =>
      element.scrollIntoView({ block: 'end' }),
    );

    const clearance = await lastChoice.evaluate((element) => {
      const tile = element.getBoundingClientRect();
      const dock = document
        .querySelector('[data-testid="game-action-dock"]')!
        .getBoundingClientRect();
      const bottomBar = document
        .querySelector('[data-testid="game-bottom-bar"]')!
        .getBoundingClientRect();
      const shell = document.querySelector('.game-shell')!;
      const shellStyle = getComputedStyle(shell);
      const centreHit = document.elementFromPoint(
        tile.left + tile.width / 2,
        tile.top + tile.height / 2,
      );
      const fixedContainingAncestors = [];
      for (
        let ancestor = document.querySelector(
          '[data-testid="game-action-dock"]',
        )!.parentElement;
        ancestor;
        ancestor = ancestor.parentElement
      ) {
        const style = getComputedStyle(ancestor);
        if (
          style.transform !== 'none' ||
          style.filter !== 'none' ||
          style.perspective !== 'none' ||
          style.contain !== 'none' ||
          style.willChange.includes('transform')
        ) {
          fixedContainingAncestors.push({
            tag: ancestor.tagName,
            className: (ancestor as HTMLElement).className,
            transform: style.transform,
            filter: style.filter,
            perspective: style.perspective,
            contain: style.contain,
            willChange: style.willChange,
          });
        }
      }
      return {
        viewportHeight: window.innerHeight,
        tileTop: tile.top,
        tileBottom: tile.bottom,
        dockTop: dock.top,
        dockHeight: dock.height,
        dockBottomStyle: getComputedStyle(
          document.querySelector('[data-testid="game-action-dock"]')!,
        ).bottom,
        footerHeight: shellStyle.getPropertyValue('--game-footer-dock-height'),
        bottomBarCssHeight: shellStyle.getPropertyValue(
          '--game-bottom-bar-height',
        ),
        actionDockHeight: shellStyle.getPropertyValue(
          '--game-action-dock-height',
        ),
        shellClassName: shell.className,
        bottomBarTop: bottomBar.top,
        bottomBarHeight: bottomBar.height,
        mainPaddingBottom: getComputedStyle(
          document.querySelector('.game-shell-main')!,
        ).paddingBottom,
        requiredPadding: dock.height + bottomBar.height + 16,
        scrollY: window.scrollY,
        fixedContainingAncestors,
        centreIsChoice: centreHit === element || element.contains(centreHit),
      };
    });
    expect(
      clearance.tileBottom,
      `Last vote tile must clear the dock at ${width}x640: ${JSON.stringify(clearance)}`,
    ).toBeLessThanOrEqual(clearance.dockTop);
    expect(
      clearance.dockTop + clearance.dockHeight,
      `Action dock must clear the tabs at ${width}x640`,
    ).toBeLessThanOrEqual(clearance.bottomBarTop);
    expect(
      Math.abs(
        Number.parseFloat(clearance.mainPaddingBottom) -
          clearance.requiredPadding,
      ),
      `Content padding must include the measured dock and tab bar at ${width}x640`,
    ).toBeLessThanOrEqual(1);
    expect(
      clearance.centreIsChoice,
      `The tile centre must be the top hit target at ${width}x640`,
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `No horizontal overflow at ${width}x640`,
    ).toBe(true);

    await lastChoice.tap();
    await expect(lastChoice).toHaveAttribute('aria-pressed', 'true');
    await page.goto('about:blank');
  }
});

test('out players see vote status without targets or an aggregate counter', async ({
  page,
}) => {
  const gameId = 'out-vote-progress';
  let publicView = {
    ...createPublicView(gameId),
    phase: 'VOTE',
    viewerSeatId: 'seat-alex',
    progress: { done: 1, total: 2 },
    votedSeatIds: ['seat-jamie'],
  } as FullView;

  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'c'.repeat(43) } }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: {
        serverNow: Date.now(),
        version: publicView.version,
        view: publicView,
      },
    }),
  );

  await page.goto(`/game/${gameId}`);
  const voteProgress = page.getByTestId('vote-progress-list');
  await expect(voteProgress).toBeVisible();
  await expect(voteProgress.getByTestId('vote-status-seat-jamie')).toHaveText(
    'Voted',
  );
  await expect(voteProgress.getByTestId('vote-status-seat-morgan')).toHaveText(
    'Waiting',
  );
  await expect(page.getByTestId('private-choice-list')).toHaveCount(0);
  await expect(page.getByTestId('phase-progress-status')).toHaveCount(0);
  expect(publicView.ballots).toEqual({});
  await expect(
    page.getByText('Everyone has voted. The result is coming.', {
      exact: true,
    }),
  ).toHaveCount(0);

  publicView = {
    ...publicView,
    progress: { done: 2, total: 2 },
    votedSeatIds: ['seat-jamie', 'seat-morgan'],
  };
  await page.reload();
  await expect(page.getByTestId('vote-completion-message')).toHaveText(
    'Everyone has voted. The result is coming.',
  );
});

test('Conversation keeps collapsed Help close to the next game content', async ({
  page,
}) => {
  const gameId = 'conversation-help-spacing';
  const view = {
    ...createPublicView(gameId),
    phase: 'DEBATE',
    deadline: null,
    missionsEnabled: false,
  } as FullView;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-csrf' } }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );
  await page.route(`**/api/games/${gameId}/join-requests`, (route) =>
    route.fulfill({ json: { requests: [] } }),
  );

  await page.goto(`/game/${gameId}`);
  await expect(page.getByTestId('player-game')).toHaveAttribute(
    'data-phase',
    'DEBATE',
  );
  const privacyShield = page.getByRole('dialog', {
    name: 'Shield your screen',
  });
  if (await privacyShield.isVisible()) {
    await page.clock.fastForward(6_000);
    await privacyShield.getByRole('button', { name: 'I’m shielded' }).click();
  }
  await expect(page.getByTestId('game-help-disclosure')).not.toHaveAttribute(
    'open',
    '',
  );
  const helpGap = await page
    .getByTestId('game-help-disclosure')
    .evaluate((details) => {
      const next = details.nextElementSibling;
      if (!(next instanceof HTMLElement)) return null;
      const helpBounds = details.getBoundingClientRect();
      const nextBounds = next.getBoundingClientRect();
      return nextBounds.top - helpBounds.bottom;
    });
  expect(
    helpGap,
    'Conversation should not leave a blank gap after collapsed Help',
  ).not.toBeNull();
  expect(helpGap).toBeLessThanOrEqual(32);
});

test('expanded Help leaves every game page scrollable above the dock', async ({
  page,
}, testInfo) => {
  test.skip(
    !['Pixel', 'iPhone'].includes(testInfo.project.name),
    'The expanded Help scroll path is checked on Android Chrome and iPhone WebKit.',
  );

  const gameId = 'expanded-help-scroll';
  const phaseGameIds = {
    DEBATE: `${gameId}-debate`,
    VOTE: `${gameId}-vote`,
    SHADOW: `${gameId}-shadow`,
  };
  let currentGameId = phaseGameIds.DEBATE;
  const seats = Array.from({ length: 20 }, (_, index) => ({
    id: index === 0 ? 'seat-morgan' : `seat-player-${index}`,
    name: index === 0 ? 'Morgan' : `Player ${index}`,
    status: 'alive' as const,
  }));
  let view = {
    ...createPublicView(currentGameId),
    canAdvancePhase: true,
    seats,
    viewerSeatId: 'seat-morgan',
    progress: { done: 0, total: seats.length },
    actionStatus: { waiting: 0, total: seats.length },
    voteCandidates: seats.slice(1).map(({ id }) => id),
    version: 20,
  } as FullView;
  const privateView = {
    role: 'faithful' as const,
    team: [],
    options: seats.map(({ id, name }) => ({ id, name })),
    choices: {},
    choiceSlots: [],
    chat: [],
    task: null,
    minimumDurationMs: 0,
  };

  await page.goto('/');
  const origin = new URL(page.url()).origin;
  await page.context().addCookies([
    ...Object.values(phaseGameIds).map((phaseGameId) => ({
      name: cookieNameForGame(phaseGameId),
      value: coldSeatToken,
      url: origin,
      httpOnly: true,
      secure: new URL(origin).protocol === 'https:',
      sameSite: 'Lax' as const,
    })),
  ]);
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'Set-Cookie': 'oathstone-csrf=test-csrf; Path=/; SameSite=Strict',
      },
      json: { csrfToken: 'test-csrf' },
    }),
  );
  await page.route('**/api/games/*/view', (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );
  await page.route('**/api/games/*/commands', (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );
  await page.route('**/api/games/*/private-view', (route) =>
    route.fulfill({
      json: {
        serverNow: Date.now(),
        version: view.version,
        view: { ...view, private: privateView },
      },
    }),
  );
  await page.route('**/api/games/*/join-requests', (route) =>
    route.fulfill({ json: { requests: [] } }),
  );

  for (const phase of ['DEBATE', 'VOTE', 'SHADOW'] as const) {
    currentGameId = phaseGameIds[phase];
    view = {
      ...createPublicView(currentGameId),
      canAdvancePhase: true,
      seats,
      viewerSeatId: 'seat-morgan',
      progress: { done: 0, total: seats.length },
      actionStatus: { waiting: 0, total: seats.length },
      voteCandidates: seats.slice(1).map(({ id }) => id),
      phase,
      deadline: null,
      version: view.version + 1,
    } as FullView;
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(`/game/${currentGameId}`);

    if (phase === 'SHADOW') {
      const shield = page.getByRole('dialog', { name: 'Shield your screen' });
      await expect(shield).toBeVisible();
      await page.clock.fastForward(3_000);
      const acknowledgement = shield.getByRole('button', {
        name: 'I’m shielded',
      });
      await expect(acknowledgement).toBeEnabled();
      await acknowledgement.click();
      await expect(shield).toBeHidden();
    }

    const help = page.getByTestId('game-help-disclosure');
    await expect(help).toBeVisible();
    await help.locator('summary').click();
    await expect(help).toHaveAttribute('open', '');

    const lastItem =
      phase === 'DEBATE'
        ? null
        : page.getByTestId('private-choice-list').getByRole('button').last();
    if (lastItem) await expect(lastItem).toBeAttached();

    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        const content = document.querySelector<HTMLElement>(
          '.game-help-disclosure__content',
        );
        if (content) content.scrollTop = 0;
      });
      const initialScrollY = await page.evaluate(() => window.scrollY);
      const helpContent = await help
        .locator('.game-help-disclosure__content')
        .boundingBox();
      expect(helpContent).not.toBeNull();
      if (testInfo.project.name === 'Pixel') {
        await page.mouse.move(
          helpContent!.x + helpContent!.width / 2,
          helpContent!.y + helpContent!.height / 2,
        );
        await page.mouse.wheel(0, 800);
        await expect
          .poll(() => page.evaluate(() => window.scrollY))
          .toBeGreaterThan(initialScrollY);
      }

      if (lastItem) {
        await lastItem.evaluate((element) =>
          element.scrollIntoView({ block: 'end' }),
        );
        const itemAndDock = await lastItem.evaluate((element) => {
          const dock = document.querySelector<HTMLElement>(
            '[data-testid="game-action-dock"], .game-action-bar',
          );
          if (!dock) throw new Error('The game action dock is not rendered.');
          return {
            itemBottom: element.getBoundingClientRect().bottom,
            dockTop: dock.getBoundingClientRect().top,
            pageScrollY: window.scrollY,
          };
        });
        expect(itemAndDock.pageScrollY).toBeGreaterThan(initialScrollY);
        expect(itemAndDock.itemBottom).toBeLessThanOrEqual(itemAndDock.dockTop);
      }
    }

    if (phase === 'DEBATE') {
      await page.getByRole('tab', { name: 'Players', exact: true }).click();
      const lastPlayer = page
        .getByTestId('players-roster-list')
        .locator('.player-tile')
        .last();
      await expect(lastPlayer).toBeVisible();
      for (const width of [320, 375, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        await lastPlayer.evaluate((element) =>
          element.scrollIntoView({ block: 'end' }),
        );
        const [playerBox, tabsBox] = await Promise.all([
          lastPlayer.boundingBox(),
          page.getByTestId('game-bottom-bar').boundingBox(),
        ]);
        expect(playerBox).not.toBeNull();
        expect(tabsBox).not.toBeNull();
        expect(playerBox!.y + playerBox!.height).toBeLessThanOrEqual(
          tabsBox!.y,
        );
      }
    }
  }
});

test('banishment re-vote lists tied seats and reports vote failures accurately', async ({
  page,
}) => {
  const gameId = 'vote-screen';
  await page.setViewportSize({ width: 320, height: 568 });
  const publicView = {
    ...createPublicView(gameId),
    phase: 'VOTE',
    revote: true,
    voteCandidates: ['seat-jamie', 'seat-practice-2'],
    viewerSeatId: 'seat-morgan',
    seats: [
      { id: 'seat-morgan', name: 'Morgan', status: 'alive' },
      { id: 'seat-alex', name: 'Alex', status: 'departed' },
      { id: 'seat-jamie', name: 'Jamie', status: 'alive' },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `seat-practice-${index + 1}`,
        name: `Practice player ${index + 1}`,
        status: 'alive' as const,
      })),
    ],
  } as FullView;
  const submittedCommands: unknown[] = [];
  let rejectNextVote = true;
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
      json: { serverNow: Date.now(), version: 12, view: publicView },
    }),
  );
  await page.route(`**/api/games/${gameId}/commands`, async (route) => {
    const submitted = route.request().postDataJSON() as { type?: string };
    submittedCommands.push(submitted);
    if (submitted.type === 'SubmitVote' && rejectNextVote) {
      rejectNextVote = false;
      await route.fulfill({
        status: 409,
        json: { error: 'Command rejected' },
      });
      return;
    }
    await route.fulfill({
      status: 200,
      json: { serverNow: Date.now(), version: 13, view: publicView },
    });
  });
  await page.route(`**/api/games/${gameId}/private-view`, (route) =>
    route.fulfill({
      status: 500,
      json: { error: 'A banishment vote must not request a private view.' },
    }),
  );

  const viewResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/games/${gameId}/view`) &&
      response.status() === 200,
  );
  await page.goto(`/game/${gameId}`);
  await viewResponse;

  const happening = page
    .getByTestId('game-tab-panel')
    .getByTestId('game-happening-card');
  await expect(happening).toHaveClass(/game-happening-card--accent/);
  await expect(happening).toContainText(
    'Tied vote. Choose again among the tied players.',
  );
  await expect(page.getByTestId('tie-revote-prompt')).toHaveText(
    'Tied players: Jamie and Practice player 2.',
  );
  await expect(
    page.getByRole('dialog', { name: 'Shield your screen' }),
  ).toHaveCount(0);
  await expect(page.getByTestId('button-hold-reveal')).toHaveCount(0);
  await expect(page.getByText('Your private role')).toHaveCount(0);
  const choiceList = page.getByTestId('private-choice-list');
  await expect(choiceList).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Jamie', exact: true }),
  ).toBeVisible();
  const displayedChoices = await choiceList
    .getByRole('button')
    .evaluateAll((buttons) =>
      buttons.map(
        (button) =>
          button.querySelector('span')?.textContent?.trim() ??
          button.textContent?.trim() ??
          '',
      ),
    );
  expect(displayedChoices.sort()).toEqual(
    [
      'Jamie',
      ...Array.from(
        { length: 10 },
        (_, index) => `Practice player ${index + 1}`,
      ),
    ].sort(),
  );
  await expect(
    page.getByText('Who do you vote to banish?', { exact: true }),
  ).toHaveCSS('color', 'rgb(38, 34, 29)');
  const tiedChoiceIds = new Set(['seat-jamie', 'seat-practice-2']);
  for (const choiceButton of await choiceList.getByRole('button').all()) {
    const choiceId = await choiceButton.getAttribute('data-choice-id');
    expect(choiceId).toBeTruthy();
    const visualState = await choiceButton.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        color: style.color,
        cursor: style.cursor,
        opacity: style.opacity,
      };
    });
    if (tiedChoiceIds.has(choiceId!)) {
      await expect(choiceButton).toBeEnabled();
      await expect(choiceButton).not.toHaveClass(/choice-action--unavailable/);
      expect(visualState.color).toBe('rgb(38, 34, 29)');
      expect(visualState.opacity).toBe('1');
      expect(visualState.cursor).not.toBe('not-allowed');
    } else {
      await expect(choiceButton).toBeDisabled();
      await expect(choiceButton).toHaveClass(/choice-action--unavailable/);
      expect(visualState.opacity).toBe('0.45');
      expect(visualState.cursor).toBe('not-allowed');
    }
  }
  const contentOverflow = await page
    .getByTestId('private-choice-content')
    .evaluate((element) => getComputedStyle(element).overflowY);
  expect(contentOverflow).not.toMatch(/auto|scroll/);
  // R5 item 25: genuine overflow scrolls the document, never an inner game pane.
  const scrolling = await page.locator('.game-shell-main').evaluate((main) => ({
    innerOverflow: getComputedStyle(main).overflowY,
    innerScroll: main.scrollHeight > main.clientHeight,
    documentHeight: document.scrollingElement!.scrollHeight,
    contentBottom: main.getBoundingClientRect().bottom + window.scrollY,
  }));
  expect(scrolling.innerOverflow).toBe('visible');
  expect(scrolling.innerScroll).toBe(false);
  expect(scrolling.documentHeight).toBeLessThanOrEqual(
    Math.ceil(scrolling.contentBottom),
  );
  const lastChoice = page
    .getByTestId('private-choice-list')
    .getByRole('button')
    .last();
  await lastChoice.evaluate((element) =>
    element.scrollIntoView({ block: 'center' }),
  );
  const lastChoiceBounds = await lastChoice.boundingBox();
  const footer = page.getByTestId('brand-footer-shell');
  await expect(footer).toHaveCount(0);
  expect(lastChoiceBounds!.y).toBeGreaterThanOrEqual(0);
  expect(lastChoiceBounds!.y + lastChoiceBounds!.height).toBeLessThanOrEqual(
    page.viewportSize()?.height ?? 720,
  );
  await expect(
    page.getByRole('button', { name: 'Morgan', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Alex', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Jamie', exact: true }).click();
  await expect(
    page.getByText('Your pick: Jamie', { exact: true }),
  ).toBeVisible();
  await expectOnlyCurrentChoiceIdStored(page, 'VOTE', 'seat-jamie');
  await expect(
    choiceList.getByRole('button', { name: 'Jamie', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('button', { name: 'Practice player 2', exact: true })
    .click();
  await expect(
    page.getByText('Your pick: Practice player 2', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Jamie', exact: true }).click();
  await expect(
    page.getByText('Your pick: Jamie', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Review this choice' }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(
    page.getByText(
      'Your vote was not recorded. The game may have moved on; please try again.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText('Please choose someone else.', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Jamie', exact: true }).click();
  await page.getByRole('button', { name: 'Review this choice' }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();

  await expect
    .poll(() => submittedCommands)
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'SubmitVote', target: 'seat-jamie' }),
        expect.objectContaining({ type: 'AcknowledgePrivate' }),
      ]),
    );
  await expect(
    page.getByText('Thanks. Waiting for everyone.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Thanks. Waiting for everyone.', { exact: true }),
  ).toHaveCount(1);
});

test('Round 7 Stage 2B Vote, Revote and Verdict screenshots', async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.R7_STAGE_2B_CAPTURE !== '1',
    'Set R7_STAGE_2B_CAPTURE=1 to regenerate the reviewed screenshot set.',
  );
  test.skip(testInfo.project.name !== 'Pixel', 'Capture the gallery once.');
  test.setTimeout(180_000);

  const gameId = 'round-7-stage-2b-gallery';
  const baseView = createPublicView(gameId);
  const seats = [
    { id: 'seat-morgan', name: 'Morgan', status: 'alive' as const },
    { id: 'seat-alex', name: 'Alex', status: 'alive' as const },
    { id: 'seat-blair', name: 'Blair', status: 'alive' as const },
    { id: 'seat-jamie', name: 'Jamie', status: 'alive' as const },
  ];
  type GalleryState =
    'vote' | 'revote' | 'verdict-banished' | 'verdict-no-votes';
  const galleryStates: GalleryState[] = [
    'vote',
    'revote',
    'verdict-banished',
    'verdict-no-votes',
  ];
  const widths = [320, 375, 390, 430, 1280];
  const directory = 'docs/screens/round-7-stage-2b';
  await mkdir(directory, { recursive: true });

  let view: FullView = baseView;
  let socketSequence = 0;
  const socketDiagnostics: string[] = [];
  const pendingPolls = new Map<string, (packet: string) => void>();
  const queuedPackets = new Map<string, string[]>();
  const replyToPoll = (sid: string, packet: string) => {
    const waiting = pendingPolls.get(sid);
    if (waiting) {
      pendingPolls.delete(sid);
      socketDiagnostics.push('fulfilled a pending Socket.IO poll');
      waiting(packet);
      return;
    }
    socketDiagnostics.push('queued a Socket.IO packet');
    queuedPackets.set(sid, [...(queuedPackets.get(sid) ?? []), packet]);
  };
  const viewFor = (state: GalleryState): FullView => {
    const isVote = state === 'vote' || state === 'revote';
    const isBanishment = state === 'verdict-banished';
    return {
      ...baseView,
      phase: isVote ? 'VOTE' : isBanishment ? 'DAWN' : 'VERDICT',
      revote: state === 'revote',
      deadline: null,
      missionsEnabled: false,
      seats: isBanishment
        ? [
            seats[0],
            { ...seats[1], status: 'departed' as const },
            seats[2],
            seats[3],
          ]
        : seats,
      voteCandidates: state === 'revote' ? ['seat-alex', 'seat-blair'] : [],
      publicAnnouncement:
        state === 'verdict-no-votes'
          ? { kind: 'no_votes', cycle: baseView.cycle }
          : isBanishment
            ? {
                kind: 'verdict',
                cycle: baseView.cycle,
                seat: { id: 'seat-alex', name: 'Alex', role: 'traitor' },
              }
            : null,
      votedSeatIds: [],
      ballots: {},
    } as FullView;
  };
  for (const state of galleryStates) {
    const validation = fullViewSchema.safeParse(viewFor(state));
    expect(
      validation.success,
      validation.success
        ? undefined
        : `Invalid ${state} screenshot view: ${validation.error.issues
            .map((issue) => `${issue.path.join('.')}:${issue.message}`)
            .join('; ')}`,
    ).toBe(true);
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  page.on('close', () => {
    for (const resolve of pendingPolls.values()) resolve('6');
    pendingPolls.clear();
  });
  // The screenshot fixture supplies a valid public game:view over Socket.IO
  // polling, so the shared header is genuinely rendered in its Live state.
  await page.route('**/socket.io**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const sid = url.searchParams.get('sid');
    socketDiagnostics.push(
      `${request.method()} ${url.pathname} transport=${url.searchParams.get('transport') ?? 'none'} sid=${sid ? 'present' : 'absent'}`,
    );
    if (request.method() === 'GET' && !sid) {
      for (const resolve of pendingPolls.values()) resolve('6');
      pendingPolls.clear();
      const nextSid = `stage-2b-${++socketSequence}`;
      queuedPackets.set(nextSid, []);
      await route.fulfill({
        contentType: 'text/plain; charset=UTF-8',
        body: `0${JSON.stringify({
          sid: nextSid,
          upgrades: [],
          pingInterval: 600_000,
          pingTimeout: 60_000,
          maxPayload: 1_000_000,
        })}`,
      });
      return;
    }
    if (!sid) {
      await route.fulfill({ status: 400, body: 'Missing session.' });
      return;
    }
    if (request.method() === 'GET') {
      const packet = queuedPackets.get(sid)?.shift();
      if (packet) {
        await route.fulfill({
          contentType: 'text/plain; charset=UTF-8',
          body: packet,
        });
      } else {
        const nextPacket = await new Promise<string>((resolve) => {
          pendingPolls.set(sid, resolve);
        });
        await route
          .fulfill({
            contentType: 'text/plain; charset=UTF-8',
            body: nextPacket,
          })
          .catch(() => {});
      }
      return;
    }

    const body = (request.postData() ?? '').replace(/^\d+:/, '');
    if (body.startsWith('40')) {
      socketDiagnostics.push('POST Socket.IO connect');
      replyToPoll(sid, `40${JSON.stringify({ sid: `${sid}-namespace` })}`);
    } else if (body.startsWith('42')) {
      const [eventName] = JSON.parse(body.slice(2)) as [string, unknown];
      if (eventName === 'game:watch') {
        socketDiagnostics.push('POST Socket.IO watch');
        const response = {
          serverNow: Date.now(),
          version: view.version,
          view,
        };
        const validation = gameViewResponseSchema.safeParse(response);
        socketDiagnostics.push(
          validation.success
            ? 'public view schema accepted'
            : `public view schema rejected at ${validation.error.issues.map((issue) => issue.path.join('.')).join(',')}`,
        );
        replyToPoll(sid, `42${JSON.stringify(['game:view', response])}`);
      }
    }
    await route.fulfill({
      contentType: 'text/plain; charset=UTF-8',
      body: 'ok',
    });
  });
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-csrf' } }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );
  await page.route(`**/api/games/${gameId}/commands`, (route) =>
    route.fulfill({
      json: {
        serverNow: Date.now(),
        version: view.version + 1,
        view: { ...view, version: view.version + 1 },
      },
    }),
  );
  await page.route(`**/api/games/${gameId}/join-requests`, (route) =>
    route.fulfill({ json: { requests: [] } }),
  );
  await page.route(`**/api/games/${gameId}/private-view`, (route) =>
    route.fulfill({ status: 500, json: { error: 'Not a private phase.' } }),
  );

  for (const state of galleryStates) {
    view = viewFor(state);
    for (const width of widths) {
      const height =
        width === 320 ? 640 : width === 375 ? 667 : width === 1280 ? 900 : 844;
      await page.setViewportSize({ width, height });
      await page.goto(`/game/${gameId}`);
      await expect(page.getByTestId('player-game')).toHaveAttribute(
        'data-phase',
        view.phase,
      );
      await expect(
        page.getByRole('status', { name: 'Connection status' }),
        `Socket handshake diagnostics: ${socketDiagnostics.join('; ')}`,
      ).toHaveText('Live', { timeout: 30_000 });
      if (state === 'vote' || state === 'revote') {
        const alex = page.getByRole('button', { name: 'Alex', exact: true });
        await expect(alex).toBeVisible();
        await alex.click();
        await expect(page.getByText('Selected', { exact: true })).toBeVisible();
      }

      for (const theme of ['day', 'night'] as const) {
        await page.locator('.game-shell').evaluate((element, value) => {
          (element as HTMLElement).dataset.gameTheme = value;
        }, theme);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `${directory}/${state}-${theme}-${width}.jpg`,
          type: 'jpeg',
          quality: 86,
          fullPage: false,
        });
      }
    }
  }
});

test('Notes requests during SHADOW retain their purpose without acknowledging the night', async ({
  page,
}) => {
  const gameId = 'shadow-notes-purpose';
  const view: FullView = {
    ...createPublicView(gameId),
    phase: 'SHADOW',
    shadowRound: 1,
    shadowSlot: 1,
  };
  // A departed seat sees the public room during SHADOW, not the night shield.
  view.seats = view.seats.map((seat) =>
    seat.id === view.viewerSeatId ? { ...seat, status: 'departed' } : seat,
  );
  let notesRequests = 0;
  const commands: unknown[] = [];
  await page.route('**/socket.io/**', (route) => route.abort());
  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      json: { csrfToken: 'test-csrf' },
      headers: {
        'Set-Cookie': 'oathstone-csrf=test-csrf; Path=/; SameSite=Strict',
      },
    }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );
  await page.route(`**/api/games/${gameId}/commands`, (route) => {
    commands.push(route.request().postDataJSON());
    return route.fulfill({ status: 409, json: { error: 'Command rejected' } });
  });
  await page.route(`**/api/games/${gameId}/private-view`, (route) => {
    expect(route.request().postDataJSON()).toEqual({ purpose: 'notes' });
    notesRequests += 1;
    // Preserve the server's independent eligibility gate for departed seats.
    return route.fulfill({
      status: 409,
      json: { error: 'Private view unavailable' },
    });
  });
  await page.goto(`/game/${gameId}`);
  const rejectedNotes = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/games/${gameId}/private-view`) &&
      response.status() === 409,
  );
  await page.getByTestId('button-open-notes').click();
  await rejectedNotes;
  expect(notesRequests).toBe(1);
  expect(commands).toEqual([]);
  await expect(page.getByTestId('private-choice-content')).toBeHidden();
  await expect(
    page.getByRole('dialog', { name: 'Shield your screen' }),
  ).toBeHidden();
});

test('a shielded night automatically recovers a stale private view after delayed new-window acknowledgement', async ({
  page,
}) => {
  const gameId = 'shadow-window-recovery';
  let view: FullView = {
    ...createPublicView(gameId),
    phase: 'SHADOW',
    cycle: 1,
    shadowRound: 1,
    shadowSlot: 1,
    progress: { done: 0, total: 2 },
  };
  view.seats.push({ id: 'seat-sam', name: 'Sam', status: 'alive' });
  let acknowledged = false;
  let acknowledgementStarted = false;
  let releaseAcknowledgement!: () => void;
  const acknowledgementGate = new Promise<void>((resolve) => {
    releaseAcknowledgement = resolve;
  });
  let unacknowledgedReads = 0;
  let roundTwoReads = 0;
  let holdOldRead = false;
  let oldReadStarted = false;
  let releaseOldRead!: () => void;
  const oldReadGate = new Promise<void>((resolve) => {
    releaseOldRead = resolve;
  });
  await page.route('**/socket.io/**', (route) => route.abort());
  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      json: { csrfToken: 'test-csrf' },
      headers: {
        'Set-Cookie': 'oathstone-csrf=test-csrf; Path=/; SameSite=Strict',
      },
    }),
  );
  const envelope = () => ({
    serverNow: Date.now(),
    version: view.version,
    view,
  });
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({ json: envelope() }),
  );
  await page.route(`**/api/games/${gameId}/commands`, async (route) => {
    expect(route.request().postDataJSON().type).toBe('AcknowledgePrivate');
    if (view.shadowRound === 2) {
      acknowledgementStarted = true;
      await acknowledgementGate;
    }
    acknowledged = true;
    view = { ...view, version: view.version + 1 };
    await route.fulfill({ json: envelope() });
  });
  await page.route(`**/api/games/${gameId}/private-view`, async (route) => {
    if (!acknowledged) {
      unacknowledgedReads += 1;
      await route.fulfill({
        status: 409,
        json: { error: 'Private view unavailable' },
      });
      return;
    }
    if (view.shadowRound === 2 && ++roundTwoReads === 1) {
      await route.fulfill({
        status: 409,
        json: {
          error:
            'The game changed while opening the private screen. Refresh and try again.',
        },
      });
      return;
    }
    const responseView = view;
    if (holdOldRead && responseView.shadowRound === 1) {
      oldReadStarted = true;
      await oldReadGate;
    }
    await route.fulfill({
      json: {
        serverNow: Date.now(),
        version: responseView.version,
        view: {
          ...responseView,
          private: {
            role: 'faithful',
            team: [],
            options:
              responseView.shadowRound === 1
                ? [{ id: 'seat-jamie', name: 'Jamie' }]
                : [{ id: 'seat-sam', name: 'Sam' }],
            choices: {},
            choiceSlots: [],
            chat: [],
            task: null,
            minimumDurationMs: 5000,
          },
        },
      },
    });
  });
  await page.goto(`/game/${gameId}`);
  const shield = page.getByRole('dialog', { name: 'Shield your screen' });
  const confirmShield = shield.getByRole('button', { name: /i’m shielded/i });
  await expect(confirmShield).toHaveAttribute('aria-disabled', 'false', {
    timeout: 6500,
  });
  await confirmShield.click();
  await expect(page.getByTestId('private-choice-content')).toBeVisible();
  holdOldRead = true;
  view = { ...view, version: view.version + 1 };
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => oldReadStarted).toBe(true);
  acknowledged = false;
  view = { ...view, version: view.version + 1, shadowRound: 2 };
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => acknowledgementStarted).toBe(true);
  await expect(page.getByTestId('player-game')).toHaveAttribute(
    'data-shadow-round',
    '2',
  );
  await expect(shield).toBeHidden();
  releaseAcknowledgement();
  await expect.poll(() => roundTwoReads).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('private-choice-content')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Sam', exact: true }),
  ).toBeEnabled();
  const oldResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/games/${gameId}/private-view`) &&
      response.status() === 200,
  );
  releaseOldRead();
  await (await oldResponse).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(
    page.getByRole('button', { name: 'Sam', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Jamie', exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Tap to see your private screen again' }),
  ).toBeHidden();
  await expect(shield).toBeHidden();
  expect(unacknowledgedReads).toBe(0);
});

for (const role of ['faithful', 'traitor'] as const) {
  test(`late slot-one acknowledgement cannot hide slot-two controls (${role})`, async ({
    page,
  }) => {
    const gameId = 'shadow-late-ack';
    let view = {
      ...createPublicView(gameId),
      phase: 'SHADOW',
      shadowRound: 1,
      shadowSlot: 1,
      murderSlots: 2,
      progress: { done: 0, total: 2 },
    } as FullView;
    let submitted = false;
    let releaseAcknowledgement!: () => void;
    const acknowledgementGate = new Promise<void>((resolve) => {
      releaseAcknowledgement = resolve;
    });
    const envelope = () => ({
      serverNow: Date.now(),
      version: view.version,
      view,
    });
    await page.route('**/api/csrf', (route) =>
      route.fulfill({ json: { csrfToken: 'test-csrf' } }),
    );
    await page.route(`**/api/games/${gameId}/view`, (route) =>
      route.fulfill({ json: envelope() }),
    );
    await page.route(`**/api/games/${gameId}/commands`, async (route) => {
      const command = route.request().postDataJSON();
      if (command.type === 'SubmitShadowChoice') submitted = true;
      else if (submitted && view.shadowSlot === 1) {
        const response = envelope();
        view = { ...view, version: view.version + 1, shadowSlot: 2 };
        await acknowledgementGate;
        await route.fulfill({ json: response });
        return;
      }
      await route.fulfill({ json: envelope() });
    });
    await page.route(`**/api/games/${gameId}/private-view`, (route) =>
      route.fulfill({
        json: {
          ...envelope(),
          view: {
            ...view,
            private: {
              role,
              team: [],
              options: [{ id: 'seat-jamie', name: 'Jamie' }],
              choices: {},
              choiceSlots: [],
              chat: [],
              task: null,
              minimumDurationMs: 5000,
            },
          },
        },
      }),
    );
    await page.goto(`/game/${gameId}`);
    const shield = page.getByRole('dialog', { name: 'Shield your screen' });
    const shieldButton = shield.getByRole('button', { name: /i’m shielded/i });
    await expect(shieldButton).toHaveAttribute('aria-disabled', 'false', {
      timeout: 6500,
    });
    await shieldButton.click();
    await page.getByTestId('private-choice-list').getByRole('button').click();
    await page.getByRole('button', { name: 'Review this choice' }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect.poll(() => view.shadowSlot).toBe(2);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByTestId('player-game')).toHaveAttribute(
      'data-shadow-slot',
      '2',
    );
    await expect(page.getByTestId('private-choice-list')).toBeVisible();
    const lateResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/games/${gameId}/commands`) &&
        response.request().postDataJSON().type === 'AcknowledgePrivate' &&
        response.status() === 200,
    );
    releaseAcknowledgement();
    await (await lateResponse).finished();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.getByTestId('waiting-for-everyone')).toBeHidden();
    await page.getByTestId('private-choice-list').getByRole('button').click();
    await expect(
      page.getByRole('button', { name: 'Review this choice' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Review this choice' }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByTestId('waiting-for-everyone')).toBeVisible();
  });

  test(
    role === 'traitor'
      ? 'shadow explicitly refuses fellow Traitor Jamie, then accepts Faithful Sam'
      : 'shadow choices appear after shielding without a hold and complete privately',
    async ({ page }) => {
      const gameId = 'shadow-choice';
      const publicView = {
        ...createPublicView(gameId),
        phase: 'SHADOW',
        shadowRound: 1,
        shadowSlot: 2,
        murderSlots: 2,
        progress: { done: 0, total: 3 },
      } as FullView;
      publicView.seats.push({ id: 'seat-sam', name: 'Sam', status: 'alive' });
      publicView.seats.push({
        id: 'seat-taylor',
        name: 'Taylor',
        status: 'alive',
      });
      let privateRequests = 0;
      const privateFlow: string[] = [];
      const submittedCommands: unknown[] = [];
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
          json: { serverNow: Date.now(), version: 12, view: publicView },
        }),
      );
      await page.route(`**/api/games/${gameId}/commands`, async (route) => {
        const command = route.request().postDataJSON();
        submittedCommands.push(command);
        privateFlow.push(`command:${command.type}`);
        if (
          role === 'traitor' &&
          command.type === 'SubmitShadowChoice' &&
          command.choice === 'seat-jamie'
        ) {
          await route.fulfill({
            status: 409,
            json: { error: 'Command rejected' },
          });
          return;
        }
        await route.fulfill({
          status: 200,
          json: { serverNow: Date.now(), version: 13, view: publicView },
        });
      });
      await page.route(`**/api/games/${gameId}/private-view`, async (route) => {
        privateRequests += 1;
        privateFlow.push('private-view');
        await route.fulfill({
          status: 200,
          json: {
            serverNow: Date.now(),
            version: 13,
            view: {
              ...publicView,
              private: {
                role,
                team:
                  role === 'traitor'
                    ? [
                        { id: 'seat-morgan', name: 'Morgan', role: 'traitor' },
                        { id: 'seat-jamie', name: 'Jamie', role: 'traitor' },
                      ]
                    : [],
                options: [
                  { id: 'seat-jamie', name: 'Jamie' },
                  { id: 'seat-sam', name: 'Sam' },
                  { id: 'seat-taylor', name: 'Taylor' },
                ],
                choices: {},
                choiceSlots:
                  role === 'traitor'
                    ? [
                        {
                          slot: 1,
                          round: 1,
                          picks: [{ seatId: 'seat-jamie', choice: 'seat-sam' }],
                        },
                        {
                          slot: 2,
                          round: 1,
                          picks: [
                            { seatId: 'seat-jamie', choice: 'seat-taylor' },
                          ],
                        },
                      ]
                    : [],
                chat: [],
                task: null,
                minimumDurationMs: 5000,
              },
            },
          },
        });
      });

      const viewResponse = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/games/${gameId}/view`) &&
          response.status() === 200,
      );
      await page.goto(`/game/${gameId}`);
      await viewResponse;
      const shieldConfirmation = page
        .locator('dialog.privacy-shield')
        .getByRole('button', { name: /i’m shielded/i });
      await expect(shieldConfirmation).toHaveAttribute(
        'aria-disabled',
        'false',
        {
          timeout: 6500,
        },
      );
      await shieldConfirmation.click();
      await expect.poll(() => privateRequests).toBe(1);
      expect(privateFlow.slice(0, 2)).toEqual([
        'command:AcknowledgePrivate',
        'private-view',
      ]);
      await expect(page.getByTestId('private-choice-content')).toBeVisible();
      await expect(page.getByTestId('button-hold-reveal')).toHaveCount(0);
      await expect(
        page.getByText(
          role === 'traitor'
            ? 'Who will the Traitors take tonight?'
            : 'Who do you think the Traitors will take tonight?',
          { exact: true },
        ),
      ).toBeVisible();
      const candleColor = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--candle)';
        document.querySelector('.game-shell')!.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      });
      await expect(page.getByTestId('shadow-slot-label')).toHaveCSS(
        'color',
        candleColor,
      );
      const nightPrompt = page.getByText(
        role === 'traitor'
          ? 'Who will the Traitors take tonight?'
          : 'Who do you think the Traitors will take tonight?',
        { exact: true },
      );
      await expect(nightPrompt).toHaveCSS('color', candleColor);
      const nightChoices = page
        .getByTestId('private-choice-list')
        .getByRole('button');
      await expect(nightChoices.first()).toBeEnabled();
      await expect(nightChoices.first()).toHaveCSS('cursor', 'pointer');
      await expect(nightChoices.first()).toHaveCSS('opacity', '1');
      await expect(nightChoices.first()).toHaveCSS('color', candleColor);
      const shadowStatusLines = page.getByTestId('shadow-status').locator('p');
      await expect(shadowStatusLines).toHaveCount(4);
      await expect(shadowStatusLines.nth(0)).toHaveText(
        role === 'traitor'
          ? "You haven't picked yet"
          : "You haven't guessed yet",
      );
      await expect(shadowStatusLines.nth(1)).toHaveText(
        role === 'traitor'
          ? 'Jamie picked: 1st: Sam · 2nd: Taylor'
          : 'Guesses stay secret until the end.',
      );
      await expect(shadowStatusLines.nth(2)).toHaveText(
        role === 'traitor' ? '' : 'Think about who the Traitors fear most.',
      );
      await expect(shadowStatusLines.nth(3)).toHaveText(
        role === 'traitor'
          ? 'You can change your pick until the night ends.'
          : 'You can change your guess until the night ends.',
      );
      await expect(page.getByText(/round [12]/i)).toHaveCount(0);
      await expect(page.getByTestId('shadow-slot-label')).toHaveText(
        'Second choice',
      );
      await expect(
        page.getByRole('button', { name: 'Morgan', exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Alex', exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Jamie', exact: true }),
      ).toBeEnabled();
      await page.getByRole('button', { name: 'Jamie', exact: true }).click();
      await expect(
        page.getByText('Your pick: Jamie', { exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Review this choice' }).click();
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();
      if (role === 'traitor') {
        await expect(
          page.getByText('Please choose someone else.', { exact: true }),
        ).toBeVisible();
        await expect(page.getByTestId('waiting-for-everyone')).toHaveCount(0);
        expect(submittedCommands).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'SubmitShadowChoice',
              choice: 'seat-jamie',
            }),
          ]),
        );
        await page.getByRole('button', { name: 'Sam', exact: true }).click();
        await page.getByRole('button', { name: 'Review this choice' }).click();
        await page
          .getByRole('button', { name: 'Confirm', exact: true })
          .click();
      }
      await expect
        .poll(() => submittedCommands)
        .toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'SubmitShadowChoice',
              choice: role === 'traitor' ? 'seat-sam' : 'seat-jamie',
            }),
            expect.objectContaining({ type: 'AcknowledgePrivate' }),
          ]),
        );
      await expect(
        page.getByText('Thanks. Waiting for everyone.', { exact: true }),
      ).toBeVisible();
    },
  );
}

test('banishment votes are alphabetical while night choices stay shuffled per seat', async ({
  page,
  browser,
}) => {
  const otherPage = await browser.newPage({
    viewport: page.viewportSize() ?? { width: 402, height: 874 },
  });
  const roster = [
    { id: 'seat-morgan', name: 'Morgan', status: 'alive' },
    { id: 'seat-alex', name: 'Alex', status: 'alive' },
    { id: 'seat-jamie', name: 'Jamie', status: 'alive' },
    { id: 'seat-sam', name: 'Sam', status: 'alive' },
    { id: 'seat-riley', name: 'Riley', status: 'alive' },
    { id: 'seat-taylor', name: 'Taylor', status: 'alive' },
    { id: 'seat-casey', name: 'Casey', status: 'alive' },
    { id: 'seat-jordan', name: 'Jordan', status: 'alive' },
  ] as const;
  const canonicalOptions = [
    'Alex',
    'Sam',
    'Riley',
    'Taylor',
    'Casey',
    'Jordan',
  ];
  const configureTraitorPage = async (
    targetPage: Page,
    gameId: string,
    viewerSeatId: string,
    phase: 'SHADOW' | 'VOTE' | 'FINAL_BANISH' = 'SHADOW',
  ) => {
    const publicView = {
      ...createPublicView(gameId),
      phase,
      viewerSeatId,
      seats: roster.map((seat) => ({ ...seat })),
    } as FullView;
    await targetPage.route('**/api/csrf', (route) =>
      route.fulfill({
        status: 200,
        headers: {
          'Set-Cookie': 'oathstone-csrf=test-csrf; Path=/; SameSite=Strict',
        },
        json: { csrfToken: 'test-csrf' },
      }),
    );
    await targetPage.route(`**/api/games/${gameId}/view`, (route) =>
      route.fulfill({
        status: 200,
        json: { serverNow: Date.now(), version: 12, view: publicView },
      }),
    );
    await targetPage.route(`**/api/games/${gameId}/commands`, (route) =>
      route.fulfill({
        status: 200,
        json: { serverNow: Date.now(), version: 13, view: publicView },
      }),
    );
    await targetPage.route(`**/api/games/${gameId}/private-view`, (route) =>
      route.fulfill({
        status: 200,
        json: {
          serverNow: Date.now(),
          version: 12,
          view: {
            ...publicView,
            private: {
              role: 'traitor',
              team: [],
              options: canonicalOptions.map((name) => ({
                id: `seat-${name.toLowerCase()}`,
                name,
              })),
              choices: {},
              choiceSlots: [],
              chat: [],
              task: null,
              minimumDurationMs: 0,
            },
          },
        },
      }),
    );
    await targetPage.goto(`/game/${gameId}`);
    if (phase === 'SHADOW') {
      const shield = targetPage
        .getByRole('dialog', { name: 'Shield your screen' })
        .getByRole('button', { name: /i’m shielded/i });
      await expect(shield).toHaveAttribute('aria-disabled', 'false', {
        timeout: 6500,
      });
      await shield.click();
    } else {
      await expect(
        targetPage.getByRole('dialog', { name: 'Shield your screen' }),
      ).toHaveCount(0);
    }
    await expect(targetPage.getByTestId('private-choice-list')).toBeVisible();
    return targetPage
      .getByTestId('private-choice-list')
      .getByRole('button')
      .evaluateAll((buttons) =>
        buttons.map(
          (button) =>
            button.querySelector('span')?.textContent?.trim() ??
            button.textContent?.trim() ??
            '',
        ),
      );
  };

  const isCanonicalRotation = (order: string[]) =>
    canonicalOptions.some((_, offset) =>
      order.every(
        (name, index) =>
          name === canonicalOptions[(index + offset) % canonicalOptions.length],
      ),
    );
  const expectedBanishmentOrder = (viewerSeatId: string) =>
    roster
      .filter((seat) => seat.status === 'alive' && seat.id !== viewerSeatId)
      .map((seat) => seat.name)
      .sort((left, right) =>
        left.localeCompare(right, 'en-GB', { sensitivity: 'base' }),
      );
  try {
    const [morganOrder, jamieOrder] = await Promise.all([
      configureTraitorPage(page, 'shadow-order-game', 'seat-morgan'),
      configureTraitorPage(otherPage, 'shadow-order-game', 'seat-jamie'),
    ]);
    expect(morganOrder.slice().sort()).toEqual(jamieOrder.slice().sort());
    expect(morganOrder).not.toEqual(jamieOrder);
    expect(isCanonicalRotation(morganOrder)).toBe(false);
    expect(isCanonicalRotation(jamieOrder)).toBe(false);

    const [morganVoteOrder, jamieVoteOrder] = await Promise.all([
      configureTraitorPage(page, 'vote-order-game', 'seat-morgan', 'VOTE'),
      configureTraitorPage(otherPage, 'vote-order-game', 'seat-jamie', 'VOTE'),
    ]);
    expect(morganVoteOrder).toEqual(expectedBanishmentOrder('seat-morgan'));
    expect(jamieVoteOrder).toEqual(expectedBanishmentOrder('seat-jamie'));

    const [morganFinalOrder, jamieFinalOrder] = await Promise.all([
      configureTraitorPage(
        page,
        'final-banish-order-game',
        'seat-morgan',
        'FINAL_BANISH',
      ),
      configureTraitorPage(
        otherPage,
        'final-banish-order-game',
        'seat-jamie',
        'FINAL_BANISH',
      ),
    ]);
    expect(morganFinalOrder).toEqual(expectedBanishmentOrder('seat-morgan'));
    expect(jamieFinalOrder).toEqual(expectedBanishmentOrder('seat-jamie'));
  } finally {
    await otherPage.close();
  }
});

test('Notes have the same geometry and colours for Traitor and Faithful', async ({
  page,
  browser,
}) => {
  const otherPage = await browser.newPage({
    viewport: page.viewportSize() ?? { width: 402, height: 874 },
  });
  try {
    for (const palette of ['day', 'night'] as const) {
      const [faithfulSnapshot, traitorSnapshot] = await Promise.all([
        revealNotes(page, 'notes-faithful', 'faithful', palette),
        revealNotes(otherPage, 'notes-traitor', 'traitor', palette),
      ]);
      expect(traitorSnapshot).toEqual(faithfulSnapshot);
    }
  } finally {
    await otherPage.close();
  }
});

test('mobile players retain an unfinished private night choice after backgrounding', async ({
  page,
}, testInfo) => {
  test.skip(
    !['Pixel', 'iPhone'].includes(testInfo.project.name),
    'Night-choice recovery is checked on Android Chrome and iPhone WebKit.',
  );

  const gameId = 'away-night-choice';
  let simulatedNow = Date.now();
  await page.clock.install({ time: new Date(simulatedNow) });
  let view = {
    ...createPublicView(gameId),
    phase: 'SHADOW',
    shadowSlot: 1,
    murderSlots: 1,
    deadline: simulatedNow + 48 * 60 * 60 * 1_000,
  } as FullView;
  const privateData = {
    role: 'traitor' as const,
    team: [{ id: 'seat-morgan', name: 'Morgan', role: 'traitor' as const }],
    options: [
      { id: 'seat-jamie', name: 'Jamie' },
      { id: 'seat-alex', name: 'Alex' },
    ],
    choices: {},
    choiceSlots: [],
    chat: [],
    task: null,
    minimumDurationMs: 0,
  };
  const envelope = () => ({
    serverNow: Date.now(),
    version: view.version,
    view,
  });

  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-csrf' } }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({ json: envelope() }),
  );
  await page.route(`**/api/games/${gameId}/commands`, (route) =>
    route.fulfill({ json: envelope() }),
  );
  await page.route(`**/api/games/${gameId}/private-view`, (route) =>
    route.fulfill({
      json: {
        ...envelope(),
        view: { ...view, private: privateData },
      },
    }),
  );

  await page.goto(`/game/${gameId}`);
  const shieldDialog = page.getByRole('dialog', { name: 'Shield your screen' });
  const gameTab = page.getByRole('tab', { name: 'Game', exact: true });
  const playersTab = page.getByRole('tab', { name: 'Players', exact: true });
  const playersPanel = page.getByTestId('players-tab-panel');
  await expect(shieldDialog).toBeVisible();
  await playersTab.click();
  await expect(playersPanel).toBeVisible();
  await expect(shieldDialog).toHaveCount(0);
  await gameTab.click();
  await expect(shieldDialog).toBeVisible();
  await page.clock.fastForward(3_000);
  await page.getByRole('button', { name: 'I’m shielded' }).click();
  const choices = page.getByTestId('private-choice-list');
  await expect(choices).toBeVisible();
  await choices.getByRole('button', { name: 'Jamie', exact: true }).click();
  await expect(
    page.getByText('Your pick: Jamie', { exact: true }),
  ).toBeVisible();
  await expectOnlyCurrentChoiceIdStored(page, 'SHADOW', 'seat-jamie');
  await playersTab.click();
  await expect(playersPanel).toBeVisible();
  await expect(
    page.getByText('Your pick: Jamie', { exact: true }),
  ).toBeHidden();
  await gameTab.click();
  await expect(choices).toBeVisible();
  await expect(
    page.getByText('Your pick: Jamie', { exact: true }),
  ).toBeVisible();
  await expectOnlyCurrentChoiceIdStored(page, 'SHADOW', 'seat-jamie');

  const awayCases = [
    { durationMs: 30_000, suspend: 'visibility', resume: 'visibility' },
    { durationMs: 5 * 60_000, suspend: 'pagehide', resume: 'pageshow' },
    { durationMs: 60 * 60_000, suspend: 'offline', resume: 'online' },
    {
      durationMs: 12 * 60 * 60_000,
      suspend: 'visibility',
      resume: 'visibility',
    },
  ] as const;

  for (const [index, awayCase] of awayCases.entries()) {
    await page.evaluate((eventName) => {
      if (eventName === 'visibility') {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      } else {
        window.dispatchEvent(new Event(eventName));
      }
    }, awayCase.suspend);
    await expect(choices).toHaveCount(0);

    simulatedNow += awayCase.durationMs;
    await page.clock.setFixedTime(new Date(simulatedNow));
    const latestSeq = Math.max(...view.publicLog.map((entry) => entry.seq));
    const guestName = `Night guest ${index + 1}`;
    view = {
      ...view,
      version: view.version + 1,
      deadline: simulatedNow + 48 * 60 * 60 * 1_000,
      publicLog: [
        ...view.publicLog,
        {
          seq: latestSeq + 1,
          at: simulatedNow,
          action: 'seat_departed',
          seat: { id: `seat-night-away-${index + 1}`, name: guestName },
        },
      ],
    };

    await page.evaluate((eventName) => {
      if (eventName === 'visibility') {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'visible',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      } else {
        window.dispatchEvent(new Event(eventName));
      }
    }, awayCase.resume);

    await expect(page.getByTestId('player-game')).toHaveAttribute(
      'data-version',
      String(view.version),
    );
    const awayCard = page.getByTestId('while-away-card');
    await expect(awayCard).toContainText(
      `${guestName} was marked as departed.`,
    );
    await awayCard.getByRole('button', { name: 'Back to the game' }).click();
    await page
      .getByRole('button', { name: 'Tap to see your private screen again' })
      .click();
    await expect(page.getByTestId('private-choice-list')).toBeVisible();
    await expect(
      page.getByText('Your pick: Jamie', { exact: true }),
    ).toBeVisible();
    await expectOnlyCurrentChoiceIdStored(page, 'SHADOW', 'seat-jamie');
  }

  for (const viewport of [
    { width: 844, height: 390 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('orientationchange'));
    });
    await expect(page.getByTestId('private-choice-list')).toBeVisible();
    await expect(
      page.getByText('Your pick: Jamie', { exact: true }),
    ).toBeVisible();
  }
});

test('mobile players hide a held role on background and never store it', async ({
  page,
}, testInfo) => {
  test.skip(
    !['Pixel', 'iPhone'].includes(testInfo.project.name),
    'Private role hiding is checked on Android Chrome and iPhone WebKit.',
  );

  const gameId = 'away-private-role';
  let simulatedNow = Date.now();
  let view = {
    ...createPublicView(gameId),
    phase: 'DEAL',
    deadline: simulatedNow + 48 * 60 * 60 * 1_000,
  } as FullView;
  const privateData = {
    role: 'faithful' as const,
    team: [],
    options: [],
    choices: {},
    choiceSlots: [],
    chat: [],
    task: {
      kind: 'task' as const,
      instruction: 'PRIVATE_TASK_SENTINEL',
      report: null,
      murderLost: false,
    },
    minimumDurationMs: 0,
  };

  await page.clock.install();
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-csrf' } }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );
  await page.route(`**/api/games/${gameId}/commands`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );
  await page.route(`**/api/games/${gameId}/private-view`, (route) =>
    route.fulfill({
      json: {
        serverNow: Date.now(),
        version: view.version,
        view: { ...view, private: privateData },
      },
    }),
  );

  await page.goto(`/game/${gameId}`);
  const shieldDialog = page.getByRole('dialog', { name: 'Shield your screen' });
  const gameTab = page.getByRole('tab', { name: 'Game', exact: true });
  const playersTab = page.getByRole('tab', { name: 'Players', exact: true });
  const playersPanel = page.getByTestId('players-tab-panel');
  await expect(shieldDialog).toBeVisible();
  await playersTab.click();
  await expect(playersPanel).toBeVisible();
  await expect(shieldDialog).toHaveCount(0);
  await gameTab.click();
  await expect(shieldDialog).toBeVisible();
  await page.clock.fastForward(3_000);
  await page.getByRole('button', { name: 'I’m shielded' }).click();
  const roleSeal = page.getByTestId('button-hold-reveal');
  const roleContent = page.getByTestId('private-role-content');
  await roleSeal.focus();
  await page.keyboard.down('Space');
  await page.clock.fastForward(1_000);
  await expect(roleContent).toContainText('Faithful');
  await expect(roleContent).toContainText('PRIVATE_TASK_SENTINEL');
  await page.keyboard.up('Space');
  expect(await browserStorageText(page)).not.toMatch(
    /Faithful|Traitor|PRIVATE_TASK_SENTINEL/i,
  );
  await playersTab.click();
  await expect(playersPanel).toBeVisible();
  await expect(roleContent).not.toContainText(
    /Faithful|PRIVATE_TASK_SENTINEL/i,
  );
  await expect(playersPanel).not.toContainText(
    /Faithful|Traitor|PRIVATE_TASK_SENTINEL/i,
  );
  await gameTab.click();
  await expect(roleContent).not.toContainText(
    /Faithful|PRIVATE_TASK_SENTINEL/i,
  );
  await expect(roleSeal).toBeVisible();
  await roleSeal.focus();
  await page.keyboard.down('Space');
  await page.clock.fastForward(1_000);
  await expect(roleContent).toContainText('Faithful');
  await expect(roleContent).toContainText('PRIVATE_TASK_SENTINEL');

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(roleContent).toHaveCount(0);
  await expect(page.getByTestId('away-resync-overlay')).toBeVisible();
  await page.keyboard.up('Space');
  simulatedNow += 30_000;
  await page.clock.setFixedTime(new Date(simulatedNow));
  view = { ...view, version: view.version + 1 };
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('player-game')).toHaveAttribute(
    'data-version',
    String(view.version),
  );
  await expect(roleContent).toHaveCount(0);
  await expect(
    page.getByRole('dialog', { name: 'Shield your screen' }),
  ).toBeVisible();
  expect(await browserStorageText(page)).not.toMatch(
    /Faithful|Traitor|PRIVATE_TASK_SENTINEL/i,
  );
});

test('mobile cold browser restart restores the seat and current vote screen from its cookie', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(
    !['Pixel', 'iPhone'].includes(testInfo.project.name),
    'Cold seat recovery is checked on Android Chrome and iPhone WebKit.',
  );

  const gameId = coldSeatGameId;
  const seatCookieName = cookieNameForGame(gameId);
  const originPage = page;

  await originPage.goto('/');
  const origin = new URL(originPage.url()).origin;
  await originPage.context().addCookies([
    {
      name: seatCookieName,
      value: coldSeatToken,
      url: origin,
      httpOnly: true,
      secure: new URL(origin).protocol === 'https:',
      sameSite: 'Lax',
    },
  ]);
  expect(
    (await originPage.context().cookies(origin)).some(
      (cookie) => cookie.name === seatCookieName,
    ),
  ).toBe(true);
  const gameUrl = new URL(`/game/${gameId}`, origin).toString();
  await originPage.goto(gameUrl);
  await expect(originPage.getByTestId('player-game')).toHaveAttribute(
    'data-phase',
    'VOTE',
  );
  await expect(
    originPage.getByText('Who do you vote to banish?', { exact: true }),
  ).toBeVisible();
  await originPage.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
  const savedState = await originPage.context().storageState();
  expect(
    savedState.cookies.some((cookie) => cookie.name === seatCookieName),
  ).toBe(true);

  const device =
    testInfo.project.name === 'iPhone'
      ? devices['iPhone 13']
      : devices['Pixel 7'];
  const coldContext = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
    userAgent: device.userAgent,
    storageState: savedState,
  });
  try {
    const coldPage = await coldContext.newPage();
    expect(
      (await coldContext.cookies(origin)).some(
        (cookie) => cookie.name === seatCookieName,
      ),
    ).toBe(true);
    await coldPage.goto(gameUrl);
    await expect(coldPage.getByTestId('player-game')).toHaveAttribute(
      'data-phase',
      'VOTE',
    );
    await expect(coldPage.getByTestId('away-resync-overlay')).toHaveCount(0);
    await expect(
      coldPage.getByText('Who do you vote to banish?', { exact: true }),
    ).toBeVisible();
    await expect(coldPage.getByTestId('private-choice-list')).toBeVisible();
    expect(await browserStorageText(coldPage)).not.toMatch(
      /seat-jamie|Faithful|Traitor/i,
    );
  } finally {
    await coldContext.close();
  }
});

test('mobile players resync after long absences without losing an unsubmitted vote', async ({
  page,
}, testInfo) => {
  test.skip(
    !['Pixel', 'iPhone'].includes(testInfo.project.name),
    'Away-and-back resilience is checked on Android Chrome and iPhone WebKit.',
  );

  const gameId = 'away-resilience';
  let simulatedNow = Date.now();
  await page.clock.install({ time: new Date(simulatedNow) });
  let publicView = {
    ...createPublicView(gameId),
    phase: 'VOTE',
    deadline: simulatedNow + 48 * 60 * 60 * 1_000,
  } as FullView;
  let holdNextView = false;
  const blockedView = { release: null as (() => void) | null };

  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-csrf' } }),
  );
  await page.route(`**/api/games/${gameId}/view`, async (route) => {
    if (holdNextView) {
      holdNextView = false;
      await new Promise<void>((resolve) => {
        blockedView.release = resolve;
      });
    }
    await route.fulfill({
      status: 200,
      json: {
        serverNow: simulatedNow,
        version: publicView.version,
        view: structuredClone(publicView),
      },
    });
  });

  await page.goto(`/game/${gameId}`);
  const originalViewport = page.viewportSize();
  if (!originalViewport)
    throw new Error('The mobile profile needs a viewport.');
  await page.getByRole('button', { name: 'Jamie', exact: true }).click();
  await expect(
    page.getByText('Your pick: Jamie', { exact: true }),
  ).toBeVisible();

  const awayCases = [
    { durationMs: 30_000, suspend: 'visibility', resume: 'visibility' },
    { durationMs: 5 * 60_000, suspend: 'pagehide', resume: 'pageshow' },
    { durationMs: 60 * 60_000, suspend: 'offline', resume: 'online' },
    {
      durationMs: 12 * 60 * 60_000,
      suspend: 'visibility',
      resume: 'visibility',
    },
  ] as const;

  for (const [index, awayCase] of awayCases.entries()) {
    await page.evaluate((eventName) => {
      if (eventName === 'visibility') {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      } else {
        window.dispatchEvent(new Event(eventName));
      }
    }, awayCase.suspend);

    simulatedNow += awayCase.durationMs;
    await page.clock.setFixedTime(new Date(simulatedNow));
    const lastSeq = Math.max(...publicView.publicLog.map((entry) => entry.seq));
    const guestName = `Guest ${index + 1}`;
    publicView = {
      ...publicView,
      version: publicView.version + 1,
      publicLog: [
        ...publicView.publicLog,
        {
          seq: lastSeq + 1,
          at: simulatedNow,
          action: 'seat_departed',
          seat: { id: `seat-away-${index + 1}`, name: guestName },
        },
      ],
    };

    if (index === 0) holdNextView = true;
    await page.evaluate((eventName) => {
      if (eventName === 'visibility') {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'visible',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      } else {
        window.dispatchEvent(new Event(eventName));
      }
    }, awayCase.resume);

    if (index === 0) {
      await expect(page.getByTestId('away-resync-overlay')).toBeVisible();
      await expect(page.getByTestId('player-game')).toHaveCount(0);
      await expect.poll(() => blockedView.release !== null).toBe(true);
      const release = blockedView.release;
      if (!release) throw new Error('The blocked game view was not requested.');
      release();
    }

    await expect(page.getByTestId('player-game')).toHaveAttribute(
      'data-version',
      String(publicView.version),
    );
    const awayCard = page.getByTestId('while-away-card');
    await expect(awayCard).toBeVisible();
    await expect(awayCard).toContainText(
      `${guestName} was marked as departed.`,
    );
    await expect(awayCard).not.toContainText('Your pick: Jamie');
    await awayCard.getByRole('button', { name: 'Back to the game' }).click();
    await page
      .getByRole('button', { name: 'Tap to see your private screen again' })
      .click();
    await expect(
      page.getByText('Your pick: Jamie', { exact: true }),
    ).toBeVisible();
  }

  for (const viewport of [{ width: 844, height: 390 }, originalViewport]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('orientationchange'));
    });
    await expect(page.getByTestId('private-choice-list')).toBeVisible();
    await expect(
      page.getByText('Your pick: Jamie', { exact: true }),
    ).toBeVisible();
  }

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const lastSeq = Math.max(...publicView.publicLog.map((entry) => entry.seq));
  simulatedNow += 30_000;
  publicView = {
    ...publicView,
    phase: 'VERDICT',
    version: publicView.version + 1,
    publicAnnouncement: {
      kind: 'verdict',
      cycle: publicView.cycle,
      seat: { id: 'seat-alex', name: 'Alex', role: 'faithful' },
    },
    publicLog: [
      ...publicView.publicLog,
      {
        seq: lastSeq + 1,
        at: simulatedNow,
        action: 'banishment',
        seat: { id: 'seat-alex', name: 'Alex' },
      },
    ],
  };
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('player-game')).toHaveAttribute(
    'data-phase',
    'VERDICT',
  );
  await expect(page.getByText('Your pick: Jamie', { exact: true })).toHaveCount(
    0,
  );
  expect(await browserStorageText(page)).not.toMatch(
    /seat-jamie|Jamie|Faithful|Traitor|PRIVATE_TASK_SENTINEL/i,
  );
  await expect(page.getByTestId('while-away-card')).toContainText(
    'Alex was banished.',
  );
});

test('private Notes hide after background and idle, then return with one tap', async ({
  page,
}) => {
  await page.clock.install();
  const gameId = 'notes-cover-restore';
  const publicView = createPublicView(gameId);
  let privateRequests = 0;
  const consoleMessages: string[] = [];
  page.on('console', (message) => consoleMessages.push(message.text()));
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
      json: { serverNow: Date.now(), version: 12, view: publicView },
    }),
  );
  await page.route(`**/api/games/${gameId}/private-view`, async (route) => {
    privateRequests += 1;
    expect(route.request().postDataJSON()).toEqual({ purpose: 'notes' });
    await route.fulfill({
      status: 200,
      json: {
        serverNow: Date.now(),
        version: 12,
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
  await page.goto(`/game/${gameId}`);
  await page.getByRole('button', { name: 'Notes' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Shield your screen' }),
  ).toHaveCount(0);
  const notes = page.getByTestId('private-notes-content');
  await expect.poll(() => privateRequests).toBe(1);
  await expect(notes).toBeVisible();
  const draft = 'NOTES_RELEASE_SENTINEL';
  const noteField = page.getByRole('textbox', { name: 'Write a note' });
  await noteField.fill(draft);

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(notes).toHaveCount(0);
  await expect.poll(() => privateRequests).toBe(1);
  await expect(page.getByTestId('away-resync-overlay')).toBeVisible();
  await page.clock.fastForward(30_000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('away-resync-overlay')).toHaveCount(0);
  const awayCard = page.getByTestId('while-away-card');
  await expect(awayCard).toContainText(
    'No public updates were recorded while you were away.',
  );
  await awayCard.getByRole('button', { name: 'Back to the game' }).click();
  const restore = page.getByRole('button', {
    name: 'Tap to see your private screen again',
  });
  await expect(restore).toBeVisible();
  await restore.click();
  await expect.poll(() => privateRequests).toBe(2);
  await expect(notes).toBeVisible();
  await expect(noteField).toHaveValue(draft);

  await page.clock.fastForward(30_001);
  await expect(notes).toHaveCount(0);
  await expect(restore).toBeVisible();
  await restore.click();
  await expect.poll(() => privateRequests).toBe(3);
  await expect(notes).toBeVisible();
  await expect(noteField).toHaveValue(draft);

  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(notes).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(draft);
  const storageText = await page.evaluate(() =>
    JSON.stringify({
      local: Object.keys(localStorage).map((key) => [
        key,
        localStorage.getItem(key),
      ]),
      session: Object.keys(sessionStorage).map((key) => [
        key,
        sessionStorage.getItem(key),
      ]),
    }),
  );
  expect(storageText).not.toContain(draft);
  expect(consoleMessages.join('\n')).not.toContain(draft);

  await page.getByTestId('button-open-notes').click();
  await expect.poll(() => privateRequests).toBe(4);
  await expect(notes).toBeVisible();
  await expect(noteField).toHaveValue('');
});

test('held role text stays above the seal in compact phone viewports', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'desktop',
    'Compact role geometry runs on the phone and tablet profiles',
  );
  const gameId = 'role-viewport';
  const roleView = {
    ...createPublicView(gameId),
    phase: 'DEAL',
  } as FullView;

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
      json: {
        serverNow: Date.now(),
        version: roleView.version,
        view: roleView,
      },
    }),
  );
  await page.route(`**/api/games/${gameId}/commands`, (route) =>
    route.fulfill({
      status: 200,
      json: {
        serverNow: Date.now(),
        version: roleView.version + 1,
        view: roleView,
      },
    }),
  );
  await page.route(`**/api/games/${gameId}/private-view`, (route) =>
    route.fulfill({
      status: 200,
      json: {
        serverNow: Date.now(),
        version: roleView.version,
        view: {
          ...roleView,
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
    }),
  );

  await page.goto(`/game/${gameId}`);
  const shield = page.getByRole('dialog', { name: 'Shield your screen' });
  const acknowledge = shield.getByRole('button', { name: /I’m shielded/i });
  await expect(acknowledge).toHaveAttribute('aria-disabled', 'false', {
    timeout: 7_000,
  });
  await acknowledge.click();

  const roleViewports = [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ];
  if (process.env.R7_STAGE_2A_CAPTURE === '1')
    roleViewports.push({ width: 1280, height: 900 });

  for (const viewport of roleViewports) {
    await page.setViewportSize(viewport);
    const seal = page.getByTestId('button-hold-reveal');
    const roleHeading = page.getByRole('heading', {
      name: 'Your role',
      exact: true,
    });
    await expect(roleHeading).toBeVisible();
    const headingSize = await roleHeading.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    );
    expect(headingSize).toBe(30);

    if (process.env.R7_STAGE_2A_CAPTURE === '1') {
      await mkdir('docs/screens/round-7-stage-2a', { recursive: true });
      for (const theme of ['day', 'night'] as const) {
        await page.locator('.game-shell').evaluate((element, value) => {
          (element as HTMLElement).dataset.gameTheme = value;
        }, theme);
        await page.screenshot({
          path: `docs/screens/round-7-stage-2a/seal-${theme}-${viewport.width}.jpg`,
          type: 'jpeg',
          quality: 88,
        });
      }
      await page.locator('.game-shell').evaluate((element) => {
        (element as HTMLElement).dataset.gameTheme = 'day';
      });
    }

    const sealBox = await seal.boundingBox();
    expect(
      sealBox,
      `seal at ${viewport.width}x${viewport.height}`,
    ).not.toBeNull();
    await page.mouse.move(
      sealBox!.x + sealBox!.width / 2,
      sealBox!.y + sealBox!.height / 2,
    );
    const scrollYBeforeHold = await page.evaluate(() => window.scrollY);
    await page.mouse.down();
    const roleContent = page.getByTestId('private-role-content');
    await expect(roleContent).toContainText('Faithful');
    const heldSealBox = await seal.boundingBox();
    expect(
      heldSealBox,
      `held seal at ${viewport.width}x${viewport.height}`,
    ).not.toBeNull();

    const heldLayout = await roleContent.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        scrollY: window.scrollY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });
    expect(heldLayout.left).toBeGreaterThanOrEqual(0);
    expect(heldLayout.top).toBeGreaterThanOrEqual(0);
    expect(heldLayout.right).toBeLessThanOrEqual(heldLayout.viewportWidth);
    expect(heldLayout.bottom).toBeLessThanOrEqual(heldLayout.viewportHeight);
    expect(heldLayout.bottom).toBeLessThanOrEqual(heldSealBox!.y);
    expect(heldLayout.scrollY).toBe(scrollYBeforeHold);

    await page.mouse.up();
    await expect(roleContent).not.toContainText('Faithful');
  }
});

test('Dawn, verdict, vote reveal and results appear on the phone without a presenter', async ({
  page,
}) => {
  const gameId = 'phone-announcement';
  let currentView = createPublicView(gameId);
  const presenterRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/presenter')) {
      presenterRequests.push(request.url());
    }
  });
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
      json: { serverNow: Date.now(), version: 12, view: currentView },
    }),
  );
  await page.goto(`/game/${gameId}`);

  currentView = {
    ...currentView,
    phase: 'DAWN',
    publicAnnouncement: { kind: 'dawn', cycle: 1, victims: [] },
  };
  await page.reload();
  await expect(page.getByTestId('shared-announcement')).toContainText(
    'No one was taken',
  );
  await expect(page.getByTestId('while-away-card')).toHaveCount(0);

  currentView = {
    ...currentView,
    phase: 'VERDICT',
    seats: [
      ...currentView.seats,
      { id: 'seat-taylor', name: 'Taylor', status: 'alive' },
      { id: 'seat-sam', name: 'Sam', status: 'alive' },
    ],
    publicAnnouncement: {
      kind: 'verdict',
      cycle: 1,
      seat: { id: 'seat-alex', name: 'Alex', role: 'traitor' },
    },
    ballots: {
      'seat-morgan': 'seat-alex',
      'seat-jamie': 'seat-alex',
      'seat-taylor': 'seat-morgan',
      'seat-sam': 'seat-jamie',
    },
  };
  await page.reload();
  await expect(page.getByTestId('while-away-card')).toHaveCount(0);
  const verdictAnnouncement = page.getByTestId('shared-announcement');
  await expect(verdictAnnouncement).toHaveText(
    'Alex has been banished. They were Traitor.',
  );
  const verdictHeadings = await page
    .getByTestId('player-game')
    .getByRole('heading')
    .allTextContents();
  expect(verdictHeadings[0]).toBe('The verdict');
  const voteReveal = page.getByTestId('list-vote-reveal');
  await expect(voteReveal.locator('li')).toHaveCount(4);
  await expect(voteReveal).toContainText('Morgan voted to banish Alex.');
  const revealAnimations = await voteReveal
    .locator('li')
    .evaluateAll((rows) =>
      rows.map((row) => getComputedStyle(row).animationName),
    );
  expect(revealAnimations).toEqual([
    'vote-reveal',
    'vote-reveal',
    'vote-reveal',
    'vote-reveal',
  ]);
  const resultMotion = await verdictAnnouncement.evaluate((announcement) => {
    return getComputedStyle(announcement).animationName;
  });
  expect(resultMotion).toBe('verdict-reveal');
  const resultFollowsReveal = await page.evaluate(() => {
    const votes = document.querySelector('[data-testid="list-vote-reveal"]');
    const result = document.querySelector(
      '[data-testid="shared-announcement"]',
    );
    return Boolean(
      votes &&
      result &&
      votes.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  expect(resultFollowsReveal).toBe(true);

  currentView = {
    ...currentView,
    phase: 'VERDICT',
    publicAnnouncement: { kind: 'no_votes', cycle: 2 },
    ballots: {},
    publicLog: [
      ...currentView.publicLog,
      { seq: 13, at: Date.now(), action: 'no_votes' },
    ],
  };
  await page.reload();
  const noVotesAnnouncement = page.getByTestId('shared-announcement');
  await expect(noVotesAnnouncement).toHaveCount(1);
  await expect(noVotesAnnouncement).toHaveText(
    'No votes were cast. Nobody is banished.',
  );
  await expect(
    page.getByTestId('player-game').getByRole('heading').first(),
  ).toHaveText('The verdict');
  await expect(page.getByTestId('while-away-card')).toContainText(
    'No votes were cast. Nobody is banished.',
  );
  await expect(page.getByTestId('public-log-entry-13')).toHaveText(
    'No votes were cast. Nobody is banished.',
  );

  currentView = {
    ...currentView,
    phase: 'FINISHED',
    winner: 'faithful',
    publicAnnouncement: { kind: 'finished', winner: 'faithful' },
  };
  await page.reload();
  await expect(page.getByTestId('shared-announcement')).toContainText(
    'Faithful',
  );
  expect(presenterRequests).toEqual([]);
});

test('finished roster restores public results without changing in-game role visibility', async ({
  page,
}) => {
  const gameId = 'finished-roster';
  let view: FullView = {
    ...createPublicView(gameId),
    phase: 'DEBATE',
    seats: [
      { id: 'seat-morgan', name: 'Morgan', status: 'alive', role: 'traitor' },
      { id: 'seat-alex', name: 'Alex', status: 'murdered', role: 'faithful' },
      { id: 'seat-jamie', name: 'Jamie', status: 'banished', role: 'faithful' },
      { id: 'seat-dana', name: 'Dana', status: 'departed' },
    ],
  };
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-csrf' } }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );
  await page.goto(`/game/${gameId}`);
  await page.getByRole('tab', { name: 'Players', exact: true }).click();
  const row = (id: string) => page.getByTestId(`player-seat-${id}`);
  await expect(row('seat-morgan')).toContainText('Playing');
  await expect(row('seat-morgan')).not.toContainText(/Traitor|Faithful/);
  await expect(row('seat-alex')).not.toContainText(/Traitor|Faithful/);
  await expect(row('seat-jamie')).toContainText('Faithful');
  await expect(row('seat-dana')).not.toContainText(/Traitor|Faithful/);

  view = {
    ...view,
    version: view.version + 1,
    phase: 'FINISHED',
    winner: 'traitor',
    publicAnnouncement: { kind: 'finished', winner: 'traitor' },
  };
  await page.reload();
  await page.getByRole('tab', { name: 'Players', exact: true }).click();
  await expect(page.getByTestId('players-roster-list')).not.toContainText(
    'Playing',
  );
  await expect(row('seat-morgan')).toContainText('Traitor');
  await expect(row('seat-alex')).toContainText('Out, Faithful');
  await expect(row('seat-jamie')).toContainText('Out, Faithful');
  await expect(row('seat-dana')).toContainText('Out');
  await expect(row('seat-dana')).not.toContainText(/Traitor|Faithful/);
});

test('the lobby code and join QR are shared on each seated player phone', async ({
  page,
}) => {
  const gameId = 'phone-lobby';
  const lobbyView = {
    ...createPublicView(gameId),
    phase: 'LOBBY',
    lobbyCode: 'ABC234',
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
      json: { serverNow: Date.now(), version: 12, view: lobbyView },
    }),
  );
  await page.goto(`/game/${gameId}`);

  await expect(page.getByTestId('lobby-room-code')).toHaveText('ABC234');
  await expect(page.getByTestId('lobby-join-qr')).toBeVisible();
  const supportsFullscreen = await page.evaluate(
    () => typeof document.documentElement.requestFullscreen === 'function',
  );
  const fullscreenButton = page.getByRole('button', { name: 'Full screen' });
  if (supportsFullscreen) {
    await expect(fullscreenButton).toBeVisible();
  } else {
    await expect(fullscreenButton).toHaveCount(0);
  }
});

test('a player taken at dawn sees their own fate in second person', async ({
  page,
}) => {
  const gameId = 'personal-taken-fate';
  const view = createPublicView(gameId);
  view.phase = 'DAWN';
  view.seats[0]!.status = 'murdered';
  view.publicAnnouncement = {
    kind: 'dawn',
    cycle: view.cycle,
    victims: [{ id: 'seat-morgan', name: 'Morgan' }],
  };
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'c'.repeat(64) } }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );

  await page.goto(`/game/${gameId}`);

  await expect(page.getByTestId('player-fate')).toHaveText(
    "You were taken in the night. You're out, but you can keep watching.",
  );
});

test('an out player sees a clear second-person watch-only message', async ({
  page,
}) => {
  const gameId = 'personal-out-fate';
  const view = createPublicView(gameId);
  view.seats[0]!.status = 'banished';
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'c'.repeat(64) } }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );

  await page.goto(`/game/${gameId}`);

  await expect(page.getByTestId('player-fate')).toHaveText(
    "You're out. You can watch, but you can't vote or choose.",
  );
});

test('organiser confirms before moving on when players are unfinished', async ({
  page,
}) => {
  const gameId = 'organiser-advance-confirmation';
  const publicView = createPublicView(gameId);
  publicView.canAdvancePhase = true;
  publicView.progress = { done: 1, total: 3 };
  let serverVersion = 12;
  let commandRequests = 0;
  let commandExpectedVersion: number | undefined;

  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      status: 200,
      json: { csrfToken: 'c'.repeat(64) },
    }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      status: 200,
      json: {
        serverNow: Date.now(),
        version: serverVersion,
        view: { ...publicView, version: serverVersion },
      },
    }),
  );
  await page.route(`**/api/games/${gameId}/commands`, async (route) => {
    commandRequests += 1;
    commandExpectedVersion = route.request().postDataJSON().expectedVersion;
    await route.fulfill({
      status: 200,
      json: { serverNow: Date.now(), version: 14, view: publicView },
    });
  });

  await page.goto(`/game/${gameId}`);
  await expect(
    page.getByRole('region', { name: 'Organiser controls' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Move everyone on', exact: true })
    .click();

  const confirmation = page.getByRole('dialog');
  await expect(confirmation).toContainText(
    "2 players haven't finished. Move everyone on anyway?",
  );
  expect(commandRequests).toBe(0);
  await confirmation.getByRole('button', { name: 'Keep waiting' }).click();
  await expect(confirmation).toHaveCount(0);
  expect(commandRequests).toBe(0);

  serverVersion = 13;
  await page
    .getByRole('button', { name: 'Move everyone on', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Move everyone on', exact: true })
    .click();
  await expect.poll(() => commandRequests).toBe(1);
  expect(commandExpectedVersion).toBe(13);
});

test('Round 7 Stage 2A Join and Lobby screenshot gallery', async ({ page }) => {
  test.skip(
    process.env.R7_STAGE_2A_CAPTURE !== '1',
    'Screenshots are generated explicitly for the design review',
  );
  test.setTimeout(180_000);
  await mkdir('docs/screens/round-7-stage-2a', { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();

  const gameId = 'r7-stage-2a-gallery';
  const baseView = createPublicView(gameId);
  const firstSeat = baseView.seats[0]!;
  let view = {
    ...baseView,
    seats: Array.from({ length: 5 }, (_, index) => {
      const existingSeat = baseView.seats[index];
      if (existingSeat) return { ...existingSeat, status: 'alive' as const };
      const number = index + 1;
      return {
        ...firstSeat,
        id: `stage-2a-seat-${number}`,
        name: `Player ${number}`,
      };
    }),
    progress: { ...baseView.progress, total: 5 },
    actionStatus: { ...baseView.actionStatus, total: 5, waiting: 5 },
  };
  const envelope = () => ({
    serverNow: Date.now(),
    version: view.version,
    view,
  });

  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'Set-Cookie':
          'oathstone-csrf=stage-2a-test-csrf; Path=/; SameSite=Strict',
      },
      json: { csrfToken: 'stage-2a-test-csrf' },
    }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({ json: envelope() }),
  );
  await page.route(`**/api/games/${gameId}/commands`, async (route) => {
    view = { ...view, version: view.version + 1 };
    await route.fulfill({ status: 200, json: envelope() });
  });
  await page.route(`**/api/games/${gameId}/join-requests`, (route) =>
    route.fulfill({ json: { requests: [] } }),
  );
  await page.route(`**/api/games/${gameId}/coordinator/delegates`, (route) =>
    route.fulfill({ json: { limit: 0, seatIds: [] } }),
  );
  await page.route(`**/api/games/${gameId}/coordinator/presence`, (route) =>
    route.fulfill({ json: { status: 'online' } }),
  );
  await page.route(`**/api/games/${gameId}/coordinator/view`, (route) =>
    route.fulfill({ json: envelope() }),
  );
  await page.route(`**/api/games/${gameId}/invites`, (route) =>
    route.fulfill({
      json: {
        joinUrl: 'https://oathstone.stackstoneconsulting.co.uk/join',
        shortCode: 'ABC234',
      },
    }),
  );
  const sizes = [
    { width: 320, height: 640 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 1280, height: 900 },
  ];
  const themes = ['day', 'night'] as const;
  const saveScreen = async (
    screen: 'join' | 'lobby' | 'seal',
    theme: (typeof themes)[number],
    width: number,
  ) => {
    await page.evaluate(
      ({ theme, screen }) => {
        const shell = document.querySelector(
          screen === 'seal' ? '.game-shell' : '.entry-experience',
        );
        shell?.setAttribute('data-game-theme', theme);
      },
      { theme, screen },
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `docs/screens/round-7-stage-2a/${screen}-${theme}-${width}.jpg`,
      type: 'jpeg',
      quality: 88,
    });
  };

  for (const size of sizes) {
    for (const theme of themes) {
      await page.setViewportSize(size);
      await page.goto('/join');
      await expect(page.getByTestId('input-join-name')).toBeVisible();
      await expect(page.getByTestId('game-happening-card')).toBeVisible();
      await saveScreen('join', theme, size.width);
    }
  }

  view = { ...view, phase: 'LOBBY', cycle: 0 };
  for (const size of sizes) {
    for (const theme of themes) {
      await page.setViewportSize(size);
      await page.goto(`/coordinate/${gameId}`);
      await expect(page.getByTestId('text-lobby-player-count')).toBeVisible();
      await expect(page.getByTestId('button-start-game')).toBeVisible();
      await expect(page.getByTestId('coordinator-seats')).toBeVisible();
      await expect(
        page.locator('[data-testid^="coordinator-seat-row-"]'),
      ).toHaveCount(5);
      const pageWidth = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(pageWidth.scroll).toBeLessThanOrEqual(pageWidth.client);
      const startBounds = await page
        .getByTestId('button-start-game')
        .boundingBox();
      expect(startBounds?.height).toBeGreaterThanOrEqual(44);
      for (const button of await page
        .locator('[data-testid^="button-mark-departed-"]')
        .all()) {
        const bounds = await button.boundingBox();
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
        expect(bounds?.width).toBeGreaterThanOrEqual(44);
      }
      const lastSeat = page
        .locator('[data-testid^="coordinator-seat-row-"]')
        .last();
      await lastSeat.evaluate((element) =>
        element.scrollIntoView({ block: 'center', behavior: 'instant' }),
      );
      const lastSeatBounds = await lastSeat.boundingBox();
      const dockBounds = await page
        .getByTestId('entry-action-dock')
        .boundingBox();
      expect(lastSeatBounds).not.toBeNull();
      expect(dockBounds).not.toBeNull();
      expect(lastSeatBounds!.y + lastSeatBounds!.height).toBeLessThanOrEqual(
        dockBounds!.y,
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await saveScreen('lobby', theme, size.width);
    }
  }
});
