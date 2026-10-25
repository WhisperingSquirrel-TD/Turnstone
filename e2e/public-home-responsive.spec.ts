import { expect, test } from '@playwright/test';
import { renderPublicHomeHtml } from '../artifacts/party-game/src/public-site-content';
import {
  displayPreferenceKey,
  readDisplayPreference,
} from '../artifacts/party-game/src/game-theme';

test('loading the root entry does not reload an open public information page', async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.toLowerCase().includes('desktop'),
    'Vite development-server navigation regression runs once in desktop Chromium',
  );

  await page.goto('/faq');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Frequently asked questions' }),
  ).toBeVisible();

  const homeNavigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) homeNavigations.push(frame.url());
  });
  const unexpectedReload = page
    .waitForEvent('framenavigated', {
      predicate: (frame) => frame === page.mainFrame(),
      timeout: 2000,
    })
    .then(
      () => true,
      (error: unknown) => {
        if (error instanceof Error && error.name === 'TimeoutError') {
          return false;
        }
        throw error;
      },
    );

  const appPage = await page.context().newPage();
  await appPage.goto('/?entry=create');
  await expect(appPage.locator('body')).toBeVisible();

  expect(
    await unexpectedReload,
    'loading the root entry must not navigate the already-open public page',
  ).toBe(false);
  expect(homeNavigations).toEqual([]);
  await appPage.close();
});

test('the root entry uses the shared paper surface and stays mobile-first', async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.toLowerCase().includes('desktop'),
    'Responsive screenshot matrix runs once in desktop Chromium',
  );

  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  for (const label of ['Create a new game', 'Join a game', 'Practise alone']) {
    await expect(
      page.getByRole('button', { name: label, exact: true }),
    ).toBeVisible();
  }

  for (const width of [320, 375, 390, 414, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const pageWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(pageWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(
      width,
    );

    const targets = await page
      .locator(
        '.entry-choice-list button, .entry-brand-menu summary, .entry-brand-menu a',
      )
      .evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            visible:
              rect.width > 0 &&
              rect.height > 0 &&
              getComputedStyle(element).visibility !== 'hidden',
            width: rect.width,
            height: rect.height,
          };
        }),
      );
    expect(
      targets.length,
      `no measured tap targets at ${width}px`,
    ).toBeGreaterThan(0);
    expect(
      targets.filter(
        (target) => target.visible && (target.width < 44 || target.height < 44),
      ),
      `undersized targets at ${width}px`,
    ).toEqual([]);
    if (width <= 430) {
      const alignment = await page.evaluate(() => {
        const title = document.querySelector('main#entry-main h1');
        const choices = document.querySelector('.entry-choice-list');
        if (!title || !choices) {
          throw new Error('Entry title or choices are missing');
        }
        const bounds = (element: Element) => {
          const { x, width: elementWidth } = element.getBoundingClientRect();
          return { center: x + elementWidth / 2, width: elementWidth };
        };
        return {
          viewportWidth: window.innerWidth,
          title: bounds(title),
          choices: bounds(choices),
          buttonHeights: Array.from(
            choices.querySelectorAll('button'),
            (button) => button.getBoundingClientRect().height,
          ),
        };
      });
      expect(
        Math.abs(alignment.title.center - alignment.viewportWidth / 2),
        `entry title centring at ${width}px`,
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs(alignment.choices.center - alignment.viewportWidth / 2),
        `entry choices centring at ${width}px`,
      ).toBeLessThanOrEqual(2);
      expect(alignment.buttonHeights.every((height) => height >= 44)).toBe(
        true,
      );
    }

    if ([320, 390, 768, 1280].includes(width)) {
      const image = await page.screenshot({
        path: testInfo.outputPath(`root-entry-${width}.png`),
        fullPage: false,
      });
      expect(image.readUInt32BE(16)).toBe(width);
      const visualStyles = await page.evaluate(() => {
        const root = document.querySelector('.entry-experience');
        const heading = root?.querySelector('h1');
        const primary = root?.querySelector('.entry-choice-list button');
        const menu = document.querySelector('.entry-brand-menu');
        return {
          surface: root ? getComputedStyle(root).backgroundColor : '',
          headingSize: heading ? getComputedStyle(heading).fontSize : '',
          primaryHeight: primary
            ? Math.round(primary.getBoundingClientRect().height)
            : 0,
          menuDisplay: menu ? getComputedStyle(menu).display : 'missing',
        };
      });
      expect(visualStyles.surface).toBe('rgb(250, 248, 241)');
      expect(visualStyles.headingSize).toBe('30px');
      expect(visualStyles.primaryHeight).toBe(56);
      expect(visualStyles.menuDisplay).not.toBe('none');
    }
  }
});

