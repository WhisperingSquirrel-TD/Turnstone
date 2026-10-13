import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PRE_LAUNCH_NOINDEX } from '../lib/security/src/deployment';

test('home and play are accessible, reloadable and responsive', async ({
  page,
}) => {
  const homeResponse = await page.goto('/');
  expect(homeResponse?.headers()['x-robots-tag']).toBe(
    PRE_LAUNCH_NOINDEX ? 'noindex, nofollow' : undefined,
  );
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText(
    'Built by Stackstone Consulting',
  );
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole('link', { name: /play|enter/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/play$/);
  const playResponse = await page.reload();
  expect(playResponse?.headers()['x-robots-tag']).toBe(
    PRE_LAUNCH_NOINDEX ? 'noindex, nofollow' : undefined,
  );
  await expect(page.getByRole('main')).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 320, height: 700 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto('/');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
