import { expect, test } from '@playwright/test';
import { PRE_LAUNCH_NOINDEX } from '../lib/security/src/deployment';
import { PUBLIC_MARKETING_ROUTE_PATHS } from '../lib/shared/src/app-routes';

const requiredQuestions = [
  'Is there a free alternative to chat-based hidden-traitor games?',
  'Is Oathstone affiliated with a television programme?',
  'Do I need WhatsApp or an app?',
];
const requiredChatGameAnswer =
  'Yes. Many versions of this kind of game play out as group-chat messages over a week, charge per player and limit numbers. Oathstone is different: it is free for everyone, with no per-player tickets; it takes up to 40 players, and families with children can play together; you play face to face in one room, with phones used only for secrets; there are no phone numbers or group chats, just a code and a first name; secrets stay secret with hold-to-reveal and identical screens for every role; and it works anywhere, for an hour or a fortnight.';

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
  expect(faqHtml).toContain(requiredChatGameAnswer);
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
  expect(compareHtml).toContain(requiredChatGameAnswer);
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
  expect(llmsText).toContain(requiredChatGameAnswer);
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
  for (const width of [320, 375, 390, 414, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1024 });
    for (const route of ['/about', '/how-to-play', '/faq', '/compare']) {
      await page.goto(route);
      const layout = await page.evaluate(() => {
        const rect = (selector: string) => {
          const element = document.querySelector<HTMLElement>(selector);
          if (!element) return null;
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height };
        };
        const main = rect('main');
        const menu = document.querySelector<HTMLElement>('.public-home-menu');
        return {
          viewportWidth: window.innerWidth,
          scrollWidth: Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ),
          main,
          menuDisplay: menu ? getComputedStyle(menu).display : 'missing',
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
      await expect(
        page.locator('.public-home-menu summary'),
        `${route} menu at ${width}px`,
      ).toBeVisible();
      expect(layout.menuDisplay).not.toBe('none');
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

test('all public pages fit the requested widths in portrait and landscape', async ({
  page,
}) => {
  const widths = [320, 360, 375, 390, 414, 430, 768, 1024, 1280];

  for (const route of PUBLIC_MARKETING_ROUTE_PATHS) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    if (route === '/') {
      // Measure the hydrated entry, not the static first paint it replaces.
      await expect(page.locator('.entry-experience')).toBeVisible();
      await expect(page.getByTestId('button-create-game')).toBeVisible();
    }
    for (const width of widths) {
      for (const height of [
        Math.max(900, width + 100),
        Math.max(240, Math.min(700, width - 1)),
      ]) {
        await page.setViewportSize({ width, height });
        const layout = await page.evaluate(() => {
          const visible = (element: Element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== 'none' &&
              style.visibility !== 'hidden'
            );
          };
          const targets = Array.from(
            document.querySelectorAll(
              'a, button, summary, input, select, textarea',
            ),
          )
            .filter(visible)
            .map((element) => {
              const { width, height } = element.getBoundingClientRect();
              return { width, height, label: element.textContent?.trim() };
            });
          const copySizes = Array.from(
            document.querySelectorAll(
              'main p, main li, main summary, main dt, main dd, main blockquote, main label, main a, .brand-credit, .brand-credit small',
            ),
          )
            .filter(visible)
            .map((element) =>
              Number.parseFloat(getComputedStyle(element).fontSize),
            );
          const clippedText = Array.from(
            document.querySelectorAll(
              'main h1, main h2, main p, main a, main button, main summary, main li',
            ),
          )
            .filter(visible)
            .flatMap((element) => {
              const range = document.createRange();
              range.selectNodeContents(element);
              return Array.from(range.getClientRects())
                .filter(
                  (rect) =>
                    rect.left < -1 || rect.right > window.innerWidth + 1,
                )
                .map(() => element.textContent?.trim());
            });
          return {
            scrollWidth: Math.max(
              document.documentElement.scrollWidth,
              document.body.scrollWidth,
            ),
            viewportWidth: window.innerWidth,
            undersizedTargets: targets.filter(
              (target) => target.width < 44 || target.height < 44,
            ),
            clippedText,
            smallestBodyCopy: Math.min(...copySizes),
          };
        });

        expect(
          layout.scrollWidth,
          `${route} at ${width}px × ${height}px`,
        ).toBeLessThanOrEqual(layout.viewportWidth);
        expect(
          layout.undersizedTargets,
          `${route} has a tap target below 44px at ${width}px × ${height}px`,
        ).toEqual([]);
        expect(
          layout.clippedText,
          `${route} has clipped text at ${width}px × ${height}px`,
        ).toEqual([]);
        expect(
          layout.smallestBodyCopy,
          `${route} body copy is below 15px at ${width}px × ${height}px`,
        ).toBeGreaterThanOrEqual(15);
      }
    }
  }
});

