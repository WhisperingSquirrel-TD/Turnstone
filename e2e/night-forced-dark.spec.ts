import { expect, test } from '@playwright/test';
import { createPublicView } from './support/public-view';
import { installLiveSocketViewFixture } from './support/live-socket-view';

for (const width of [320, 390, 430]) {
  test(`owner regression: night forced dark at ${width}, preference preserved`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.clock.install();
    await page.addInitScript(() => {
      const preference = new URL(location.href).searchParams.get('testDisplay');
      if (preference)
        localStorage.setItem('oathstone:display-theme', preference);
    });
    const gameId = 'forced-night-theme';
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
    await page.route(`**/api/games/${gameId}/**`, (route) =>
      route.fulfill({ json: envelope() }),
    );
    for (const preference of ['light', 'dark', 'system']) {
      for (const phase of ['DEBATE', 'SHADOW', 'DAWN'] as const) {
        view = { ...view, phase, version: view.version + 1 };
        await page.goto(`/game/${gameId}?testDisplay=${preference}`);
        await page.clock.runFor(300);
        await expect(page.locator('.game-shell').first()).toHaveAttribute(
          'data-game-theme',
          phase === 'SHADOW' || preference === 'dark' ? 'night' : 'day',
        );
        expect(
          await page.evaluate(() =>
            localStorage.getItem('oathstone:display-theme'),
          ),
        ).toBe(preference);
      }
    }
    // Setup screens use the same saved device choice, not hard-coded paper.
    await page.goto('/');
    await expect(page.locator('.entry-experience')).toHaveAttribute(
      'data-game-theme',
      'day',
    );
    await page.goto('/?testDisplay=dark');
    await expect(page.locator('.entry-experience')).toHaveAttribute(
      'data-game-theme',
      'night',
    );
    await page.getByTestId('button-practise-alone').click();
    await expect(page.locator('.entry-experience')).toHaveAttribute(
      'data-game-theme',
      'night',
    );
    await page.goto('/?testDisplay=dark');
    await expect(page.locator('.entry-experience')).toHaveAttribute(
      'data-game-theme',
      'night',
    );
  });
}
