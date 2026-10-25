import { expect, test, type Page } from '@playwright/test';
import { createPublicView } from './support/public-view';
import { mkdir } from 'node:fs/promises';

async function capture(page: Page, state: string) {
  const width = page.viewportSize()?.width ?? 0;
  if (
    process.env.R7_AUDIT_CAPTURE !== '1' ||
    ![320, 360, 390, 430].includes(width)
  )
    return;
  const directory = 'docs/screens/round-7-audit';
  await mkdir(directory, { recursive: true });
  for (const colour of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: colour, reducedMotion: 'reduce' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `${directory}/${state}-${width}-${colour}.jpg`,
      type: 'jpeg',
      quality: 55,
      fullPage: true,
    });
  }
}

async function nameAndPin(page: Page) {
  await page.goto('/play?entry=create');
  await capture(page, 'create-1-game-name');
  await page.getByTestId('button-continue-create-name').click();
  await capture(page, 'create-2-player-count');
  await page.getByTestId('button-continue-player-count').click();
  await expect(page.getByTestId('input-organiser-pin')).toBeVisible();
  await capture(page, 'create-3-name-pin');
}

test('Create game stays pointer reachable outside the normal-flow credit scrollport', async ({
  page,
}) => {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 640 });
    await nameAndPin(page);
    await page.getByTestId('input-organiser-name').fill('Morgan');
    await page.getByTestId('input-organiser-pin').fill('1234');
    const result = await page.evaluate(() => {
      const button = document.querySelector(
        '[data-testid="button-create-submit"]',
      )!;
      const footer = document.querySelector<HTMLElement>(
        '[data-testid="brand-footer-entry"]',
      )!;
      footer.scrollIntoView({ block: 'end', behavior: 'instant' });
      const hits = () => {
        const r = button.getBoundingClientRect(),
          hit = document.elementFromPoint(
            r.x + r.width / 2,
            r.y + r.height / 2,
          );
        return hit === button || (!!hit && button.contains(hit));
      };
      footer.style.zIndex = '500';
      const oldLayering = hits();
      footer.style.removeProperty('z-index');
      return {
        oldLayering,
        corrected: hits(),
        position: getComputedStyle(footer).position,
        creditClear:
          footer.getBoundingClientRect().bottom <=
          button.getBoundingClientRect().top,
      };
    });
    expect(result).toEqual({
      oldLayering: true,
      corrected: true,
      position: 'static',
      creditClear: true,
    });
  }
});

test('Create presenter rows keep the checkbox clear of both text lines and support keyboard focus', async ({
  page,
}) => {
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await nameAndPin(page);
    const checkbox = page.getByTestId('toggle-presenter');
    const row = page.locator('label[for="entry-presenter-enabled"]');
    for (const checked of [false, true]) {
      if (checked) await checkbox.check();
      await expect(checkbox).toBeChecked({ checked });
      const geometry = await row.evaluate((element) => {
        const input = element.querySelector('input')!.getBoundingClientRect();
        const text = element.querySelector('span')!.getBoundingClientRect();
        return {
          inputRight: input.right,
          textLeft: text.left,
          height: element.getBoundingClientRect().height,
        };
      });
      expect(
        geometry.textLeft,
        `presenter text at ${width}px`,
      ).toBeGreaterThanOrEqual(geometry.inputRight + 12);
      expect(geometry.height).toBeGreaterThanOrEqual(56);
      await capture(
        page,
        checked ? 'create-presenter-checked' : 'create-presenter-unchecked',
      );
    }
    await page.getByTestId('input-organiser-pin').focus();
    await page.keyboard.press('Tab');
    await expect(checkbox).toBeFocused();
    expect(
      await checkbox.evaluate(
        (element) => getComputedStyle(element).outlineStyle,
      ),
    ).not.toBe('none');
    if (process.env.R7_AUDIT_CAPTURE === '1') {
      await page.getByTestId('input-organiser-name').fill('Ava');
      await page.getByTestId('input-organiser-pin').fill('1234');
      await capture(page, 'create-4-voting-ready');
      for (const [path, state] of [
        ['/join', 'join'],
        ['/play?entry=rehearsal', 'practice'],
      ] as const) {
        await page.goto(path);
        await expect(page.locator('main h1')).toBeVisible();
        await capture(page, state);
      }
    }
  }
});

