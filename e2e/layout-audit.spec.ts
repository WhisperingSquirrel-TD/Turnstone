import { expect, test } from '@playwright/test';
import { inspectVisibleLayout } from './support/layout-audit';

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

test('automatic layout audit identifies natural viewport clipping during whole-page scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(
    '<meta name="viewport" content="width=device-width, initial-scale=1"><div style="height:800px"></div><button id="last-control" style="width:160px;height:56px">Continue</button><div style="height:800px"></div>',
  );
  const findings = await inspectVisibleLayout(
    page,
    'scroll-boundary-reproducer',
  );
  expect(findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'viewport-clipping',
        selectors: ['#last-control'],
      }),
    ]),
  );
});
