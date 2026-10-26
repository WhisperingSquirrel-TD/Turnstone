import { expect, test } from '@playwright/test';
import type { FullView } from '../lib/shared/src/contracts';
import { createPublicView } from './support/public-view';
import { installLiveSocketViewFixture } from './support/live-socket-view';

// Owner regression (Verify #316): a window blur during DEAL (for example a
// phone's notification shade) re-arms the shield while the resume cover hides
// it; on focus the shield came back as a closed dialog still covering the game.
test('a shield re-armed by a window blur returns as a modal dialog', async ({
  page,
}) => {
  await page.clock.install();
  let clockAdvanceMs = 0;
  const fastForward = async (ms: number) => {
    clockAdvanceMs += ms;
    await page.clock.fastForward(ms);
  };
  const gameId = 'shield-refocus';
  const view: FullView = {
    ...createPublicView(gameId),
    phase: 'DEAL',
    deadline: null,
  };
  const envelope = () => ({
    serverNow: Date.now() + clockAdvanceMs,
    version: view.version,
    view,
  });
  await installLiveSocketViewFixture(page, envelope);
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-csrf' } }),
  );
  await page.route(`**/api/games/${gameId}/**`, (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/private-view'))
      return route.fulfill({
        json: {
          ...envelope(),
          view: {
            ...view,
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
    return route.fulfill({ json: envelope() });
  });

  await page.goto(`/game/${gameId}?clips=off`);
  const shield = page.locator('.privacy-shield');
  await expect(shield).toHaveAttribute('open', '');
  await fastForward(3_000);
  await page.getByRole('button', { name: 'I’m shielded' }).click();
  await expect(shield).toHaveCount(0);
  await expect(page.getByTestId('button-hold-reveal')).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('away-resync-overlay')).toHaveCount(0);

  await expect(shield).toHaveAttribute('open', '');
  await fastForward(5_000);
  await page.getByRole('button', { name: 'I’m shielded' }).click();
  await expect(shield).toHaveCount(0);
  await expect(page.getByTestId('game-help-disclosure')).toBeVisible();
  await page
    .getByTestId('game-help-disclosure')
    .locator('summary')
    .click({ timeout: 5_000 });
});
