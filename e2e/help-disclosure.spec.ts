import { expect, test } from '@playwright/test';
import type { FullView } from '../lib/shared/src/contracts';
import { createPublicView } from './support/public-view';
import { installLiveSocketViewFixture } from './support/live-socket-view';

// Owner phone screenshot (27 October 2026): "What's this?" read as plain text
// because the flex summary drops the browser's disclosure arrow.
test('"What\'s this?" shows a chevron that turns when opened', async ({
  page,
}) => {
  const gameId = 'help-chevron';
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
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/game/${gameId}?clips=off`);
  const summary = page.getByTestId('game-help-disclosure').locator('summary');
  await expect(summary).toBeVisible();
  const marker = () =>
    summary.evaluate((element) => {
      const style = getComputedStyle(element, '::after');
      return { content: style.content, transform: style.transform };
    });
  const closed = await marker();
  expect(closed.content).not.toBe('none');
  await summary.click();
  await expect(page.getByTestId('game-help-disclosure')).toHaveAttribute(
    'open',
    '',
  );
  expect((await marker()).transform).not.toBe(closed.transform);
});

// Owner phone screenshot (27 October 2026): a player who was out of the game
// could open Notes, but the server rightly refuses private screens to seats
// that are not alive, so the sheet sat on "Opening your private screen…".
test('a player who is out of the game is not offered Notes', async ({
  page,
}) => {
  const gameId = 'notes-out';
  const base = createPublicView(gameId);
  const view: FullView = {
    ...base,
    phase: 'DEBATE',
    seats: base.seats.map((seat) =>
      seat.id === base.viewerSeatId ? { ...seat, status: 'banished' } : seat,
    ),
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
  await expect(page.locator('[data-phase="DEBATE"]')).toBeAttached();
  await expect(page.getByTestId('game-status-bar')).toBeVisible();
  await expect(page.getByTestId('button-open-notes')).toHaveCount(0);
});
