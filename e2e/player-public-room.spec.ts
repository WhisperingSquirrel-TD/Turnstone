import { expect, test, type Page } from '@playwright/test';
import type { FullView } from '../lib/shared/src/contracts';

function createPublicView(gameId: string): FullView {
  return {
    id: gameId,
    gameName: 'Saturday gathering',
    version: 12,
    phase: 'DEBATE',
    paused: false,
    deadline: Date.now() + 60_000,
    coordinatorPlays: true,
    cycle: 2,
    pot: 18,
    unit: 'points',
    seats: [
      { id: 'seat-morgan', name: 'Morgan', status: 'alive' },
      { id: 'seat-alex', name: 'Alex', status: 'departed' },
      { id: 'seat-jamie', name: 'Jamie', status: 'alive' },
    ],
    commitment: null,
    progress: { done: 0, total: 2 },
    ballots: {},
    winner: null,
    publicAnnouncement: null,
    private: null,
    publicLog: [
      {
        seq: 11,
        at: Date.now() - 120_000,
        action: 'device_recovered',
        seatId: 'seat-alex',
        name: 'Alex',
      },
      {
        seq: 12,
        at: Date.now() - 60_000,
        action: 'seat_pin_reset',
        seatId: 'seat-morgan',
        name: 'Morgan',
      },
    ],
    coordinatorAlerts: [],
    fairness: null,
  } as FullView;
}

async function revealNotes(
  page: Page,
  gameId: string,
  role: 'traitor' | 'faithful',
): Promise<unknown[]> {
  let privateRequests = 0;
  const publicView = createPublicView(gameId);
  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'Set-Cookie': 'turnstone-csrf=test-csrf; Path=/; SameSite=Strict',
      },
      json: { csrfToken: 'test-csrf' },
    }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({ status: 200, json: { version: 12, view: publicView } }),
  );
  await page.route(`**/api/games/${gameId}/private-view`, async (route) => {
    privateRequests += 1;
    expect(route.request().postDataJSON()).toEqual({ purpose: 'notes' });
    await route.fulfill({
      status: 200,
      json: {
        version: 12,
        view: {
          ...publicView,
          private: {
            role,
            team: [],
            options: [],
            choices: {},
            chat:
              role === 'traitor'
                ? [{ seatId: 'seat-morgan', text: 'Stay together', seq: 1 }]
                : [],
            task: null,
            minimumDurationMs: 0,
          },
        },
      },
    });
  });
  await page.goto(`/game/${gameId}`);
  const notesButton = page.getByRole('button', { name: 'Notes' });
  await expect(notesButton).toBeVisible();
  await notesButton.click();
  const shieldDialog = page.getByRole('dialog', { name: 'Shield your screen' });
  const shieldConfirmation = shieldDialog.getByRole('button', {
    name: /i’m shielded/i,
  });
  await expect(shieldConfirmation).toHaveAttribute('aria-disabled', 'false', {
    timeout: 6500,
  });
  await shieldConfirmation.click();
  const holdPad = page.getByTestId('button-hold-reveal');
  const bounds = await holdPad.boundingBox();
  if (!bounds) throw new Error('Hold pad has no visible bounds');
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await expect.poll(() => privateRequests).toBe(1);
  const notes = page.getByTestId('private-notes-content');
  await expect(notes).toBeVisible({ timeout: 1500 });
  const snapshot = await notes.evaluate((element) =>
    [element, ...Array.from(element.querySelectorAll('*'))].map((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        tag: node.tagName,
        width: rect.width,
        height: rect.height,
        color: style.color,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
      };
    }),
  );
  await page.mouse.up();
  await expect(notes).toHaveCount(0);
  return snapshot;
}

