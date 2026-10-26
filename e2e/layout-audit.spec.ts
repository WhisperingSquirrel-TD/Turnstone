import { expect, test } from '@playwright/test';
import { choiceCompletionScope } from './support/choice-completion';

import {
  auditApplicationLayout,
  auditFocusAndBorders,
  inspectVisibleLayout,
} from './support/layout-audit';

test('night completion checks the submitted round, not a new round’s dock controls', async ({
  page,
}) => {
  await page.setContent(`<div data-testid="player-game" data-phase="SHADOW"
    data-shadow-round="1" data-shadow-slot="1"></div>
    <aside><button>Review this choice</button><button>Confirm this choice</button></aside>`);
  const submitted = page.locator(
    choiceCompletionScope({ phase: 'SHADOW', round: '1', slot: '1' }),
  );
  await expect(
    submitted.getByRole('button', { name: 'Review this choice' }),
  ).toBeVisible();
  await page
    .getByTestId('player-game')
    .evaluate((el) => el.setAttribute('data-shadow-round', '2'));
  await expect(
    submitted.getByRole('button', { name: 'Review this choice' }),
  ).toBeHidden();
  await expect(
    submitted.getByRole('button', { name: 'Confirm this choice' }),
  ).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Review this choice' }),
  ).toBeVisible();
});

test('the focus pass never tabs out of the page and blurs the window', async ({
  page,
}) => {
  // A window blur re-arms the DEAL privacy shield; tabbing off the last
  // control blurred the audited page and stalled the CI layout audit.
  await page.setContent(
    '<button>first</button><button id="last">last</button>',
  );
  await page.evaluate(() => {
    const events: string[] = [];
    (window as unknown as { auditEvents: string[] }).auditEvents = events;
    window.addEventListener('blur', () => events.push('blur'));
  });
  await page.focus('#last');
  await auditFocusAndBorders(page, 'last-control-focused');
  expect(
    await page.evaluate(
      () => (window as unknown as { auditEvents: string[] }).auditEvents,
    ),
  ).toEqual([]);
  await expect(page.locator(':focus')).toHaveCount(1);
});

test('owner regression: clipped focus ring is detected and an inset ring stays visible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{margin:16px}main{overflow:hidden}input{box-sizing:border-box;width:100%;height:56px}
    input:focus{outline:3px solid brown;outline-offset:3px}</style>
    <main><input id="name" aria-label="Name"></main>`);
  expect(
    (await auditFocusAndBorders(page, 'clipped-focus-ring')).some(
      (f) => f.kind === 'focus-ring-clipped',
    ),
  ).toBe(true);
  await page.addStyleTag({ content: 'input:focus{outline-offset:-3px}' });
  expect(await auditFocusAndBorders(page, 'inset-focus-ring')).toEqual([]);
});

test('owner regression: scrollbar overlap includes bordered boxes, not just text', async ({
  page,
}) => {
  await page.setContent(`<style>main{width:260px;height:200px;overflow:auto;scrollbar-gutter:stable}
    .card{width:280px;height:100px;border:1px solid black}</style>
    <main><div class="card" id="card"></div><div style="height:500px"></div></main>`);
  expect(
    (await auditFocusAndBorders(page, 'scrollbar-overlap')).some(
      (f) => f.kind === 'border-under-scrollbar-or-clipped',
    ),
  ).toBe(true);
});

test('bounded main scroll area keeps every target clear at both edges', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{margin:0}main{height:540px;overflow:auto;padding:16px;box-sizing:border-box}
    button{width:160px;height:56px}footer{position:fixed;inset:540px 0 0;background:white}</style>
    <main><p>First explanation</p><div style="height:800px"></div><button id="last">Last action</button></main>
    <footer><button>Dock action</button></footer>`);
  expect(await auditApplicationLayout(page, 'bounded-content')).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(
    640,
  );
});

test('automatic layout audit distinguishes clipped live announcements from visible content', async ({
  page,
}) => {
  await page.setContent(
    '<meta name="viewport" content="width=device-width, initial-scale=1"><p role="status" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">Status announcement</p><button style="min-width:120px;height:56px">Continue</button>',
  );
  expect(await inspectVisibleLayout(page, 'accessible-status')).toEqual([]);
});

