import { expect, test } from '@playwright/test';
import type { FullView } from '../lib/shared/src/contracts';
import { createPublicView } from './support/public-view';
import { installLiveSocketViewFixture } from './support/live-socket-view';

// A window blur alone (another window focused, a notification shade, a test
// opening another page) must not hide public game screens. Private moments
// still cover on blur; DEAL re-arms its shield (e2e/shield-refocus.spec.ts).
for (const phase of ['DEBATE', 'VERDICT', 'DAWN', 'FINISHED'] as const)
  test(`a window blur keeps the public ${phase} screen visible`, async ({
    page,
  }) => {
    const gameId = `public-blur-${phase.toLowerCase()}`;
    const view: FullView = { ...createPublicView(gameId), phase };
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
    await expect(page.getByTestId('list-public-log')).toBeVisible();
    // Record any moment the public screen is replaced by the resume overlay.
    await page.evaluate(() => {
      const seen = { overlay: false };
      (window as unknown as { overlaySeen: typeof seen }).overlaySeen = seen;
      new MutationObserver(() => {
        if (document.querySelector('[data-testid="away-resync-overlay"]'))
          seen.overlay = true;
      }).observe(document.body, { childList: true, subtree: true });
    });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(500);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { overlaySeen: { overlay: boolean } })
            .overlaySeen.overlay,
      ),
    ).toBe(false);
    await expect(page.getByTestId('away-resync-overlay')).toHaveCount(0);
    await expect(page.locator(`[data-phase="${phase}"]`)).toBeAttached();
    await expect(page.getByTestId('list-public-log')).toBeVisible();
  });
