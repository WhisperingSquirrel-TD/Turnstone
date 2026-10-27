import { expect, test } from '@playwright/test';

// Owner phone screenshot (27 October 2026): the welcome screen's "made by
// Stackstone Consulting" footer sat straight after the content, mid-page,
// instead of at the foot of the page.
for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
]) {
  test(`the welcome footer sits at the foot of the page at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByTestId('button-create-game')).toBeVisible();
    const footer = page.getByTestId('brand-footer-entry');
    await expect(footer).toBeVisible();
    const box = await footer.boundingBox();
    const pageHeight = await page.evaluate(() =>
      Math.max(
        document.documentElement.scrollHeight,
        document.documentElement.clientHeight,
      ),
    );
    expect(box).toBeTruthy();
    expect(Math.abs(box!.y + box!.height - pageHeight)).toBeLessThanOrEqual(1);
  });
}