test('public pages have a working keyboard skip link and visible focus style', async ({
  page,
}) => {
  await page.goto('/about');
  const skipLink = page.getByRole('link', { name: 'Skip to content' });
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  const focusStyle = await skipLink.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(focusStyle.outlineStyle).not.toBe('none');
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThan(0);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
});

test('all public pages remain readable without JavaScript and honour reduced motion', async ({
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

  for (const route of PUBLIC_MARKETING_ROUTE_PATHS) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator('main#main h1'), route).toBeVisible();
    expect(
      (await page.locator('main#main').innerText()).trim().length,
      `${route} must contain readable public content`,
    ).toBeGreaterThan(20);
    expect(
      await page.locator('meta[name="viewport"]').getAttribute('content'),
      route,
    ).toContain('viewport-fit=cover');
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const motion = await page
    .locator('.public-home-content h1')
    .evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        transitionDuration: Math.max(
          ...style.transitionDuration
            .split(',')
            .map((value) => Number.parseFloat(value)),
        ),
      };
    });
  expect(motion.reducedMotion).toBe(true);
  expect(motion.transitionDuration).toBeLessThan(0.001);
  expect(blockedScripts).toBeGreaterThan(0);
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
  const rootEntry = page.locator('#static-home.safe-page');
  await expect(rootEntry).toBeVisible();
  await expect(rootEntry.locator('.game-entry-static')).toBeVisible();
  for (const choice of ['Create a new game', 'Join a game', 'Practise alone']) {
    await expect(
      page.getByRole('link', { name: choice, exact: true }),
    ).toBeVisible();
  }
  expect(
    await page
      .getByRole('heading', { level: 1 })
      .evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain('Playfair Display');
  const entryCopyGap = await rootEntry
    .locator('.game-entry-static > p')
    .first()
    .evaluate((paragraph) => {
      const heading = paragraph.previousElementSibling;
      if (!(heading instanceof HTMLElement)) return -1;
      return (
        paragraph.getBoundingClientRect().top -
        heading.getBoundingClientRect().bottom
      );
    });
  expect(entryCopyGap).toBeGreaterThanOrEqual(8);
  expect(
    await page
      .locator('#static-home.safe-page')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(250, 248, 241)');

  const aboutResponse = await page.goto('/about');
  expect(aboutResponse?.status()).toBe(200);
  await expect(page.locator('main#main')).toContainText(
    'Oathstone is an independent game made by Stackstone Consulting',
  );
  expect(
    await page
      .locator('main#main')
      .evaluate((element) => getComputedStyle(element).backgroundImage),
  ).toBe('none');
  expect(blockedScripts).toBeGreaterThan(0);
});

// D119: noindex everywhere, but agents may read the public pages. No
// sitemap; every public page links to the company page and to the game;
// missions are off in the beta.
test('public pages are agent-readable, cross-linked and promise no missions', async ({
  request,
}) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Allow: /faq');
  expect(robots).toContain('Allow: /llms.txt');
  expect(robots).toContain('Disallow: /api/');
  expect(robots).not.toMatch(/^Disallow: \/$/m);
  expect(robots).not.toMatch(/sitemap/i);
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.headers()['content-type'] ?? '').not.toContain('xml');

  for (const route of ['/faq', '/compare', '/about', '/how-to-play']) {
    const html = await (await request.get(route)).text();
    expect(html, route).toContain(
      '<link rel="canonical" href="https://stackstoneconsulting.co.uk/oathstone">',
    );
    expect(html, route).toContain('Full details');
    expect(html.replaceAll('Missions are coming soon.', ''), route).not.toMatch(
      /mission|prize pot/i,
    );
  }
  const llms = await (await request.get('/llms.txt')).text();
  expect(llms).toContain(
    'Full details: https://stackstoneconsulting.co.uk/oathstone',
  );
  expect(llms).toContain('Play: https://oathstone.stackstoneconsulting.co.uk');
  expect(llms).toContain('Players discuss suspicions and vote together.');
});