test('entry pages share the paper shell and linked brand footer', async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.toLowerCase().includes('desktop'),
    'Entry visual and image regression runs once in desktop Chromium',
  );

  const screens = [
    { path: '/', root: '.entry-experience', hasBrandFooter: true },
    { path: '/join', root: '.entry-experience', hasBrandFooter: false },
    {
      path: '/?entry=create',
      root: '.entry-experience',
      hasBrandFooter: false,
    },
    {
      path: '/?entry=rehearsal',
      root: '.entry-experience',
      hasBrandFooter: false,
    },
    {
      path: '/about',
      root: '.safe-page:not(.game-shell)',
      hasBrandFooter: false,
    },
    {
      path: '/how-to-play',
      root: '.safe-page:not(.game-shell)',
      hasBrandFooter: false,
    },
    {
      path: '/faq',
      root: '.safe-page:not(.game-shell)',
      hasBrandFooter: false,
    },
    {
      path: '/compare',
      root: '.safe-page:not(.game-shell)',
      hasBrandFooter: false,
    },
    {
      path: '/coming-soon',
      root: '.safe-page:not(.game-shell)',
      hasBrandFooter: false,
    },
    {
      path: '/play/not-a-route',
      root: '.safe-page:not(.game-shell)',
      hasBrandFooter: false,
    },
  ];

  for (const screen of screens) {
    await page.goto(screen.path);
    const root = page.locator(screen.root);
    await expect(root, `page root at ${screen.path}`).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(
      root.locator('.public-home-menu summary, .entry-brand-menu summary'),
    ).toBeVisible();

    const style = await root.evaluate((element) => {
      const heading = element.querySelector('h1');
      const primary =
        element.querySelector('.entry-choice-list button') ??
        element.querySelector('.entry-action-dock button') ??
        element.querySelector('.not-found-action');
      return {
        background: getComputedStyle(element).backgroundColor,
        backgroundImage: getComputedStyle(element).backgroundImage,
        headingSize: heading ? getComputedStyle(heading).fontSize : '',
        headingFamily: heading ? getComputedStyle(heading).fontFamily : '',
        primaryHeight: primary
          ? Math.round(primary.getBoundingClientRect().height)
          : null,
      };
    });
    expect(style.background, `${screen.path} paper background`).toBe(
      'rgb(250, 248, 241)',
    );
    expect(style.backgroundImage, `${screen.path} has no form gradient`).toBe(
      'none',
    );
    expect(style.headingSize, `${screen.path} heading size`).toBe('30px');
    expect(style.headingFamily).toContain('Playfair Display');
    if (style.primaryHeight !== null) {
      expect(style.primaryHeight, `${screen.path} primary height`).toBe(56);
    }

    const brandFooterCount = await page
      .locator(
        '[data-testid="brand-footer-static"], [data-testid="brand-footer-entry"], [data-testid="brand-footer-shell"]',
      )
      .count();
    expect(brandFooterCount, `${screen.path} footer visibility`).toBe(1);

    const brokenImages = await page.locator('img').evaluateAll(async (images) =>
      (
        await Promise.all(
          images.map(async (element) => {
            const image = element as HTMLImageElement;
            try {
              await image.decode();
              return image.naturalWidth > 0
                ? null
                : image.currentSrc || image.src;
            } catch {
              return image.currentSrc || image.src;
            }
          }),
        )
      ).filter((source): source is string => source !== null),
    );
    expect(brokenImages, `broken image on ${screen.path}`).toEqual([]);
  }
});

test('legacy static-public demo fixture keeps its role secret until held', async ({
  page,
}) => {
  const fixtureHtml = `<!doctype html>
    <html lang="en-GB">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
        <title>Legacy static-public demo fixture</title>
        <link rel="stylesheet" href="/src/index.css">
        <link rel="stylesheet" href="/src/public-home.css">
        <link rel="stylesheet" href="/src/HoldRoleDemo.css">
      </head>
      <body>
        ${renderPublicHomeHtml('/', { staticOnly: false })}
        <script type="module">
          import { installPublicHoldDemo } from '/src/public-demo.ts';
          installPublicHoldDemo();
        </script>
      </body>
    </html>`;
  await page.route('**/__fixtures/legacy-static-public-demo', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: fixtureHtml }),
  );
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/__fixtures/legacy-static-public-demo');
    const sealBounds = await page
      .locator('[data-public-role-demo]')
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          borderRadius: getComputedStyle(element).borderRadius,
        };
      });
    expect(
      sealBounds.width,
      `legacy fixture seal width at ${width}px`,
    ).toBeGreaterThanOrEqual(168);
    expect(
      sealBounds.height,
      `legacy fixture seal height at ${width}px`,
    ).toBeGreaterThanOrEqual(168);
    expect(sealBounds.borderRadius).toBe('50%');
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/__fixtures/legacy-static-public-demo');
  const demo = page.getByRole('button', { name: 'Hold to see your role' });
  await demo.scrollIntoViewIfNeeded();
  await expect(demo).toBeVisible();
  await expect(page.getByText(/^(Traitor|Faithful)$/)).toHaveCount(0);
  const seal = await demo.boundingBox();
  if (!seal) throw new Error('Public role demo has no visible bounds');
  await page.mouse.move(seal.x + seal.width / 2, seal.y + seal.height / 2);
  await page.mouse.down();
  await expect(page.getByText(/^(Traitor|Faithful)$/)).toBeVisible();
  await page.mouse.up();
  await expect(demo).toContainText('Hold to reveal');
});

