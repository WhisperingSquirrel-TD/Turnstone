import { expect, test } from '@playwright/test';

test('loading the app route does not reload an open public page', async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.toLowerCase().includes('desktop'),
    'Vite development-server navigation regression runs once in desktop Chromium',
  );

  await page.goto('/');
  await expect(page.locator('.public-home-hero')).toBeVisible();

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
  await appPage.goto('/play?entry=create');
  await expect(appPage.locator('body')).toBeVisible();

  expect(
    await unexpectedReload,
    'loading /play must not navigate the already-open public page',
  ).toBe(false);
  expect(homeNavigations).toEqual([]);
  await appPage.close();
});

test('the public home page stays mobile-first and glow edges stay contained', async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.toLowerCase().includes('desktop'),
    'Responsive screenshot matrix runs once in desktop Chromium',
  );

  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Start a new game' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join a game' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Practise alone first' }),
  ).toBeVisible();

  for (const width of [320, 375, 390, 414, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const pageWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(pageWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(
      width,
    );

    const targets = await page
      .locator(
        '.public-home-actions a, .public-home-nav a, .public-home-menu summary, .public-home-brand a, .public-home-faq summary, .public-home-demo [data-public-role-demo]',
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
    const seal = await page
      .locator('[data-public-role-demo]')
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          borderRadius: getComputedStyle(element).borderRadius,
        };
      });
    expect(seal.width, `demo seal width at ${width}px`).toBeGreaterThanOrEqual(
      168,
    );
    expect(
      seal.height,
      `demo seal height at ${width}px`,
    ).toBeGreaterThanOrEqual(168);
    expect(seal.borderRadius).toBe('50%');
    if (width <= 760) {
      const menu = page.locator('.public-home-menu');
      const menuButton = menu.locator('summary');
      await expect(menuButton).toBeVisible();
      await menuButton.click();
      await expect(
        menu.getByRole('link', { name: 'Frequently asked questions' }),
      ).toBeVisible();
      await menuButton.click();
    }
    if (width <= 760) {
      const mobileLayout = await page.evaluate(() => {
        const copy = document.querySelector('.public-home-hero-copy');
        const actions = document.querySelector('.public-home-actions');
        const demo = document.querySelector('.public-home-demo');
        return {
          viewportHeight: window.innerHeight,
          actionsBottom: actions?.getBoundingClientRect().bottom ?? Infinity,
          copyBottom: copy?.getBoundingClientRect().bottom ?? 0,
          demoTop: demo?.getBoundingClientRect().top ?? 0,
        };
      });
      expect(mobileLayout.actionsBottom).toBeLessThanOrEqual(
        mobileLayout.viewportHeight,
      );
      expect(mobileLayout.demoTop).toBeGreaterThan(mobileLayout.copyBottom);
    }

    if ([320, 390, 768, 1280].includes(width)) {
      const image = await page.screenshot({
        path: testInfo.outputPath(`public-home-${width}.png`),
        fullPage: false,
      });
      expect(image.readUInt32BE(16)).toBe(width);
      const visualStyles = await page.evaluate(() => {
        const hero = document.querySelector('.public-home-hero');
        const demo = document.querySelector('.public-home-demo');
        return {
          glow: hero ? getComputedStyle(hero, '::before').backgroundImage : '',
          demoShadow: demo ? getComputedStyle(demo).boxShadow : '',
        };
      });
      expect(visualStyles.glow).toContain('radial-gradient');
      expect(visualStyles.demoShadow).toBe('none');
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
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

  const geometry = await page.evaluate(() => {
    const hero = document.querySelector('.public-home-hero');
    const actions = document.querySelector('.public-home-actions');
    if (!hero || !actions) throw new Error('Home hero or actions are missing');

    const textBounds = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing home text: ${selector}`);
      const range = document.createRange();
      range.selectNodeContents(element);
      const { left, right } = range.getBoundingClientRect();
      return { left, right };
    };
    const heroBounds = hero.getBoundingClientRect();
    const actionBounds = Array.from(
      actions.querySelectorAll('a'),
      (element) => {
        const { left, right, bottom } = element.getBoundingClientRect();
        return { left, right, bottom };
      },
    );

    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      hero: { left: heroBounds.left, right: heroBounds.right },
      text: [
        textBounds('.public-home-wordmark'),
        textBounds('.public-home-subtitle'),
        textBounds('.public-home-byline'),
      ],
      actionBounds,
    };
  });

  expect(geometry.viewportWidth).toBe(375);
  expect(geometry.actionBounds).toHaveLength(3);
  for (const [index, bounds] of geometry.text.entries()) {
    expect(
      bounds.left,
      `home text ${index + 1} clips past the left edge`,
    ).toBeGreaterThanOrEqual(geometry.hero.left);
    expect(
      bounds.right,
      `home text ${index + 1} clips past the right edge`,
    ).toBeLessThanOrEqual(geometry.hero.right);
  }
  for (const [index, bounds] of geometry.actionBounds.entries()) {
    expect(
      bounds.left,
      `entry action ${index + 1} clips past the left edge`,
    ).toBeGreaterThanOrEqual(geometry.hero.left);
    expect(
      bounds.right,
      `entry action ${index + 1} clips past the right edge`,
    ).toBeLessThanOrEqual(geometry.hero.right);
    expect(
      bounds.bottom,
      `entry action ${index + 1} is below the first screen`,
    ).toBeLessThanOrEqual(geometry.viewportHeight);
  }
});