test('automatic layout audit checks the active menu without treating its background as a sibling collision', async ({
  page,
}) => {
  await page.setContent(
    '<meta name="viewport" content="width=device-width, initial-scale=1"><details open class="public-home-menu"><summary style="min-width:44px;height:44px">Menu</summary><div style="position:absolute;top:60px;left:10px;padding:20px;background:white"><button style="min-width:120px;height:56px">Light</button></div></details><p style="margin-top:20px">Background copy</p>',
  );
  expect(await inspectVisibleLayout(page, 'active-menu')).toEqual([]);
});

test('automatic layout audit detects overlapping checkbox text without reporting its contents', async ({
  page,
}) => {
  await page.setContent(
    '<meta name="viewport" content="width=device-width, initial-scale=1"><label style="display:grid;grid-template-columns:20px 1fr;gap:12px"><input id="box" type="checkbox" style="width:44px;height:44px;margin:0"><span id="description">Presenter description</span></label>',
  );
  const findings = await inspectVisibleLayout(page, 'checkbox-reproducer');
  expect(findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'overlap',
        selectors: ['#box', '#description'],
      }),
    ]),
  );
  expect(JSON.stringify(findings)).not.toContain('Presenter description');
});

test('automatic layout audit permits normal scroll-edge crossing only when the control is fully reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(
    '<meta name="viewport" content="width=device-width, initial-scale=1"><div style="height:800px"></div><button id="last-control" style="width:160px;height:56px">Continue</button><div style="height:800px"></div>',
  );
  const findings = await auditApplicationLayout(
    page,
    'scroll-boundary-reproducer',
  );
  expect(findings).toEqual([]);
});

for (const [name, html, kind] of [
  [
    'fixed footer covering Create game',
    '<div style="height:900px"></div><button id="create" style="width:160px;height:56px">Create game</button><footer style="position:fixed;bottom:0;height:90px;width:100%;background:white">Credit</footer>',
    'covered-after-scroll',
  ],
  [
    'Lobby share button half hidden behind dock',
    '<div style="height:900px"></div><button id="share" style="width:160px;height:56px;margin-bottom:20px">Share</button><div style="position:fixed;bottom:0;height:60px;width:100%;background:white">Dock</div>',
    'covered-after-scroll',
  ],
  [
    'two fixed bars overlap',
    '<header style="position:fixed;top:0;width:100%;height:60px">Header</header><aside style="position:fixed;top:30px;width:100%;height:60px">Notice</aside>',
    'fixed-bars-overlap',
  ],
  [
    'ancestor hides meaningful text',
    '<div style="overflow:hidden;width:60px"><p id="meaning" style="width:200px">Meaningful text must never be truncated</p></div>',
    'ancestor-clipping',
  ],
] as const) {
  test(`automatic layout audit regression: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(
      `<meta name="viewport" content="width=device-width,initial-scale=1">${html}`,
    );
    expect(await auditApplicationLayout(page, name)).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind })]),
    );
  });
}

test('unresolved game header and recovery controls fit every phone width', async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await page.clock.install();
  await page.route('**/api/games/header-unavailable/**', (route) =>
    route.fulfill({
      status: 404,
      json: { error: { code: 'NOT_FOUND', message: 'Game not found' } },
    }),
  );
  for (const width of [320, 360, 375, 390, 430]) {
    for (const palette of ['day', 'night'] as const) {
      await page.setViewportSize({
        width,
        height: width === 320 ? 640 : width === 360 ? 740 : 844,
      });
      await page.emulateMedia({
        colorScheme: palette === 'night' ? 'dark' : 'light',
        reducedMotion: 'reduce',
      });
      const failedView = page.waitForResponse(
        (response) =>
          response.url().includes('/api/games/header-unavailable/view') &&
          response.status() === 404,
      );
      await page.goto('/game/header-unavailable?clips=off');
      await failedView;
      await page.clock.fastForward(300);
      await expect(page.locator('main')).toContainText(
        /could|can[’']t|cannot|unavailable|not found|problem|check|error/i,
      );
      await expect(page.locator('.game-status-phase-label')).toHaveText('Game');
      await page.evaluate(() => document.fonts.ready);
      expect(
        await auditApplicationLayout(page, `game-error-${width}-${palette}`),
      ).toEqual([]);
      expect(
        await auditFocusAndBorders(page, `game-error-${width}-${palette}`),
      ).toEqual([]);
      if (
        process.env.R7_AUDIT_CAPTURE === '1' &&
        info.project.name === 'Pixel'
      ) {
        await page.screenshot({
          path: `docs/screens/round-7-audit/game-error-${width}-${palette}.jpg`,
          type: 'jpeg',
          quality: 40,
        });
      }
    }
  }
});
