import { expect, test, type Page } from '@playwright/test';
import type { FullView } from '../lib/shared/src/contracts';

function createPublicView(gameId: string): FullView {
  return {
    id: gameId,
    viewerSeatId: 'seat-morgan',
    canAdvancePhase: false,
    gameName: 'Saturday gathering',
    version: 12,
    phase: 'DEBATE',
    paused: false,
    deadline: Date.now() + 60_000,
    coordinatorPlays: true,
    cycle: 2,
    shadowRound: 0,
    missionsEnabled: true,
    rehearsal: false,
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
  await page.route(`**/api/games/${gameId}/commands`, (route) =>
    route.fulfill({
      status: 200,
      json: { version: 13, view: publicView },
    }),
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
  await expect.poll(() => privateRequests).toBe(1);
  const notes = page.getByTestId('private-notes-content');
  await expect(notes).toBeVisible({ timeout: 1500 });
  await expect(page.getByTestId('button-hold-reveal')).toHaveCount(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const snapshot = await notes.evaluate((element) =>
    [element, ...Array.from(element.querySelectorAll('*'))].map((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        tag: node.tagName,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        color: style.color,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
      };
    }),
  );
  await page.getByRole('button', { name: 'Done' }).click();
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
  await page.route(`**/api/games/${gameId}/commands`, (route) =>
    route.fulfill({
      status: 200,
      json: { version: 13, view: publicView },
    }),
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
  await expect(page.getByRole('button', { name: 'Full screen' })).toHaveCount(
    0,
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

  await expect.poll(() => privateRequests).toBe(1);
  await expect(page.getByTestId('private-notes-content')).toBeVisible({
    timeout: 1500,
  });
  await expect(page.getByTestId('button-hold-reveal')).toHaveCount(0);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('private-notes-content')).toHaveCount(0);
});

test('shows Moving on instead of a frozen zero when a deadline passes', async ({
  page,
}) => {
  await page.clock.install();
  const gameId = 'deadline-transition-pending';
  const view = {
    ...createPublicView(gameId),
    phase: 'DEBATE' as const,
    deadline: Date.now() + 1000,
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
    route.fulfill({ status: 200, json: { version: 12, view } }),
  );
  await page.goto(`/game/${gameId}`);
  await expect(page.getByText('Time left')).toBeVisible();
  await page.clock.fastForward(1100);
  await expect(page.getByText('Moving on...')).toBeVisible();
  await expect(page.getByText('0:00')).toHaveCount(0);
});

test('rehearsal player can move on from public and voting screens', async ({
  page,
}) => {
  const gameId = 'rehearsal-move-on';
  let publicView: FullView = {
    ...createPublicView(gameId),
    canAdvancePhase: true,
  };
  const submitted: Record<string, unknown>[] = [];

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
    route.fulfill({
      status: 200,
      json: { version: publicView.version, view: publicView },
    }),
  );
  await page.route(`**/api/games/${gameId}/commands`, async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    submitted.push(body);
    publicView = {
      ...publicView,
      phase: 'VOTE',
      version: publicView.version + 1,
      deadline: Date.now() + 60_000,
    };
    await route.fulfill({
      status: 200,
      json: { version: publicView.version, view: publicView },
    });
  });

  await page.goto(`/game/${gameId}`);
  await expect(page.getByRole('button', { name: 'Move on' })).toBeVisible();
  await expect(
    page.getByText(
      'The organiser will move the game forward. Keep your phone close and your screen private.',
    ),
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Move on' }).click();
  await expect(page.getByText('Who do you vote to banish?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move on' })).toBeVisible();
  expect(submitted[0]).toMatchObject({
    type: 'AdvancePhase',
    expectedVersion: 12,
  });
});

