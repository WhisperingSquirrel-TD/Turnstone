import { expect, test } from '@playwright/test';
import { createPublicView } from './support/public-view';
import type { FullView } from '../lib/shared/src/contracts';

for (const rehearsal of [false, true]) {
  test(`${rehearsal ? 'Practice' : 'normal game'} start handoff and all public clip mappings`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.addInitScript(() => {
      const events: unknown[] = [];
      Object.assign(window, { __publicClipEvents: events });
      for (const name of ['loadstart', 'canplay', 'playing', 'error']) {
        document.addEventListener(
          name,
          (event) => {
            if (event.target instanceof HTMLVideoElement)
              events.push({
                event: name,
                at: Math.round(performance.now()),
                source: new URL(event.target.currentSrc || location.href)
                  .pathname,
                code: event.target.error?.code,
              });
          },
          true,
        );
      }
    });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    let view = {
      ...createPublicView('clip-sequence'),
      phase: 'LOBBY',
      cycle: 0,
      rehearsal,
      phaseStartedAt: Date.now(),
      seats: Array.from({ length: 6 }, (_, index) => ({
        id: index === 0 ? 'seat-morgan' : `seat-${index}`,
        name: index === 0 ? 'Morgan' : `Player ${index + 1}`,
        status: 'alive',
      })),
    } as FullView & { phaseStartedAt: number };
    const begin = () => {
      view = { ...view, phase: 'DEAL', phaseStartedAt: Date.now() };
      return { serverNow: Date.now(), version: view.version, view };
    };
    await page.route('**/api/csrf', (route) =>
      route.fulfill({ json: { csrfToken: 'c'.repeat(64) } }),
    );
    await page.route('**/api/games/*/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/commands')) {
        expect(route.request().postDataJSON().type).toBe('StartGame');
        return route.fulfill({ json: begin() });
      }
      if (path.endsWith('/join-requests'))
        return route.fulfill({ json: { requests: [] } });
      if (path.endsWith('/invites'))
        return route.fulfill({
          json: {
            gameId: view.id,
            shortCode: 'ABC234',
            joinUrl: `https://oathstone.test/join/${view.id}#${'i'.repeat(43)}`,
          },
        });
      if (path.endsWith('/view'))
        return route.fulfill({
          json: { serverNow: Date.now(), version: view.version, view },
        });
      return route.fulfill({ json: {} });
    });
    await page.route('**/api/rehearsals', (route) => {
      view.id = route.request().postDataJSON().gameId;
      return route.fulfill({ json: begin() });
    });

    if (rehearsal) {
      await page.goto('/?entry=rehearsal');
      await page.getByTestId('input-rehearsal-name').fill('Morgan');
      await page.getByTestId('button-start-rehearsal').click();
    } else {
      await page.goto(`/coordinate/${view.id}?players=6`);
      await page.getByTestId('button-start-game').click();
    }
    await expect(page).toHaveURL(/\/game\//);

    const expectClip = async (name: string) => {
      const overlay = page.getByTestId('phase-clip-overlay');
      await expect(overlay).toHaveAttribute('data-clip-name', name);
      try {
        await expect(overlay).toHaveCSS('opacity', '1');
      } catch (error) {
        console.error(
          'Public clip playback events:',
          await page.evaluate(
            () =>
              (window as Window & { __publicClipEvents?: unknown[] })
                .__publicClipEvents,
          ),
        );
        throw error;
      }
      const video = overlay.locator('video');
      await expect(video).toHaveJSProperty('muted', true);
      await expect(video).toHaveJSProperty('paused', false);
      await expect(video).toHaveJSProperty('controls', false);
      expect(
        await overlay.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const target = document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          );
          return target !== null && element.contains(target);
        }),
        'the playing clip must not be hidden beneath a privacy cover',
      ).toBe(true);
      await overlay.click({ position: { x: 10, y: 10 } });
      await expect(overlay).toHaveCount(0);
    };
    await expectClip('game-start');
    await page.reload();
    await expect(page.getByTestId('player-game')).toHaveAttribute(
      'data-phase',
      'DEAL',
    );
    await expect(page.getByTestId('phase-clip-overlay')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.keys(sessionStorage).filter((key) =>
            key.startsWith('oathstone-phase-clip:'),
          ),
        ),
      )
      .toHaveLength(1);
    await page.evaluate(() => {
      for (const key of Object.keys(sessionStorage))
        if (key.startsWith('oathstone-phase-clip:'))
          sessionStorage.removeItem(key);
    });
    await page.reload();
    await expect(page.getByTestId('player-game')).toHaveAttribute(
      'data-phase',
      'DEAL',
    );
    await expect(page.getByTestId('phase-clip-overlay')).toHaveCount(0);

    const phases = [
      ['VERDICT', 'verdict', null],
      ['SHADOW', 'nightfall', null],
      ['DAWN', 'dawn', null],
      ['FINISHED', 'gameover-faithful', 'faithful'],
      ['FINISHED', 'gameover-traitor', 'traitor'],
    ] as const;
    for (const [phase, clip, winner] of phases) {
      view = {
        ...view,
        phase,
        cycle: view.cycle + 1,
        phaseStartedAt: Date.now(),
        version: view.version + 1,
        winner,
        publicAnnouncement:
          phase === 'VERDICT'
            ? {
                kind: 'verdict',
                cycle: 1,
                seat: { id: 'seat-1', name: 'Player 2' },
              }
            : null,
      };
      const announcement = view.publicAnnouncement;
      if (phase === 'VERDICT') {
        view.publicAnnouncement = null;
        view.phaseStartedAt = Date.now() - 120_000;
      }
      await page.reload();
      if (phase === 'VERDICT') {
        await expect(page.getByTestId('player-game')).toHaveAttribute(
          'data-phase',
          'VERDICT',
        );
        await expect(page.getByTestId('phase-clip-overlay')).toHaveCount(0);
        view.publicAnnouncement = announcement;
        view.version += 1;
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
        await expect(page.getByTestId('player-game')).toHaveAttribute(
          'data-version',
          String(view.version),
        );
      }
      await expectClip(clip);
    }
  });
}