test('phone room shows public game state without a presenter', async ({
  page,
}) => {
  const gameId = 'phone-room';
  const publicView = createPublicView(gameId);
  let privateRequests = 0;

  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'Set-Cookie': 'turnstone-csrf=test-csrf; Path=/; SameSite=Strict',
      },
      json: { csrfToken: 'test-csrf' },
    }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({ status: 200, json: { version: 12, view: publicView } }),
  );
  await page.route(`**/api/games/${gameId}/private-view`, async (route) => {
    privateRequests += 1;
    expect(route.request().postDataJSON()).toEqual({ purpose: 'notes' });
    await route.fulfill({
      status: 200,
      json: {
        version: 12,
        view: {
          ...publicView,
          private: {
            role: 'faithful',
            team: [],
            options: [],
            choices: {},
            chat: [],
            task: null,
            minimumDurationMs: 0,
          },
        },
      },
    });
  });

  await page.goto(`/game/${gameId}`);

  await expect(page.getByTestId('player-seat-seat-morgan')).toBeVisible();
  await expect(page.getByTestId('player-seat-seat-alex')).toContainText('Out');
  await expect(page.getByTestId('status-prize-pot')).toContainText('18 points');
  await expect(page.getByTestId('list-public-log')).toContainText(
    'Alex moved to a new device',
  );
  const notesButton = page.getByRole('button', { name: 'Notes' });
  await expect(notesButton).toBeVisible();
  await notesButton.click();

  const shieldDialog = page.getByRole('dialog', { name: 'Shield your screen' });
  const shieldConfirmation = shieldDialog.getByRole('button', {
    name: /i’m shielded/i,
  });
  await expect(shieldDialog).toBeVisible();
  await expect(page.getByTestId('private-notes-content')).toHaveCount(0);
  await expect(shieldConfirmation).toHaveAttribute('aria-disabled', 'false', {
    timeout: 6500,
  });
  await shieldConfirmation.click();

  const holdPad = page.getByTestId('button-hold-reveal');
  const bounds = await holdPad.boundingBox();
  if (!bounds) throw new Error('Hold pad has no visible bounds');
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await expect.poll(() => privateRequests).toBe(1);
  await expect(page.getByTestId('private-notes-content')).toBeVisible({
    timeout: 1500,
  });
  await page.mouse.up();
  await expect(page.getByTestId('private-notes-content')).toHaveCount(0);
});

test('Notes have the same geometry and colours for Traitor and Faithful', async ({
  page,
  browser,
}) => {
  const otherPage = await browser.newPage({
    viewport: page.viewportSize() ?? { width: 402, height: 874 },
  });
  try {
    const [faithfulSnapshot, traitorSnapshot] = await Promise.all([
      revealNotes(page, 'notes-faithful', 'faithful'),
      revealNotes(otherPage, 'notes-traitor', 'traitor'),
    ]);
    expect(traitorSnapshot).toEqual(faithfulSnapshot);
  } finally {
    await otherPage.close();
  }
});

test('Dawn, verdict, vote reveal and results appear on the phone without a presenter', async ({
  page,
}) => {
  const gameId = 'phone-announcement';
  let currentView = createPublicView(gameId);
  const presenterRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/presenter')) {
      presenterRequests.push(request.url());
    }
  });
  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'Set-Cookie': 'turnstone-csrf=test-csrf; Path=/; SameSite=Strict',
      },
      json: { csrfToken: 'test-csrf' },
    }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({ status: 200, json: { version: 12, view: currentView } }),
  );
  await page.goto(`/game/${gameId}`);

  currentView = {
    ...currentView,
    phase: 'DAWN',
    publicAnnouncement: { kind: 'dawn', cycle: 1, victims: [] },
  };
  await page.reload();
  await expect(page.getByTestId('shared-announcement')).toContainText(
    'No one was taken',
  );

  currentView = {
    ...currentView,
    phase: 'VERDICT',
    publicAnnouncement: {
      kind: 'verdict',
      cycle: 1,
      seat: { id: 'seat-alex', name: 'Alex' },
    },
    ballots: { 'seat-morgan': 'seat-alex' },
  };
  await page.reload();
  await expect(page.getByTestId('shared-announcement')).toContainText('Alex');
  await expect(page.getByTestId('list-vote-reveal')).toContainText(
    'Morgan',
  );

  currentView = {
    ...currentView,
    phase: 'FINISHED',
    winner: 'faithful',
    publicAnnouncement: { kind: 'finished', winner: 'faithful' },
  };
  await page.reload();
  await expect(page.getByTestId('shared-announcement')).toContainText(
    'Faithful',
  );
  expect(presenterRequests).toEqual([]);
});

test('the lobby code and join QR are shared on each seated player phone', async ({
  page,
}) => {
  const gameId = 'phone-lobby';
  const lobbyView = {
    ...createPublicView(gameId),
    phase: 'LOBBY',
    lobbyCode: 'ABC234',
  };
  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'Set-Cookie': 'turnstone-csrf=test-csrf; Path=/; SameSite=Strict',
      },
      json: { csrfToken: 'test-csrf' },
    }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({ status: 200, json: { version: 12, view: lobbyView } }),
  );
  await page.goto(`/game/${gameId}`);

  await expect(page.getByTestId('shared-lobby-code')).toHaveText('ABC234');
  await expect(page.getByTestId('shared-lobby-qr')).toBeVisible();
});