test('banishment voting is a shield-free tap flow and excludes self and out seats', async ({
  page,
}) => {
  const gameId = 'vote-screen';
  const publicView = {
    ...createPublicView(gameId),
    phase: 'VOTE',
    viewerSeatId: 'seat-morgan',
  } as FullView;
  const submittedCommands: unknown[] = [];
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
  await page.route(`**/api/games/${gameId}/commands`, async (route) => {
    submittedCommands.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      json: { version: 13, view: publicView },
    });
  });
  await page.route(`**/api/games/${gameId}/private-view`, (route) =>
    route.fulfill({
      status: 500,
      json: { error: 'A banishment vote must not request a private view.' },
    }),
  );

  const viewResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/games/${gameId}/view`) &&
      response.status() === 200,
  );
  await page.goto(`/game/${gameId}`);
  await viewResponse;

  await expect(page.locator('dialog.privacy-shield')).not.toBeVisible();
  await expect(page.getByTestId('button-hold-reveal')).toHaveCount(0);
  await expect(page.getByText('Your private role')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Morgan', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Alex', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Jamie', exact: true }).click();
  await page.getByRole('button', { name: 'Review this choice' }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();

  await expect
    .poll(() => submittedCommands)
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'SubmitVote', target: 'seat-jamie' }),
        expect.objectContaining({ type: 'AcknowledgePrivate' }),
      ]),
    );
  await expect(
    page.getByText('Thanks. Waiting for everyone.', { exact: true }),
  ).toBeVisible();
});

test('shadow choices appear after shielding without a hold and complete privately', async ({
  page,
}) => {
  const gameId = 'shadow-choice';
  const publicView = {
    ...createPublicView(gameId),
    phase: 'SHADOW',
  } as FullView;
  let privateRequests = 0;
  const submittedCommands: unknown[] = [];
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
  await page.route(`**/api/games/${gameId}/commands`, async (route) => {
    submittedCommands.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      json: { version: 13, view: publicView },
    });
  });
  await page.route(`**/api/games/${gameId}/private-view`, async (route) => {
    privateRequests += 1;
    await route.fulfill({
      status: 200,
      json: {
        version: 12,
        view: {
          ...publicView,
          private: {
            role: 'faithful',
            team: [],
            options: [{ id: 'seat-jamie', name: 'Jamie' }],
            choices: {},
            chat: [],
            task: null,
            minimumDurationMs: 5000,
          },
        },
      },
    });
  });

  const viewResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/games/${gameId}/view`) &&
      response.status() === 200,
  );
  await page.goto(`/game/${gameId}`);
  await viewResponse;
  const shieldConfirmation = page
    .locator('dialog.privacy-shield')
    .getByRole('button', { name: /i’m shielded/i });
  await expect(shieldConfirmation).toHaveAttribute('aria-disabled', 'false', {
    timeout: 6500,
  });
  await shieldConfirmation.click();
  await expect.poll(() => privateRequests).toBe(1);
  await expect(page.getByTestId('private-choice-content')).toBeVisible();
  await expect(page.getByTestId('button-hold-reveal')).toHaveCount(0);
  await expect(
    page.getByText('Who do you suspect most right now?', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Morgan', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Jamie', exact: true }).click();
  await page.getByRole('button', { name: 'Review this choice' }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect
    .poll(() => submittedCommands)
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'SubmitShadowChoice',
          choice: 'seat-jamie',
        }),
        expect.objectContaining({ type: 'AcknowledgePrivate' }),
      ]),
    );
  await expect(
    page.getByText('Thanks. Waiting for everyone.', { exact: true }),
  ).toBeVisible();
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

test('private Notes hide after background and idle, then return with one tap', async ({
  page,
}) => {
  await page.clock.install();
  const gameId = 'notes-cover-restore';
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
  await page.getByRole('button', { name: 'Notes' }).click();
  await page.clock.fastForward(5000);
  await page
    .locator('dialog.privacy-shield')
    .getByRole('button', { name: /i’m shielded/i })
    .click();
  const notes = page.getByTestId('private-notes-content');
  await expect.poll(() => privateRequests).toBe(1);
  await expect(notes).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(notes).toHaveCount(0);
  const restore = page.getByRole('button', {
    name: 'Tap to see your private screen again',
  });
  await expect(restore).toBeVisible();
  await restore.click();
  await expect.poll(() => privateRequests).toBe(2);
  await expect(notes).toBeVisible();

  await page.clock.fastForward(30_001);
  await expect(notes).toHaveCount(0);
  await expect(restore).toBeVisible();
  await restore.click();
  await expect.poll(() => privateRequests).toBe(3);
  await expect(notes).toBeVisible();
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
  await expect(page.getByTestId('list-vote-reveal')).toContainText('Morgan');

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

  await expect(page.getByTestId('lobby-room-code')).toHaveText('ABC234');
  await expect(page.getByTestId('lobby-join-qr')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Full screen' })).toBeVisible();
});
