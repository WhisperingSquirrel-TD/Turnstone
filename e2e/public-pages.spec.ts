import { expect, test } from '@playwright/test';
import { PRE_LAUNCH_NOINDEX } from '../lib/security/src/deployment';

const requiredQuestions = [
  'Is there a free alternative to the WhatsApp traitors game?',
  'Is Oathstone the official game from the TV show?',
  'Do I need WhatsApp or an app?',
];

test('FAQ, comparison and llms.txt are public, complete and pre-launch noindex', async ({
  request,
}) => {
  for (const route of ['/faq', '/compare', '/llms.txt']) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(200);
    expect(response.headers()['x-robots-tag']).toBe(
      PRE_LAUNCH_NOINDEX ? 'noindex, nofollow' : undefined,
    );
  }

  const faqResponse = await request.get('/faq');
  const faqHtml = await faqResponse.text();
  for (const question of requiredQuestions) expect(faqHtml).toContain(question);
  expect(faqHtml).toContain('Oathstone is an independent game');
  for (const fact of [
    '5 to 40 players',
    'One hour to two weeks',
    'Any modern phone or tablet browser',
    'Privacy shield designed for private reveals',
  ]) {
    expect(faqHtml).toContain(fact);
  }

  const compareResponse = await request.get('/compare');
  const compareHtml = await compareResponse.text();
  for (const question of requiredQuestions)
    expect(compareHtml).toContain(question);
  for (const category of [
    'Boxed games',
    'Week-long chat games',
    'Single-player apps',
    'Werewolf apps with a moderator',
    'Do-it-yourself games',
    'Oathstone',
  ]) {
    expect(compareHtml).toContain(category);
  }
  expect(compareHtml).not.toContain('Traitors-style');

  const llmsResponse = await request.get('/llms.txt');
  const llmsText = await llmsResponse.text();
  for (const question of requiredQuestions)
    expect(llmsText).toContain(question);
  for (const fact of [
    '5 to 40 players',
    'One hour to two weeks',
    'Any modern phone or tablet browser',
    'Privacy shield designed for private reveals',
  ]) {
    expect(llmsText).toContain(fact);
  }
});

test('the public home page does not request CSRF on load', async ({ page }) => {
  const csrfRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/api/csrf')) {
      csrfRequests.push(request.url());
    }
  });
  await page.goto('/');
  expect(csrfRequests).toEqual([]);
});

