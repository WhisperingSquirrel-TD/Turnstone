import { expect, test } from '@playwright/test';
import { createPublicView } from './support/public-view';
import { installLiveSocketViewFixture } from './support/live-socket-view';

test('owner regression: Practice Day 1 Talk never strands a private-screen placeholder', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const gameId = 'practice-private-recovery';
  const view = { ...createPublicView(gameId), rehearsal: true, cycle: 1 };
  const envelope = () => ({
    serverNow: Date.now(),
    version: view.version,
    view,
  });
  await installLiveSocketViewFixture(page, envelope);
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-csrf' } }),
  );
  let privateRequests = 0;
  let gameplayCommands = 0;
  await page.route(`**/api/games/${gameId}/**`, (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/commands'))
      gameplayCommands++;
    if (new URL(route.request().url()).pathname.endsWith('/private-view')) {
      privateRequests++;
      // A successful transport without a usable private snapshot must be recoverable.
      return route.fulfill({
        json:
          privateRequests === 1
            ? envelope()
            : {
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
    }
    return route.fulfill({ json: envelope() });
  });
  await page.goto(`/game/${gameId}?clips=off`);
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
  await page
    .getByTestId('game-status-bar')
    .getByRole('button', { name: 'Notes', exact: true })
    .click();
  const sheet = page.getByTestId('game-notes-sheet');
  await expect(sheet).toBeVisible();
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
  await expect(
    sheet.getByRole('button', { name: 'Try again', exact: true }),
  ).toBeEnabled();
  await sheet.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByTestId('private-notes-content')).toBeVisible();
  expect(gameplayCommands).toBe(0);
  await sheet.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('private-notes-content')).toHaveCount(0);
  await expect(page.locator('[data-phase="DEBATE"] h1')).toHaveText(
    'The conversation',
  );
  await expect(page.locator('[data-phase="DEBATE"] h1')).toBeVisible();
});

test('owner regression: current steps survive reload, screen return and slow state fetches', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const gameId = 'phase-return-recovery';
  let view = createPublicView(gameId);
  const envelope = () => ({
    serverNow: Date.now(),
    version: view.version,
    view,
  });
  await installLiveSocketViewFixture(page, envelope);
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-csrf' } }),
  );
  await page.route(`**/api/games/${gameId}/**`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    await route.fulfill({ json: envelope() });
  });
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
    view = { ...view, phase, version: view.version + 1 };
    await page.goto(`/game/${gameId}?clips=off`);
    await expect(page.locator(`[data-phase="${phase}"]`)).toBeAttached();
    await page.reload();
    await expect(page.locator(`[data-phase="${phase}"]`)).toBeAttached();
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
    });
    await expect(page.locator(`[data-phase="${phase}"]`)).toBeAttached();
    await expect(
      page.getByText('Opening your private screen…', { exact: true }),
    ).toHaveCount(0);
  }
});
