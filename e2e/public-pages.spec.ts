import { expect, test } from '@playwright/test';
import { PRE_LAUNCH_NOINDEX } from '../lib/security/src/deployment';

const requiredQuestions = [
  'Is there a free alternative to the WhatsApp traitors game?',
  'Is Turnstone the official game from the TV show?',
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
  expect(faqHtml).toContain('Turnstone is an independent game');
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
    'Turnstone',
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
    '#static-home header.public-home-brand .turnstone-wordmark',
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
    '#static-home header.public-home-brand.public-shell-header .turnstone-wordmark',
  );
  await expect(appBrand).toBeVisible();
  const appShellText = await page.locator('#static-home').innerText();
  expect(appShellText).toContain('Turnstone');
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
