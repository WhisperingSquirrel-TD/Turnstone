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
  missionsEnabled: false,
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
  ballots: {},
  voteCandidates: [],
  winner: null,
  publicAnnouncement: null,
  private: null,
  publicLog: [],
  coordinatorAlerts: [],
  fairness: null,
};

async function enterJoinName(page: import('@playwright/test').Page) {
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'c'.repeat(43) } }),
  );
  await page.goto('/play');
  await page.getByRole('button', { name: 'Join a game', exact: true }).click();
  const codeBoxes = page.getByRole('textbox', {
    name: /Game code character/,
  });
  for (let index = 0; index < 6; index += 1) {
    await codeBoxes.nth(index).fill('ABC234'[index]!);
  }
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
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
  await page.getByLabel('4-digit PIN', { exact: true }).fill('1234');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page).toHaveURL(/\/game\/recovered-game$/);
});
