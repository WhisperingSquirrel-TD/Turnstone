import { expect, test, type Page } from '@playwright/test';
import { createPublicView } from './support/public-view';
import { installLiveSocketViewFixture } from './support/live-socket-view';

async function openDebate(page: Page, gameId: string) {
  const view = {
    ...createPublicView(gameId),
    phase: 'DEBATE' as const,
    missionsEnabled: false,
    shieldsPublic: true,
    canAdvancePhase: true,
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
  await expect(page.getByTestId('player-game')).toHaveAttribute(
    'data-phase',
    'DEBATE',
  );
}

// The skip link must appear on focus without reserving space in the page:
// leaving it once shifted the game screen up by 44px between press and release.
test('focusing and leaving the skip link does not move the game screen', async ({
  page,
}) => {
  await openDebate(page, 'skip-link-focus');
  const control = page
    .getByTestId('round-table-shield')
    .getByRole('radio', { name: 'Jamie' });
  await expect(control).toBeAttached();
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  const top = () =>
    control.evaluate((element) => element.getBoundingClientRect().top);

  const unfocusedTop = await top();
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  // Visible and not covered while focused, so keyboard users can find it.
  const onTop = await skipLink.evaluate((link) => {
    const r = link.getBoundingClientRect();
    const hit = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    return r.top >= 0 && r.bottom <= innerHeight && link.contains(hit);
  });
  expect(onTop).toBe(true);
  const focusedTop = await top();
  await skipLink.blur();
  const blurredTop = await top();

  expect(focusedTop).toBe(unfocusedTop);
  expect(blurredTop).toBe(focusedTop);
});

// The hold seal cancels pointerdown, so the browser leaves focus where it was;
// a pointer press elsewhere must still put the skip link away, or it covers
// the header while a role is held.
test('a pointer press elsewhere puts the focused skip link away', async ({
  page,
}) => {
  await openDebate(page, 'skip-link-press');
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await page.locator('main').evaluate((main) => {
    const pad = document.createElement('div');
    pad.dataset.testid = 'cancelled-press';
    pad.style.cssText =
      'position:fixed;inset:40% 0 auto;height:80px;z-index:40';
    pad.addEventListener('pointerdown', (event) => event.preventDefault());
    main.append(pad);
  });
  const pad = await page.getByTestId('cancelled-press').boundingBox();
  await page.mouse.move(pad!.x + pad!.width / 2, pad!.y + pad!.height / 2);
  await page.mouse.down();
  await expect(skipLink).not.toBeFocused();
  await page.mouse.up();
});
