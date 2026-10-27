import { expect, test } from '@playwright/test';
import type { FullView } from '../lib/shared/src/contracts';
import { createPublicView } from './support/public-view';
import { installLiveSocketViewFixture } from './support/live-socket-view';

const betaNote =
  'Thanks for trying Oathstone early. Spotted a problem? Tap Report an issue.';
const reportHref =
  'mailto:assistant@stackstoneconsulting.co.uk?subject=Oathstone%20feedback';

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

// Owner request (27 October 2026): "Tell your organiser" gave players no way
// to send feedback, so everyone gets a Report an issue email link.
test('the entry footer offers Report an issue to everyone', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('button-create-game')).toBeVisible();
  const report = page.getByTestId('report-issue-link');
  await expect(report).toHaveText('Report an issue');
  await expect(report).toHaveAttribute('href', reportHref);
  const box = await report.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test('during play, Report an issue is in the game Menu', async ({ page }) => {
  const gameId = 'beta-report';
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
  const menu = page.getByTestId('game-status-menu');
  await menu.locator('summary').click();
  const report = menu.getByTestId('menu-report-issue');
  await expect(report).toBeVisible();
  await expect(report).toHaveAttribute('href', reportHref);
});

test('every entry screen offers Report an issue in its Menu', async ({
  page,
}) => {
  await page.goto('/?entry=rehearsal');
  const menu = page.locator('.entry-brand-menu');
  await menu.locator('summary').click();
  const report = menu.getByTestId('entry-menu-report-issue');
  await expect(report).toBeVisible();
  await expect(report).toHaveAttribute('href', reportHref);
  // The flow footers stay one line: only the welcome footer carries the link.
  await expect(
    page.getByTestId('brand-footer-entry').getByTestId('report-issue-link'),
  ).toHaveCount(0);
});
