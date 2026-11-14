import { expect, test } from '@playwright/test';
import type { FullView } from '../lib/shared/src/contracts';

const recoveredView: FullView = {
  id: 'recovered-game',
  viewerSeatId: 'recovered-seat',
  canAdvancePhase: false,
  version: 3,
  phase: 'LOBBY',
  paused: false,
  deadline: null,
  coordinatorPlays: false,
  cycle: 0,
  revote: false,
  shadowRound: 0,
  shadowSlot: 0,
  murderSlots: 1,
  endRule: 'unanimous',
  missionsEnabled: false,
  shieldsPublic: false,
  shieldHolderIds: [],
  rehearsal: false,
  pot: 0,
  unit: 'points',
  seats: [
    {
      id: 'recovered-seat',
      name: 'Alex',
      status: 'alive',
    },
  ],
  commitment: null,
  progress: { done: 0, total: 1 },
  actionStatus: { waiting: 0, total: 1 },
  votedSeatIds: [],
  ballots: {},
  voteCandidates: [],
  winner: null,
  publicAnnouncement: null,
  private: null,
  publicLog: [],
  coordinatorUndo: null,
  coordinatorAlerts: [],
  fairness: null,
};

async function enterJoinName(page: import('@playwright/test').Page) {
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'c'.repeat(43) } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Join a game', exact: true }).click();
  const codeBoxes = page.getByRole('textbox', {
    name: /Game code character/,
  });
  for (let index = 0; index < 6; index += 1) {
    await codeBoxes.nth(index).fill('ABC234'[index]!);
  }
  await page.getByLabel('Your first name', { exact: true }).fill('Alex');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

test('duplicate name offers a different name and returns to the name field', async ({
  page,
}, testInfo) => {
  test.skip(
    !['Pixel', 'iPhone'].includes(testInfo.project.name),
    'Duplicate-name entry runs on phone profiles',
  );
  const checkedNames: string[] = [];
  await page.route('**/api/join/name-check', async (route) => {
    const body = route.request().postDataJSON() as { name: string };
    checkedNames.push(body.name);
    await route.fulfill({
      json: { status: body.name === 'Alex B' ? 'available' : 'duplicate' },
    });
  });

  await enterJoinName(page);
  await expect(
    page.getByText(
      'Someone called Alex is already playing. Is that you on a new phone?',
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole('button', { name: "No, I'm someone else", exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveText(
    'Please choose a different name, for example Alex B.',
  );
  await page.getByLabel('Your first name', { exact: true }).fill('Alex B');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByLabel('4-digit PIN', { exact: true })).toBeVisible();
  expect(checkedNames).toEqual(['Alex', 'Alex B']);
});

test('duplicate name can recover the existing seat with its PIN', async ({
  page,
}, testInfo) => {
  test.skip(
    !['Pixel', 'iPhone'].includes(testInfo.project.name),
    'PIN recovery entry runs on phone profiles',
  );
  await page.route('**/api/join/name-check', (route) =>
    route.fulfill({ json: { status: 'duplicate' } }),
  );
  await page.route('**/api/recover', async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      shortCode: 'ABC234',
      name: 'Alex',
      pin: '1234',
    });
    await route.fulfill({
      json: {
        serverNow: Date.now(),
        version: 4,
        view: recoveredView,
      },
    });
  });
  await page.route('**/api/games/recovered-game/view', (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: 4, view: recoveredView },
    }),
  );

  await enterJoinName(page);
  await page
    .getByRole('button', { name: "Yes, that's me", exact: true })
    .click();
  await page
    .getByLabel('Your existing 4-digit PIN', { exact: true })
    .fill('1234');
  await page
    .getByRole('button', { name: 'Re-enter game', exact: true })
    .click();
  await expect(page).toHaveURL(/\/game\/recovered-game$/);
});

test('a returning player can recover after the normal Join path refuses the code', async ({
  page,
}, testInfo) => {
  test.skip(
    !['Pixel', 'iPhone'].includes(testInfo.project.name),
    'Returning-seat recovery runs on phone profiles',
  );
  let nameCheckCalls = 0;
  await page.route('**/api/join/name-check', async (route) => {
    nameCheckCalls += 1;
    await route.fulfill({
      status: 409,
      json: { error: 'The game is not accepting new players.' },
    });
  });
  await page.route('**/api/recover', async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      shortCode: 'ABC234',
      name: 'Alex',
      pin: '1234',
    });
    await route.fulfill({
      json: {
        serverNow: Date.now(),
        version: 4,
        view: recoveredView,
      },
    });
  });
  await page.route('**/api/games/recovered-game/view', (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: 4, view: recoveredView },
    }),
  );

  await page.setViewportSize({ width: 320, height: 640 });
  await enterJoinName(page);
  await expect(page.getByRole('alert')).toBeVisible();
  const reenter = page.getByTestId('button-reenter-seat');
  await expect(reenter).toBeVisible();
  const reenterBounds = await reenter.boundingBox();
  expect(reenterBounds?.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await reenter.click();
  await expect(page.getByTestId('input-join-pin')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Re-enter your game' }),
  ).toBeVisible();
  await page.getByLabel('Your existing 4-digit PIN').fill('1234');
  await page
    .getByRole('button', { name: 'Re-enter game', exact: true })
    .click();

  await expect(page).toHaveURL(/\/game\/recovered-game$/);
  expect(nameCheckCalls).toBe(1);
});

test('an invitation link offers code-based recovery without checking new-seat eligibility', async ({
  page,
}, testInfo) => {
  test.skip(
    !['Pixel', 'iPhone'].includes(testInfo.project.name),
    'Invitation recovery runs on phone profiles',
  );
  let nameChecks = 0;
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'c'.repeat(43) } }),
  );
  await page.route('**/api/join/name-check', (route) => {
    nameChecks += 1;
    return route.fulfill({
      status: 409,
      json: { error: 'Not accepting joins.' },
    });
  });
  await page.route('**/api/recover', async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      shortCode: 'ABC234',
      name: 'Alex',
      pin: '1234',
    });
    await route.fulfill({
      json: { serverNow: Date.now(), version: 4, view: recoveredView },
    });
  });
  await page.route('**/api/games/recovered-game/view', (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: 4, view: recoveredView },
    }),
  );

  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(`/join/recovered-game#${'t'.repeat(43)}`);
  await page.getByLabel('Your first name', { exact: true }).fill('Alex');
  await page.getByTestId('button-reenter-seat-from-invite').click();
  const codeBoxes = page.getByRole('textbox', {
    name: /Game code character/,
  });
  for (let index = 0; index < 6; index += 1) {
    await codeBoxes.nth(index).fill('ABC234'[index]!);
  }
  await expect(page.getByTestId('input-join-name')).toHaveValue('Alex');
  await page.getByRole('button', { name: 'Continue to PIN' }).click();
  await page.getByLabel('Your existing 4-digit PIN').fill('1234');
  await page
    .getByRole('button', { name: 'Re-enter game', exact: true })
    .click();

  await expect(page).toHaveURL(/\/game\/recovered-game$/);
  expect(nameChecks).toBe(0);
});