test('practice selection and named action stay clear in the narrow dock', async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.toLowerCase().includes('desktop'),
    'Entry dock geometry runs once in Chromium',
  );

  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/?entry=rehearsal');

  const fastChoice = page.getByTestId('button-speed-fast');
  const rehearseButton = page.getByTestId('button-start-rehearsal');
  const nameField = page.getByTestId('input-rehearsal-name');
  await expect(fastChoice).toBeVisible();
  await expect(fastChoice).toHaveAttribute('aria-pressed', 'true');
  await expect(fastChoice).toContainText('Selected');
  await expect(
    page.getByLabel('Your first name', { exact: true }),
  ).toBeVisible();
  await expect(rehearseButton).toBeDisabled();

  const tileHeight = await fastChoice.evaluate((element) =>
    Math.round(element.getBoundingClientRect().height),
  );
  expect(tileHeight).toBeGreaterThanOrEqual(56);

  await nameField.fill('Ava');
  await expect(rehearseButton).toBeEnabled();
  const dockGeometry = await page.evaluate(() => {
    const dock = document.querySelector('[data-testid="entry-action-dock"]');
    const button = document.querySelector(
      '[data-testid="button-start-rehearsal"]',
    );
    if (!dock || !button) throw new Error('Practice dock or action is missing');
    return {
      dockBottom: dock.getBoundingClientRect().bottom,
      buttonHeight: button.getBoundingClientRect().height,
      buttonBottom: button.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
    };
  });
  expect(Math.round(dockGeometry.buttonHeight)).toBe(56);
  expect(dockGeometry.buttonBottom).toBeLessThanOrEqual(
    dockGeometry.viewportHeight,
  );
  expect(dockGeometry.dockBottom).toBeLessThanOrEqual(
    dockGeometry.viewportHeight,
  );
});

test('the 375×667 phone viewport keeps home copy and actions on-screen', async ({
  page,
}, testInfo) => {
  test.skip(
    !['desktop', 'pixel', 'iphone'].some((profile) =>
      testInfo.project.name.toLowerCase().includes(profile),
    ),
    'Fixed phone viewport regression runs in desktop, Pixel and iPhone profiles',
  );

  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const entryBounds = await page.locator('.entry-experience').boundingBox();
  const titleBounds = await page
    .getByRole('heading', { level: 1 })
    .boundingBox();
  if (!entryBounds || !titleBounds) {
    throw new Error('Root entry or title has no visible bounds');
  }
  const actionBounds = await page
    .getByRole('button', {
      name: /^(Create a new game|Join a game|Practise alone)$/,
    })
    .evaluateAll((elements) =>
      elements.map((element) => {
        const { left, right, bottom } = element.getBoundingClientRect();
        return { left, right, bottom };
      }),
    );

  expect(actionBounds).toHaveLength(3);
  expect(titleBounds.x).toBeGreaterThanOrEqual(entryBounds.x);
  expect(titleBounds.x + titleBounds.width).toBeLessThanOrEqual(
    entryBounds.x + entryBounds.width,
  );
  for (const [index, bounds] of actionBounds.entries()) {
    expect(
      bounds.left,
      `entry action ${index + 1} clips past the left edge`,
    ).toBeGreaterThanOrEqual(entryBounds.x);
    expect(
      bounds.right,
      `entry action ${index + 1} clips past the right edge`,
    ).toBeLessThanOrEqual(entryBounds.x + entryBounds.width);
    expect(
      bounds.bottom,
      `entry action ${index + 1} is below the first screen`,
    ).toBeLessThanOrEqual(667);
  }
});

test('Amendment A entry screenshot capture', async ({ page }, testInfo) => {
  test.skip(
    process.env.R7_AMENDMENT_A_CAPTURE !== '1' ||
      testInfo.project.name !== 'desktop',
    'Set R7_AMENDMENT_A_CAPTURE=1 to capture the reviewed desktop entry screens.',
  );

  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const preference of ['light', 'dark'] as const) {
      await page.goto('/');
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, value),
        { key: displayPreferenceKey, value: preference },
      );
      const storedPreference = await page.evaluate((key) => {
        return window.localStorage.getItem(key);
      }, displayPreferenceKey);
      expect(readDisplayPreference({ getItem: () => storedPreference })).toBe(
        preference,
      );

      await page.goto('/');
      const entry = page.locator('.entry-experience');
      await expect(entry).toBeVisible();
      await expect(entry).toHaveAttribute(
        'data-game-theme',
        preference === 'light' ? 'day' : 'night',
      );
      await expect(entry).toHaveCSS(
        'background-color',
        preference === 'light' ? 'rgb(250, 248, 241)' : 'rgb(27, 24, 21)',
      );
      await expect(
        page.getByRole('button', { name: 'Create a new game', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Join a game', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Practise alone', exact: true }),
      ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const themeName = preference === 'light' ? 'day' : 'night';
      await page.screenshot({
        path: `docs/screens/round-7-improvements/entry-${width}-${themeName}.jpg`,
        type: 'jpeg',
        quality: 85,
        fullPage: false,
      });
      expect(await page.evaluate(() => window.innerWidth)).toBe(width);
    }
  }
});
