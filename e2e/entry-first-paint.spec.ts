import { expect, test, type Page } from '@playwright/test';

// Owner, 1 November 2026: the first-paint entry must not jump when the app
// takes over. The static page and the hydrated welcome must line up.
const parts = [
  { name: 'beta tag', find: (p: Page) => p.getByTestId('beta-tag') },
  {
    name: 'title',
    find: (p: Page) => p.getByRole('heading', { level: 1 }),
  },
  {
    name: 'subtitle',
    find: (p: Page) =>
      p.getByText('A game of traitors and faithful.', { exact: true }),
  },
  {
    name: 'description',
    find: (p: Page) =>
      p.getByText('Everyone plays. Even the host.', { exact: true }),
  },
  {
    name: 'join',
    find: (p: Page) => p.getByText('Join a game', { exact: true }),
  },
  {
    name: 'create',
    find: (p: Page) => p.getByText('Create a new game', { exact: true }),
  },
  {
    name: 'practise',
    find: (p: Page) => p.getByText('Practise alone', { exact: true }),
  },
  {
    name: 'about',
    find: (p: Page) =>
      p.locator('main').getByText('About Oathstone', { exact: true }),
  },
  {
    name: 'beta note',
    find: (p: Page) => p.getByText(/^Thanks for trying Oathstone early\./),
  },
  {
    name: 'credit',
    find: (p: Page) =>
      p.getByText('made by Stackstone Consulting', { exact: true }),
  },
];

async function measure(page: Page) {
  const result: Record<string, number[] | string> = {};
  for (const part of parts) {
    const locator = part.find(page).first();
    await expect(locator, part.name).toBeVisible();
    const box = (await locator.boundingBox())!;
    result[part.name] = [box.x, box.y, box.width, box.height].map(Math.round);
    result[`${part.name} border`] = await locator.evaluate(
      (element) => getComputedStyle(element).borderTopWidth,
    );
  }
  return result;
}

for (const width of [320, 390, 430]) {
  test(`first-paint entry matches the app's welcome at ${width}px`, async ({
    browser,
  }, info) => {
    test.skip(info.project.name !== 'Pixel', 'Geometry is checked once.');
    const viewport = { width, height: 844 };
    // Reduced motion: the welcome's entrance animation is not layout.
    const plain = await browser.newContext({
      viewport,
      javaScriptEnabled: false,
      reducedMotion: 'reduce',
    });
    const app = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    try {
      const staticPage = await plain.newPage();
      await staticPage.goto('/');
      const before = await measure(staticPage);
      const appPage = await app.newPage();
      await appPage.route('**/api/csrf', (route) =>
        route.fulfill({ json: { csrfToken: 'a'.repeat(43) } }),
      );
      await appPage.goto('/');
      await expect(appPage.getByTestId('button-create-game')).toBeVisible();
      const after = await measure(appPage);
      for (const [key, value] of Object.entries(after)) {
        if (typeof value === 'string') {
          expect(before[key], key).toBe(value);
          continue;
        }
        const was = before[key] as number[];
        value.forEach((n, i) =>
          expect(
            Math.abs(n - was[i]!),
            `${key} [x,y,w,h][${i}]`,
          ).toBeLessThanOrEqual(2),
        );
      }
    } finally {
      await plain.close();
      await app.close();
    }
  });
}

test('first-paint entry follows a dark phone before the app loads', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'Pixel', 'Theme is checked once.');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
  });
  try {
    const page = await context.newPage();
    // Hold the app back so only the first-paint entry and its theme run.
    await page.route('**/src/App.tsx*', () => undefined);
    await page.goto('/');
    const entry = page.locator('#static-home .entry-experience');
    await expect(entry).toHaveAttribute('data-game-theme', 'night');
    await expect(entry).toHaveCSS('background-color', 'rgb(27, 24, 21)');
  } finally {
    await context.close();
  }
});

test('first-paint entry stays until the app draws more than its loading line', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'Pixel', 'Hand-over is checked once.');
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'a'.repeat(43) } }),
  );
  // Hold the welcome screen's code: the app can only show its loading line.
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/src/EntryPage.tsx*', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/');
  await expect(page.locator('#root main[role="status"]')).toBeAttached();
  await expect(page.locator('#static-home')).toBeVisible();
  release();
  await expect(page.getByTestId('button-create-game')).toBeVisible();
  await expect(page.locator('#static-home')).toHaveCount(0);
});