test('Create explains missing fields and docks only a complete form above a flow footer', async ({
  page,
}) => {
  await nameAndPin(page);
  const create = page.getByTestId('button-create-submit');
  await expect(create).toBeDisabled();
  await expect(page.getByTestId('entry-primary-hint')).toContainText(
    'first name and a 4-digit PIN',
  );
  await expect(page.getByTestId('entry-action-dock')).toHaveCount(0);
  expect(
    await page
      .getByTestId('brand-footer-entry')
      .evaluate((element) => getComputedStyle(element).position),
  ).toBe('static');
  await page.getByTestId('input-organiser-name').fill('Ava');
  await page.getByTestId('input-organiser-pin').fill('1234');
  await expect(create).toBeEnabled();
  await expect(page.getByTestId('entry-action-dock')).toBeVisible();
  await page
    .locator('main')
    .evaluate((main) => main.scrollTo(0, main.scrollHeight));
  const [button, footer] = await Promise.all([
    create.boundingBox(),
    page.getByTestId('brand-footer-entry').boundingBox(),
  ]);
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(button!.y);
});

test('Create describes self-paced sharing without promising an app-held order', async ({
  page,
}) => {
  await nameAndPin(page);
  await expect(
    page.getByText(
      'Each player says who they voted for and why, then presses a button to show their vote.',
      { exact: true },
    ),
  ).toBeVisible();
});

test('incomplete Join and Practice forms explain their disabled actions without a fixed dock', async ({
  page,
}) => {
  for (const path of ['/join', '/play?entry=rehearsal']) {
    await page.goto(path);
    await expect(page.getByTestId('entry-primary-hint')).toContainText(
      'first name',
    );
    await expect(page.getByTestId('entry-action-dock')).toHaveCount(0);
  }
  await page.getByTestId('input-rehearsal-name').fill('Ava');
  await expect(page.getByTestId('entry-action-dock')).toBeVisible();
  await expect(page.getByTestId('button-start-rehearsal')).toBeEnabled();
});

test('organiser Lobby uses a compact phase chip and exposes its share action above the dock', async ({
  page,
}) => {
  const gameId = 'lobby-layout';
  const view = {
    ...createPublicView(gameId),
    phase: 'LOBBY',
    seats: [{ id: 'seat-morgan', name: 'Morgan', status: 'alive' }],
  };
  await page.route('**/api/games/*/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/join-requests'))
      return route.fulfill({ json: { requests: [] } });
    if (path.endsWith('/invites'))
      return route.fulfill({
        json: {
          gameId,
          shortCode: 'ABC234',
          joinUrl: `https://oathstone.test/join/${gameId}#${'i'.repeat(43)}`,
        },
      });
    return route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    });
  });
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/coordinate/${gameId}?players=6`);
    const phase = page.getByTestId('game-status-phase');
    await expect(phase).toBeVisible();
    expect((await phase.boundingBox())!.width).toBeLessThan(width / 2);
    await expect(page.getByTestId('game-status-remaining')).toHaveText(
      '1 joined',
    );
    const share = page.getByTestId('button-share-game');
    await share.evaluate((element) =>
      element.scrollIntoView({ block: 'center' }),
    );
    const [target, dock] = await Promise.all([
      share.boundingBox(),
      page.getByTestId('entry-action-dock').boundingBox(),
    ]);
    expect(target!.y).toBeGreaterThanOrEqual(0);
    expect(target!.y + target!.height).toBeLessThanOrEqual(dock!.y);
    await capture(page, 'lobby-organiser');
  }
});