test('public pages stay centred and usable across phone, tablet and desktop widths', async ({
  page,
}) => {
  for (const width of [320, 375, 390, 414, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1024 });
    for (const route of ['/', '/faq', '/compare']) {
      await page.goto(route);
      const layout = await page.evaluate(() => {
        const rect = (selector: string) => {
          const element = document.querySelector<HTMLElement>(selector);
          if (!element) return null;
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height };
        };
        const main = rect('main');
        const title = rect('#public-home-title');
        const actions = rect('.public-home-actions');
        const titleElement = document.querySelector('#public-home-title');
        const titleRange = document.createRange();
        if (titleElement) titleRange.selectNodeContents(titleElement);
        const titleTextBounds = titleElement
          ? (() => {
              const { x, width } = titleRange.getBoundingClientRect();
              return { x, width };
            })()
          : null;
        const heroCopy = document.querySelector<HTMLElement>(
          '.public-home-hero-copy',
        );
        const demo = rect('.public-home-demo');
        const menu = document.querySelector<HTMLElement>('.public-home-menu');
        const nav = document.querySelector<HTMLElement>(
          '.public-home-brand > .public-home-nav',
        );
        return {
          viewportWidth: window.innerWidth,
          scrollWidth: Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ),
          main,
          title,
          titleTextBounds,
          actions,
          demo,
          heroCopyTextAlign: heroCopy
            ? getComputedStyle(heroCopy).textAlign
            : 'missing',
          menuDisplay: menu ? getComputedStyle(menu).display : 'missing',
          navDisplay: nav ? getComputedStyle(nav).display : 'missing',
          actionHeights: Array.from(
            document.querySelectorAll<HTMLElement>('.public-home-actions a'),
          ).map((element) => element.getBoundingClientRect().height),
        };
      });

      expect(layout.scrollWidth, `${route} at ${width}px`).toBeLessThanOrEqual(
        width,
      );
      expect(layout.main).not.toBeNull();
      expect(
        Math.abs(
          layout.main!.x + layout.main!.width / 2 - layout.viewportWidth / 2,
        ),
        `${route} main centring at ${width}px`,
      ).toBeLessThanOrEqual(1);
      if (width <= 900) {
        await expect(
          page.locator('.public-home-menu summary'),
          `${route} menu at ${width}px`,
        ).toBeVisible();
        expect(layout.navDisplay).toBe('none');
      } else {
        expect(layout.menuDisplay).toBe('none');
        expect(layout.navDisplay).not.toBe('none');
      }

      if (route === '/' && width <= 414) {
        expect(layout.title).not.toBeNull();
        expect(layout.titleTextBounds).not.toBeNull();
        expect(layout.actions).not.toBeNull();
        expect(
          Math.abs(
            layout.titleTextBounds!.x +
              layout.titleTextBounds!.width / 2 -
              layout.viewportWidth / 2,
          ),
          `hero title centring at ${width}px`,
        ).toBeLessThanOrEqual(2);
        expect(layout.heroCopyTextAlign).toBe('center');
        expect(
          Math.abs(
            layout.actions!.x +
              layout.actions!.width / 2 -
              layout.viewportWidth / 2,
          ),
          `actions centring at ${width}px`,
        ).toBeLessThanOrEqual(2);
        expect(layout.actionHeights.every((height) => height >= 44)).toBe(true);
      }

      if (route === '/' && width === 768) {
        expect(layout.demo).not.toBeNull();
        expect(
          layout.title!.x + layout.title!.width,
          'tablet hero copy must not overlap the demo',
        ).toBeLessThan(layout.demo!.x);
      }
    }
  }
});

test('the FAQ route opens directly in a fresh browser page', async ({
  page,
}) => {
  await page.goto('/faq');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Frequently asked questions' }),
  ).toBeVisible();
});

test('the comparison route opens directly in a fresh browser page', async ({
  page,
}) => {
  await page.goto('/compare');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Compare game formats' }),
  ).toBeVisible();
});

test('home and app first paint stay styled with JavaScript disabled', async ({
  page,
}) => {
  let blockedScripts = 0;
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() === 'script') {
      blockedScripts += 1;
      await route.abort();
      return;
    }
    await route.continue();
  });

  const homeResponse = await page.goto('/');
  expect(homeResponse?.status()).toBe(200);
  const homeBrand = page.locator(
    '#static-home header.public-home-brand .oathstone-wordmark',
  );
  await expect(homeBrand).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Start a new game' }),
  ).toBeVisible();
  await expect(page.locator('#static-home')).toContainText(
    'A game of traitors and faithful.',
  );
  expect(
    await homeBrand.evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain('Playfair Display');
  expect(
    await page
      .locator('body')
      .evaluate((element) => getComputedStyle(element).backgroundImage),
  ).toContain('linear-gradient');

  const playResponse = await page.goto('/play');
  expect(playResponse?.status()).toBe(200);
  const appBrand = page.locator(
    '#static-home header.public-home-brand.public-shell-header .oathstone-wordmark',
  );
  await expect(appBrand).toBeVisible();
  await expect(appBrand.locator('.text-gilt')).toBeVisible();
  expect((await appBrand.innerText()).replace(/\s+/g, '')).toBe('Oathstone');
  const appShellText = await page.locator('#static-home').innerText();
  expect(appShellText).not.toContain('Start a new game');
  expect(appShellText).not.toContain('A game of traitors and faithful.');
  expect(
    await appBrand.evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain('Playfair Display');
  expect(
    await page
      .locator('body')
      .evaluate((element) => getComputedStyle(element).backgroundImage),
  ).toContain('linear-gradient');
  expect(blockedScripts).toBeGreaterThan(0);
});
