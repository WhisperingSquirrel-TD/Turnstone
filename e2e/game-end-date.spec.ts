import { expect, test, type Page } from '@playwright/test';
import type { FullView } from '../lib/shared/src/contracts';
import {
  addDays,
  formatUkDate,
  gameDeletionDate,
  latestGameEndDate,
  ukCalendarDate,
} from '../lib/shared/src/game-end-date';
import { createPublicView } from './support/public-view';
import { installLiveSocketViewFixture } from './support/live-socket-view';

// Owner rule (28 October 2026, D117): every real game has a last day; it is
// deleted the day after, and everyone is told. Practice games show no date.
const notice = (endDate: string) =>
  `This game and everything in it will be deleted on ${formatUkDate(gameDeletionDate(endDate))}.`;

async function csrf(page: Page) {
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'c'.repeat(64) } }),
  );
}

test('setup asks for the last day, defaulting to today, and states the deletion day', async ({
  page,
}) => {
  await csrf(page);
  await page.goto('/?entry=create');
  const today = ukCalendarDate(Date.now());
  const field = page.getByLabel('Last day of your game', { exact: true });
  await expect(field).toHaveValue(today);
  await expect(field).toHaveAttribute('min', today);
  await expect(field).toHaveAttribute('max', latestGameEndDate(Date.now()));
  await expect(page.getByTestId('end-date-notice')).toHaveText(notice(today));
  const later = addDays(today, 14);
  await field.fill(later);
  await expect(page.getByTestId('end-date-notice')).toHaveText(notice(later));
  const box = await field.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test('setup refuses a date in the past and sends the chosen day with the game', async ({
  page,
}) => {
  await csrf(page);
  let created: Record<string, unknown> | null = null;
  await page.route('**/api/games', (route) => {
    created = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({ status: 409, json: { error: 'Command rejected' } });
  });
  await page.goto('/?entry=create');
  const today = ukCalendarDate(Date.now());
  const field = page.getByLabel('Last day of your game', { exact: true });
  await field.fill(addDays(today, -1));
  await page.getByTestId('button-continue-create-name').click();
  await expect(page.getByTestId('status-entry-error')).toHaveText(
    'The last day of your game cannot be in the past.',
  );
  await expect(page.getByTestId('input-game-name')).toBeVisible();
  const chosen = addDays(today, 7);
  await field.fill(chosen);
  await page.getByTestId('button-continue-create-name').click();
  await page.getByTestId('button-continue-player-count').click();
  await page.getByTestId('input-organiser-name').fill('Morgan');
  await page.getByTestId('input-organiser-pin').fill('1234');
  await page.getByTestId('button-create-submit').click();
  await expect.poll(() => created?.endDate).toBe(chosen);
});

async function organiserLobby(page: Page, endDate: string) {
  const gameId = 'end-date-lobby';
  let view: FullView = {
    ...createPublicView(gameId),
    phase: 'LOBBY',
    gameEndDate: endDate,
    lobbyCode: 'ABC234',
  };
  const updates: unknown[] = [];
  await csrf(page);
  await page.route(`**/api/games/${gameId}/invites`, (route) =>
    route.fulfill({
      status: 201,
      json: {
        gameId,
        shortCode: 'ABC234',
        joinUrl: `https://oathstone.test/join/${gameId}#${'i'.repeat(43)}`,
      },
    }),
  );
  await page.route(`**/api/games/${gameId}/coordinator/view`, (route) =>
    route.fulfill({
      json: { view, version: view.version, serverNow: Date.now() },
    }),
  );
  await page.route(`**/api/games/${gameId}/join-requests`, (route) =>
    route.fulfill({ json: { requests: [] } }),
  );
  await page.route(`**/api/games/${gameId}/coordinator/delegates`, (route) =>
    route.fulfill({ json: { limit: 1, seatIds: [] } }),
  );
  await page.route(`**/api/games/${gameId}/coordinator/presence`, (route) =>
    route.fulfill({ json: { status: 'online' } }),
  );
  await page.route(`**/api/games/${gameId}/end-date`, (route) => {
    const body = route.request().postDataJSON() as { endDate: string };
    updates.push({ method: route.request().method(), body });
    view = { ...view, gameEndDate: body.endDate, version: view.version + 1 };
    return route.fulfill({ json: { gameEndDate: body.endDate } });
  });
  await page.goto(`/coordinate/${gameId}`);
  await expect(page.getByTestId('text-lobby-code')).toHaveText('ABC234');
  return updates;
}

test('the organiser Lobby states the deletion day and can change the date', async ({
  page,
}) => {
  const today = ukCalendarDate(Date.now());
  const endDate = addDays(today, 3);
  const updates = await organiserLobby(page, endDate);
  await expect(page.getByTestId('end-date-notice')).toHaveText(notice(endDate));
  const change = page.getByTestId('button-change-end-date');
  await expect(change).toHaveText('Change date');
  expect((await change.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await change.click();
  const later = addDays(today, 30);
  await page.getByLabel('Last day of your game', { exact: true }).fill(later);
  await page.getByTestId('button-save-end-date').click();
  await expect(page.getByTestId('end-date-notice')).toHaveText(notice(later));
  expect(updates).toEqual([{ method: 'PUT', body: { endDate: later } }]);
});

test('the join screen tells a player when the game will be deleted', async ({
  page,
}) => {
  const endDate = addDays(ukCalendarDate(Date.now()), 5);
  await csrf(page);
  await page.route('**/api/join/name-check', (route) =>
    route.fulfill({ json: { status: 'available', gameEndDate: endDate } }),
  );
  await page.goto('/');
  await page.getByTestId('button-join-game').click();
  for (let index = 0; index < 6; index += 1)
    await page
      .getByTestId(`input-join-code-${index + 1}`)
      .fill('ABC234'[index]!);
  await page.getByTestId('input-join-name').fill('Alex');
  await page.getByTestId('entry-primary-dock-button').click();
  await expect(page.getByTestId('input-join-pin')).toBeVisible();
  await expect(page.getByTestId('end-date-notice')).toHaveText(notice(endDate));
});

async function finishedGame(page: Page, extra: Partial<FullView>) {
  const gameId = `end-date-finished-${extra.rehearsal ? 'practice' : 'real'}`;
  const view: FullView = {
    ...createPublicView(gameId),
    phase: 'FINISHED',
    winner: 'faithful',
    deadline: null,
    ...extra,
  };
  const envelope = () => ({
    serverNow: Date.now(),
    version: view.version,
    view,
  });
  await installLiveSocketViewFixture(page, envelope);
  await csrf(page);
  await page.route(`**/api/games/${gameId}/**`, (route) =>
    route.fulfill({ json: envelope() }),
  );
  await page.goto(`/game/${gameId}?clips=off`);
  await expect(page.locator('[data-phase="FINISHED"]')).toBeAttached();
  const gotIt = page.getByRole('button', { name: 'Got it', exact: true });
  if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
}

test('the finished screen states the deletion day for a real game', async ({
  page,
}) => {
  const endDate = ukCalendarDate(Date.now());
  await finishedGame(page, { gameEndDate: endDate });
  await expect(page.getByTestId('end-date-notice')).toHaveText(notice(endDate));
});

test('a practice game shows no end date', async ({ page }) => {
  await finishedGame(page, { rehearsal: true, gameEndDate: null });
  await expect(page.getByTestId('end-date-notice')).toHaveCount(0);
});

test('an old link to a cleared game says it has ended and been cleared', async ({
  page,
}) => {
  await csrf(page);
  await page.route('**/api/games/cleared-game/**', (route) =>
    route.fulfill({
      status: 410,
      json: { error: 'This game has ended and been cleared.' },
    }),
  );
  await page.goto('/game/cleared-game?clips=off');
  await expect(page.getByTestId('game-cleared')).toHaveText(
    'This game has ended and been cleared.',
  );
  await page.goto('/coordinate/cleared-game');
  await expect(page.getByTestId('game-cleared')).toHaveText(
    'This game has ended and been cleared.',
  );
});
