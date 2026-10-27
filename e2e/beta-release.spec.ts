import { expect, test } from '@playwright/test';
import type { FullView } from '../lib/shared/src/contracts';
import { createPublicView } from './support/public-view';
import { installLiveSocketViewFixture } from './support/live-socket-view';

const betaNote =
  'Thanks for trying Oathstone early. Tell your organiser if anything looks wrong.';

test('the entry marks the beta beside the wordmark with a thank-you line', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('button-create-game')).toBeVisible();
  const header = page.locator('.entry-experience .entry-brand');
  await expect(header.getByTestId('beta-tag')).toHaveText('Beta');
  await expect(page.getByTestId('entry-beta-note')).toContainText(betaNote);
});

test('every game screen shows the beta tag in its top bar', async ({
  page,
}) => {
  const gameId = 'beta-game';
  const view: FullView = { ...createPublicView(gameId), phase: 'DEBATE' };
  const envelope = () => ({
    serverNow: Date.now(),
    version: view.version,
    view,
  });
  await installLiveSocketViewFixture(page, envelope);
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-csrf' } }),
  );
  await page.route(`**/api/games/${gameId}/**`, (route) =>
    route.fulfill({ json: envelope() }),
  );
  await page.goto(`/game/${gameId}?clips=off`);
  await expect(
    page.locator('[data-testid="game-status-bar"] > [data-testid="beta-tag"]'),
  ).toHaveText('Beta');
});

test('on 320px phones the beta tag moves from the top bar into Menu', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const gameId = 'beta-narrow';
  const view: FullView = { ...createPublicView(gameId), phase: 'DEBATE' };
  const envelope = () => ({
    serverNow: Date.now(),
    version: view.version,
    view,
  });
  await installLiveSocketViewFixture(page, envelope);
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-csrf' } }),
  );
  await page.route(`**/api/games/${gameId}/**`, (route) =>
    route.fulfill({ json: envelope() }),
  );
  await page.goto(`/game/${gameId}?clips=off`);
  await expect(
    page.locator('[data-testid="game-status-bar"] > [data-testid="beta-tag"]'),
  ).toBeHidden();
  await page.getByTestId('game-status-menu').locator('summary').click();
  await expect(
    page.getByTestId('game-status-menu').getByTestId('menu-beta-note'),
  ).toBeVisible();
});

// Owner phone screenshot (27 October 2026): on the role privacy screen the
// beta tag sat below the wordmark because the wordmark's 44px touch box kept
// its text at the top.
test('the beta tag lines up with the wordmark on the privacy screen', async ({
  page,
}) => {
  const gameId = 'beta-shield';
  const view: FullView = {
    ...createPublicView(gameId),
    phase: 'DEAL',
    deadline: null,
  };
  const envelope = () => ({
    serverNow: Date.now(),
    version: view.version,
    view,
  });
  await installLiveSocketViewFixture(page, envelope);
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-csrf' } }),
  );
  await page.route(`**/api/games/${gameId}/**`, (route) =>
    route.fulfill({ json: envelope() }),
  );
  await page.goto(`/game/${gameId}?clips=off`);
  const shield = page.locator('.privacy-shield');
  await expect(shield).toHaveAttribute('open', '');
  const text = await shield
    .getByTestId('text-entry-brand')
    .locator('span')
    .first()
    .boundingBox();
  const tag = await shield.getByTestId('beta-tag').boundingBox();
  expect(text && tag).toBeTruthy();
  const middle = (box: { y: number; height: number }) => box.y + box.height / 2;
  expect(Math.abs(middle(text!) - middle(tag!))).toBeLessThanOrEqual(2);
});
