import { expect, test } from '@playwright/test';
import {
  auditApplicationLayout,
  inspectVisibleLayout,
} from './support/layout-audit';

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
