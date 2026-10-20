import { devices, expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { cookieNameForGame } from '../artifacts/api-server/src/session-auth';
import type { FullView } from '../lib/shared/src/contracts';
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

test('game-clock colours and Always dark keep text accessible in both palettes', async ({
  page,
}) => {
  const gameId = 'theme-clock';
  const view = createPublicView(gameId);
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
  await page.getByText('Display', { exact: true }).click();
  const alwaysDark = page.getByRole('checkbox', { name: 'Always dark' });
  await expect(alwaysDark).not.toBeChecked();
  await alwaysDark.check();
  await expect(shell).toHaveAttribute('data-game-theme', 'night');
  expect(
    await shell
      .locator('.oathstone-wordmark > span')
      .evaluateAll((parts) =>
        parts.map((part) => getComputedStyle(part).color),
      ),
  ).toEqual(['rgb(250, 250, 245)', 'rgb(200, 148, 74)']);
  await alwaysDark.uncheck();
  await expect(shell).toHaveAttribute('data-game-theme', 'day');
  await page.getByText('Display', { exact: true }).click();
  for (const theme of ['day', 'night']) {
    await shell.evaluate((element, palette) => {
      (element as HTMLElement).dataset.gameTheme = palette;
    }, theme);
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

test('night status has identical four-line geometry for both roles in both themes', async ({
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
      expect(geometry.height).toBe(80);
      expect(geometry.lines).toEqual([20, 20, 20, 20]);
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
  const capture = process.env.R5_CAPTURE_SCREENS === '1';
  const directory = 'docs/screens/round-5';
  if (capture) await mkdir(directory, { recursive: true });
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-csrf' } }),
  );
  const envelope = () => ({
    serverNow: Date.now(),
    version: view.version,
    view,
  });
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({ json: envelope() }),
  );
  await page.route(`**/api/games/${gameId}/commands`, (route) =>
    route.fulfill({ json: envelope() }),
  );
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
  const widths = [320, 375, 390, 430, 1280];
  async function snapshot(label: string, held = false) {
    for (const width of widths) {
      const height =
        width === 320
          ? 568
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
      await page.evaluate(() => document.fonts.ready);
      const privacyShield = page.getByRole('dialog', {
        name: 'Shield your screen',
      });
      if (!label.startsWith('shield-') && (await privacyShield.isVisible())) {
        await page.clock.fastForward(3_000);
        await privacyShield
          .getByRole('button', { name: 'I’m shielded' })
          .click();
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
        if (!shielded && !held)
          expect(
            await page
              .locator('main')
              .evaluate((element) => getComputedStyle(element).overflowY),
          ).toBe('visible');
        if (held) {
          const box = await page
            .getByTestId('private-role-content')
            .boundingBox();
          expect(box!.y).toBeGreaterThanOrEqual(
            headerBox!.y + headerBox!.height,
          );
          expect(box!.y + box!.height).toBeLessThanOrEqual(height);
        }
        if (capture)
          await page.screenshot({
            path: `${directory}/${label}-${palette}-${width}.jpg`,
            type: 'jpeg',
            quality: 72,
            scale: 'css',
          });
        if (held) await page.mouse.up();
        if (!shielded && !held) {
          const last = page
            .locator('main button:visible:not(.game-action-bar button)')
            .last();
          if (await last.count()) {
            await page.evaluate(() =>
              window.scrollTo(0, document.documentElement.scrollHeight),
            );
            const box = await last.boundingBox();
            const action = page.locator('.game-action-bar:visible');
            const stack = await (
              (await action.count())
                ? action
                : page.getByTestId('brand-footer-shell')
            ).boundingBox();
            expect(
              box!.y + box!.height,
              `${label}/${palette}/${width}: last action clear of bottom stack`,
            ).toBeLessThanOrEqual(stack!.y + 1);
          }
          const bar = page.locator('.game-action-bar:visible');
          if (await bar.count()) {
            const barBox = await bar.boundingBox(),
              footerBox = await page
                .getByTestId('brand-footer-shell')
                .boundingBox();
            expect(
              Math.abs(barBox!.y + barBox!.height - footerBox!.y),
            ).toBeLessThanOrEqual(1);
            expect(barBox!.width).toBe(footerBox!.width);
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
  await page.route(`**/api/games/${gameId}/view`, (route) =>
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
  await page.route(`**/api/games/${gameId}/view`, (route) =>
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
  const notesButton = page.getByRole('button', { name: 'Notes' });
  await expect(notesButton).toBeVisible();
  await notesButton.click();
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
  const publicView = createPublicView(gameId);
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
  await expect(
    page.getByRole('heading', { name: 'Your room', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/players have completed this part/)).toHaveCount(
    0,
  );

  const phaseHelp = page.locator('details').filter({ hasText: "What's this?" });
  await expect(phaseHelp).toHaveCount(1);
  await phaseHelp.locator('summary').click();
  await expect(phaseHelp).toContainText(
    'Everyone talks it over. Who is acting suspiciously, and why? In a real game this lasts as long as the organiser sets.',
  );
  await expect(page.getByTestId('player-seat-seat-morgan')).toBeVisible();
  await expect(page.getByTestId('player-seat-seat-alex')).toContainText('Out');
  await expect(page.getByTestId('status-prize-pot')).toContainText('18 points');
  const publicLog = page.getByTestId('list-public-log');
  await expect(publicLog).toContainText('Alex moved to a new device');
  await expect(publicLog).toContainText('Morgan was taken in the night.');
  await expect(publicLog).toContainText('No one was taken.');
  await expect(page.getByRole('button', { name: 'Full screen' })).toHaveCount(
    0,
  );
  const notesButton = page.getByRole('button', { name: 'Notes' });
  await expect(notesButton).toBeVisible();
  await notesButton.click();

  await expect(
    page.getByRole('dialog', { name: 'Shield your screen' }),
  ).toHaveCount(0);
  await expect.poll(() => privateRequests).toBe(1);
  await expect(page.getByTestId('private-notes-content')).toBeVisible({
    timeout: 1500,
  });
  await expect(page.getByTestId('button-hold-reveal')).toHaveCount(0);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('private-notes-content')).toHaveCount(0);
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
  await expect(page.getByTestId('vote-status-seat-morgan')).toHaveText(
    'Waiting',
  );
  await expect(page.getByTestId('vote-status-seat-jamie')).toHaveText('Voted');
  await expect(page.getByTestId('vote-status-seat-practice-1')).toHaveText(
    'Waiting',
  );
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
  ).toHaveCSS('color', 'rgb(61, 58, 56)');
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
      expect(visualState.color).toBe('rgb(61, 58, 56)');
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
  const footerBounds = await page
    .getByTestId('brand-footer-shell')
    .boundingBox();
  expect(lastChoiceBounds!.y + lastChoiceBounds!.height).toBeLessThanOrEqual(
    footerBounds!.y,
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
  expect(await browserStorageText(page)).not.toMatch(
    /seat-jamie|Jamie|Faithful|Traitor|PRIVATE_TASK_SENTINEL/i,
  );
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

for (const role of ['faithful', 'traitor'] as const) {
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
        document.body.append(probe);
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
  await expect(
    page.getByRole('dialog', { name: 'Shield your screen' }),
  ).toBeVisible();
  await page.clock.fastForward(3_000);
  await page.getByRole('button', { name: 'I’m shielded' }).click();
  const choices = page.getByTestId('private-choice-list');
  await expect(choices).toBeVisible();
  await choices.getByRole('button', { name: 'Jamie', exact: true }).click();
  await expect(
    page.getByText('Your pick: Jamie', { exact: true }),
  ).toBeVisible();
  expect(await browserStorageText(page)).not.toMatch(
    /seat-jamie|Faithful|Traitor|PRIVATE_TASK_SENTINEL/i,
  );

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
    expect(await browserStorageText(page)).not.toMatch(
      /seat-jamie|Jamie|Faithful|Traitor|PRIVATE_TASK_SENTINEL/i,
    );
    expect(await browserStorageText(page)).not.toMatch(
      /seat-jamie|Faithful|Traitor|PRIVATE_TASK_SENTINEL/i,
    );
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
  await expect(
    page.getByRole('dialog', { name: 'Shield your screen' }),
  ).toBeVisible();
  await page.clock.fastForward(3_000);
  await page.getByRole('button', { name: 'I’m shielded' }).click();
  const roleSeal = page.getByTestId('button-hold-reveal');
  const roleContent = page.getByTestId('private-role-content');
  await roleSeal.focus();
  await page.keyboard.down('Space');
  await page.clock.fastForward(1_000);
  await expect(roleContent).toContainText('Faithful');
  await expect(roleContent).toContainText('PRIVATE_TASK_SENTINEL');
  expect(await browserStorageText(page)).not.toMatch(
    /Faithful|Traitor|PRIVATE_TASK_SENTINEL/i,
  );

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

  await page.clock.fastForward(30_001);
  await expect(notes).toHaveCount(0);
  await expect(restore).toBeVisible();
  await restore.click();
  await expect.poll(() => privateRequests).toBe(3);
  await expect(notes).toBeVisible();
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

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    const seal = page.getByTestId('button-hold-reveal');
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
  expect(verdictHeadings[0]).toBe('Alex has been banished. They were Traitor.');
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
  ).toHaveText('No votes were cast. Nobody is banished.');
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
