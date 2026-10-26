import { expect, test } from '@playwright/test';
import type { FullView } from '../lib/shared/src/contracts';
import { createPublicView } from './support/public-view';
import { installLiveSocketViewFixture } from './support/live-socket-view';

async function openGame(
  page: import('@playwright/test').Page,
  gameId: string,
  extra: Partial<FullView>,
) {
  const view: FullView = {
    ...createPublicView(gameId),
    phase: 'DEBATE',
    missionsEnabled: false,
    ...extra,
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

test('a game without missions says they are coming and the player can hide it', async ({
  page,
}) => {
  await openGame(page, 'missions-notice', {});
  const notice = page.getByTestId('missions-coming-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Missions are coming soon');
  await notice.getByRole('button', { name: 'Hide' }).click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('player-game')).toBeVisible();
  await expect(page.getByTestId('missions-coming-notice')).toHaveCount(0);
});

test('practice games do not show the missions notice', async ({ page }) => {
  await openGame(page, 'missions-notice-practice', { rehearsal: true });
  await expect(page.getByTestId('missions-coming-notice')).toHaveCount(0);
});
