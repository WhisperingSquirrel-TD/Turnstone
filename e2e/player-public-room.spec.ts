import { expect, test, type Page } from '@playwright/test';
import type { FullView } from '../lib/shared/src/contracts';
import { pendingJoinRequestsResponseSchema } from '../lib/shared/src/contracts';

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
    revote: false,
    shadowRound: 0,
    shadowSlot: 0,
    murderSlots: 1,
    endRule: 'unanimous',
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
    votedSeatIds: [],
    voteCandidates: [],
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

test('coordinator creates a fresh late invitation without reopening the room code', async ({
  page,
}) => {
  const gameId = 'late-join-ui';
  const view = createPublicView(gameId);
  let pending = [
    {
      id: 'late-request',
      seatId: 'late-seat',
      name: 'Sam',
      createdAt: Date.now(),
    },
  ];
  let lobbyInviteRequests = 0;
  const decisions: unknown[] = [];
  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      json: { csrfToken: 'c'.repeat(64) },
    }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );
  await page.route(`**/api/games/${gameId}/join-requests`, (route) =>
    route.fulfill({
      json: pendingJoinRequestsResponseSchema.parse({ requests: pending }),
    }),
  );
  await page.route(`**/api/games/${gameId}/invites`, (route) => {
    lobbyInviteRequests += 1;
    return route.fulfill({ status: 409, json: { error: 'Command rejected' } });
  });
  await page.route(`**/api/games/${gameId}/late-invites`, (route) =>
    route.fulfill({
      status: 201,
      json: {
        gameId,
        joinUrl: `https://turnstone.test/join/${gameId}#${'i'.repeat(43)}`,
      },
    }),
  );
  await page.route(
    `**/api/games/${gameId}/join-requests/late-request/decision`,
    (route) => {
      decisions.push(route.request().postDataJSON());
      pending = [];
      return route.fulfill({
        json: { status: 'approved', seatId: 'late-seat' },
      });
    },
  );
  await page.goto(`/coordinate/${gameId}`);
  await expect(
    page.getByRole('heading', { name: 'Invite a late player' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create a fresh invitation' }).click();
  await expect(page.getByTestId('lobby-join-qr')).toHaveAttribute(
    'data-join-url',
    new RegExp(`/join/${gameId}#i{43}$`),
  );
  await expect(page.getByTestId('text-lobby-code')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Share invitation' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByTestId('text-no-pending-joiners')).toBeVisible();
  expect(decisions).toEqual([
    { decision: 'approve', expectedVersion: view.version },
  ]);
  expect(lobbyInviteRequests).toBe(0);
  await page.route(`**/api/games/${gameId}/late-invites`, (route) =>
    route.fulfill({
      status: 409,
      json: { error: 'Command rejected' },
    }),
  );
  await page.getByRole('button', { name: 'Create a fresh invitation' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Late joining is closed or all seats are taken. You can return to the game.',
  );
  await expect(page.getByTestId('lobby-join-qr')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to game' }).click();
  await expect(page).toHaveURL(new RegExp(`/game/${gameId}$`));
});

test('organiser can start with five players while one planned seat has not joined', async ({
  page,
}) => {
  const gameId = 'early-start-ui';
  const view = {
    ...createPublicView(gameId),
    phase: 'LOBBY',
    cycle: 0,
    seats: Array.from({ length: 5 }, (_, index) => ({
      id: `seat-${index}`,
      name: `Player ${index + 1}`,
      status: 'alive',
    })),
  };
  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      json: { csrfToken: 'c'.repeat(64) },
    }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );
  await page.route(`**/api/games/${gameId}/join-requests`, (route) =>
    route.fulfill({
      json: { requests: [] },
    }),
  );
  await page.route(`**/api/games/${gameId}/invites`, (route) =>
    route.fulfill({
      status: 201,
      json: {
        gameId,
        shortCode: 'ABC234',
        joinUrl: `https://turnstone.test/join/${gameId}#${'i'.repeat(43)}`,
      },
    }),
  );
  await page.goto(`/coordinate/${gameId}?players=6`);
  await expect(page.getByTestId('text-lobby-player-count')).toHaveText(
    '5 of 6 player seats are ready.',
  );
  await expect(page.getByTestId('button-start-game')).toBeEnabled();
});

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
    route.fulfill({
      status: 200,
      json: { serverNow: Date.now(), version: 12, view: publicView },
    }),
  );
  await page.route(`**/api/games/${gameId}/commands`, (route) =>
    route.fulfill({
      status: 200,
      json: { serverNow: Date.now(), version: 13, view: publicView },
    }),
  );
  await page.route(`**/api/games/${gameId}/private-view`, async (route) => {
    privateRequests += 1;
    expect(route.request().postDataJSON()).toEqual({ purpose: 'notes' });
    await route.fulfill({
      status: 200,
      json: {
        serverNow: Date.now(),
        version: 12,
        view: {
          ...publicView,
          private: {
            role,
            team: [],
            options: [],
            choices: {},
            choiceSlots: [],
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
  await expect(
    page.getByRole('dialog', { name: 'Shield your screen' }),
  ).toHaveCount(0);
  await expect(page.getByTestId('button-hold-reveal')).toHaveCount(0);
  await expect.poll(() => privateRequests).toBe(1);
  const notes = page.getByTestId('private-notes-content');
  await expect(notes).toBeVisible({ timeout: 1500 });
  await expect(page.getByTestId('button-hold-reveal')).toHaveCount(0);
  await expect(
    notes.getByText('Only you can see your notes.', { exact: true }),
  ).toHaveCount(1);
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
  const nextPublicLogSeq =
    Math.max(0, ...publicView.publicLog.map((entry) => entry.seq)) + 1;
  publicView.publicLog = [
    ...publicView.publicLog,
    {
      seq: nextPublicLogSeq,
      at: 1,
      action: 'dawn',
      victims: [{ id: 'seat-morgan', name: 'Morgan' }],
    },
    {
      seq: nextPublicLogSeq + 1,
      at: 2,
      action: 'dawn',
      victims: [],
    },
  ];
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
    route.fulfill({
      status: 200,
      json: { serverNow: Date.now(), version: 12, view: publicView },
    }),
  );
  await page.route(`**/api/games/${gameId}/commands`, (route) =>
    route.fulfill({
      status: 200,
      json: { serverNow: Date.now(), version: 13, view: publicView },
    }),
  );
  await page.route(`**/api/games/${gameId}/private-view`, async (route) => {
    privateRequests += 1;
    expect(route.request().postDataJSON()).toEqual({ purpose: 'notes' });
    await route.fulfill({
      status: 200,
      json: {
        serverNow: Date.now(),
        version: 12,
        view: {
          ...publicView,
          private: {
            role: 'faithful',
            team: [],
            options: [],
            choices: {},
            choiceSlots: [],
            chat: [],
            task: null,
            minimumDurationMs: 0,
          },
        },
      },
    });
  });

  await page.goto(`/game/${gameId}`);
  await expect(page.getByTestId('player-game')).toHaveAttribute(
    'data-phase',
    'DEBATE',
  );
  await expect(
    page.getByRole('heading', { name: 'Your room', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/players have completed this part/)).toHaveCount(
    0,
  );

  const phaseHelp = page.locator('details').filter({ hasText: "What's this?" });
  await expect(phaseHelp).toHaveCount(1);
  await phaseHelp.locator('summary').click();
  await expect(phaseHelp).toContainText(
    'Everyone talks it over. Who is acting suspiciously, and why? In a real game this lasts as long as the organiser sets.',
  );
  await expect(page.getByTestId('player-seat-seat-morgan')).toBeVisible();
  await expect(page.getByTestId('player-seat-seat-alex')).toContainText('Out');
  await expect(page.getByTestId('status-prize-pot')).toContainText('18 points');
  const publicLog = page.getByTestId('list-public-log');
  await expect(publicLog).toContainText('Alex moved to a new device');
  await expect(publicLog).toContainText('Morgan was taken in the night.');
  await expect(publicLog).toContainText('No one was taken.');
  await expect(page.getByRole('button', { name: 'Full screen' })).toHaveCount(
    0,
  );
  const notesButton = page.getByRole('button', { name: 'Notes' });
  await expect(notesButton).toBeVisible();
  await notesButton.click();

  await expect(
    page.getByRole('dialog', { name: 'Shield your screen' }),
  ).toHaveCount(0);
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
  const clockStart = new Date('2030-01-01T12:00:00.000Z');
  const pausedAt = new Date(clockStart.getTime() + 10_000);
  await page.clock.install({ time: clockStart });
  await page.clock.pauseAt(pausedAt);
  const gameId = 'deadline-transition-pending';
  const view = {
    ...createPublicView(gameId),
    phase: 'DEBATE' as const,
    deadline: pausedAt.getTime() + 1000,
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
    route.fulfill({
      status: 200,
      json: { serverNow: pausedAt.getTime(), version: 12, view },
    }),
  );
  await page.goto(`/game/${gameId}`);
  await expect(page.getByText('Time left')).toBeVisible();
  await page.clock.fastForward(1100);
  await expect(page.getByText('Moving on...')).toBeVisible();
  await expect(page.getByText('0:00')).toHaveCount(0);
});

test('uses server time when the device clock is two minutes fast or slow', async ({
  browser,
}) => {
  const serverNow = Date.parse('2030-01-01T12:00:00.000Z');
  for (const skew of [120_000, -120_000]) {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    const gameId = `clock-skew-${skew}`;
    const view = {
      ...createPublicView(gameId),
      phase: 'DEBATE' as const,
      deadline: serverNow + 60_000,
    };
    try {
      await page.clock.install({ time: new Date(serverNow + skew) });
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
          json: { serverNow, version: view.version, view },
        }),
      );
      await page.goto(`/game/${gameId}`);
      await expect(page.getByText('Time left')).toBeVisible();
      await expect(page.getByText('1:00')).toBeVisible();
      await page.clock.fastForward(1_100);
      await expect(page.getByText('0:59')).toBeVisible();
    } finally {
      await page.close();
    }
  }
});

test('rehearsal player can move on from public and voting screens', async ({
  page,
}) => {
  const gameId = 'rehearsal-move-on';
  await page.setViewportSize({ width: 320, height: 568 });
  let publicView: FullView = {
    ...createPublicView(gameId),
    canAdvancePhase: true,
    rehearsal: true,
    seats: [
      { id: 'seat-morgan', name: 'Morgan', status: 'alive' },
      { id: 'seat-alex', name: 'Alex', status: 'departed' },
      { id: 'seat-jamie', name: 'Jamie', status: 'alive' },
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `seat-practice-${index + 1}`,
        name: `Practice player ${index + 1}`,
        status: 'alive' as const,
      })),
    ],
  };
  const submitted: Record<string, unknown>[] = [];
  let privateViewRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/private-view')) {
      privateViewRequests += 1;
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
    route.fulfill({
      status: 200,
      json: {
        serverNow: Date.now(),
        version: publicView.version,
        view: publicView,
      },
    }),
  );
  await page.route(`**/api/games/${gameId}/commands`, async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    submitted.push(body);
    const livingSeatIds = publicView.seats
      .filter((seat) => seat.status === 'alive')
      .map((seat) => seat.id);
    publicView = {
      ...publicView,
      phase: body.type === 'AdvancePhase' ? 'VOTE' : publicView.phase,
      version: publicView.version + 1,
      progress:
        body.type === 'AdvancePhase'
          ? { done: 1, total: livingSeatIds.length }
          : body.type === 'SubmitVote'
            ? {
                done: livingSeatIds.length,
                total: livingSeatIds.length,
              }
            : publicView.progress,
      votedSeatIds:
        body.type === 'AdvancePhase'
          ? ['seat-jamie']
          : body.type === 'SubmitVote'
            ? livingSeatIds
            : publicView.votedSeatIds,
      deadline:
        body.type === 'AdvancePhase'
          ? Date.now() + 60_000
          : publicView.deadline,
    };
    await route.fulfill({
      status: 200,
      json: {
        serverNow: Date.now(),
        version: publicView.version,
        view: publicView,
      },
    });
  });
  await page.route(`**/api/games/${gameId}/private-view`, async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        serverNow: Date.now(),
        version: publicView.version,
        view: {
          ...publicView,
          private: {
            role: 'faithful',
            team: [],
            options: [],
            choices: {},
            choiceSlots: [],
            chat: [],
            task: null,
            minimumDurationMs: 0,
          },
        },
      },
    });
  });

  await page.goto(`/game/${gameId}`);
  const stepGuide = page.getByTestId('rehearsal-explainer');
  await expect(stepGuide).toBeVisible();
  await expect(stepGuide).toHaveAccessibleName('Your practice game');
  await expect(stepGuide).toContainText(
    'Computer players fill the other seats',
  );
  await stepGuide.getByRole('button', { name: 'Got it' }).click();
  await expect(stepGuide).toHaveAccessibleName('The conversation');
  await expect(stepGuide).toContainText('Everyone talks it over');
  await stepGuide.getByRole('button', { name: 'Got it' }).click();
  await expect(stepGuide).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next step' })).toBeVisible();
  await expect(
    page.getByText(
      'The organiser will move the game forward. Keep your phone close and your screen private.',
    ),
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Next step' }).click();
  const voteGuide = page.getByRole('dialog', { name: 'The vote' });
  await expect(voteGuide).toBeVisible();
  await expect(voteGuide).toContainText('Everyone secretly votes');
  await voteGuide.getByRole('button', { name: 'Got it' }).click();
  await expect(voteGuide).toHaveCount(0);
  await expect(
    page.getByRole('dialog', { name: 'Shield your screen' }),
  ).toHaveCount(0);
  await expect(page.getByText('Who do you vote to banish?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Jamie' })).toBeVisible();
  expect(privateViewRequests).toBe(0);
  const choiceList = page.getByTestId('private-choice-list');
  await expect(page.getByTestId('button-hold-reveal')).toHaveCount(0);
  await expect(choiceList).toBeVisible();
  await expect(choiceList.getByRole('button')).toHaveCount(5);
  await expect(page.getByTestId('phase-progress-status')).toHaveCount(0);
  await expect(page.getByTestId('vote-self-status')).toContainText('Morgan');
  await expect(page.getByTestId('vote-status-seat-morgan')).toHaveText(
    'Waiting',
  );
  await expect(page.getByTestId('vote-status-seat-jamie')).toHaveText('Voted');
  await expect(page.getByTestId('vote-status-seat-practice-1')).toHaveText(
    'Waiting',
  );
  const voteLayout = await page.locator('main#main').evaluate((main) => ({
    contentHeight: main.scrollHeight,
    viewportHeight: main.clientHeight,
  }));
  expect(voteLayout.contentHeight).toBeLessThanOrEqual(
    voteLayout.viewportHeight,
  );
  await expect(page.getByText('Who do you vote to banish?')).toBeVisible();
  await page.getByRole('button', { name: 'Jamie', exact: true }).click();
  await page.getByRole('button', { name: 'Review this choice' }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect(privateViewRequests).toBe(0);
  await expect(choiceList).toHaveCount(0);
  await expect(page.getByTestId('waiting-for-everyone')).toHaveText(
    'Everyone has voted. Tap Next step to see the result.',
  );
  await expect(
    page.getByText('Thanks. Waiting for everyone.', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByTestId('rehearsal-action-bar')
      .getByText('Everyone has voted. Tap Next step to see the result.'),
  ).toHaveCount(0);
  expect(submitted[0]).toMatchObject({
    type: 'AdvancePhase',
    expectedVersion: 12,
  });
  expect(submitted).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'SubmitVote',
        target: 'seat-jamie',
      }),
    ]),
  );
});

test('out players see vote status without targets or an aggregate counter', async ({
  page,
}) => {
  const gameId = 'out-vote-progress';
  let publicView = {
    ...createPublicView(gameId),
    phase: 'VOTE',
    viewerSeatId: 'seat-alex',
    progress: { done: 1, total: 2 },
    votedSeatIds: ['seat-jamie'],
  } as FullView;

  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'c'.repeat(43) } }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: {
        serverNow: Date.now(),
        version: publicView.version,
        view: publicView,
      },
    }),
  );

  await page.goto(`/game/${gameId}`);
  const voteProgress = page.getByTestId('vote-progress-list');
  await expect(voteProgress).toBeVisible();
  await expect(voteProgress.getByTestId('vote-status-seat-jamie')).toHaveText(
    'Voted',
  );
  await expect(voteProgress.getByTestId('vote-status-seat-morgan')).toHaveText(
    'Waiting',
  );
  await expect(page.getByTestId('private-choice-list')).toHaveCount(0);
  await expect(page.getByTestId('phase-progress-status')).toHaveCount(0);
  expect(publicView.ballots).toEqual({});
  await expect(
    page.getByText('Everyone has voted. The result is coming.', {
      exact: true,
    }),
  ).toHaveCount(0);

  publicView = {
    ...publicView,
    progress: { done: 2, total: 2 },
    votedSeatIds: ['seat-jamie', 'seat-morgan'],
  };
  await page.reload();
  await expect(page.getByTestId('vote-completion-message')).toHaveText(
    'Everyone has voted. The result is coming.',
  );
});

test('banishment re-vote lists tied seats and reports vote failures accurately', async ({
  page,
}) => {
  const gameId = 'vote-screen';
  await page.setViewportSize({ width: 320, height: 568 });
  const publicView = {
    ...createPublicView(gameId),
    phase: 'VOTE',
    voteCandidates: ['seat-jamie', 'seat-practice-2'],
    viewerSeatId: 'seat-morgan',
    seats: [
      { id: 'seat-morgan', name: 'Morgan', status: 'alive' },
      { id: 'seat-alex', name: 'Alex', status: 'departed' },
      { id: 'seat-jamie', name: 'Jamie', status: 'alive' },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `seat-practice-${index + 1}`,
        name: `Practice player ${index + 1}`,
        status: 'alive' as const,
      })),
    ],
  } as FullView;
  const submittedCommands: unknown[] = [];
  let rejectNextVote = true;
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
      json: { serverNow: Date.now(), version: 12, view: publicView },
    }),
  );
  await page.route(`**/api/games/${gameId}/commands`, async (route) => {
    const submitted = route.request().postDataJSON() as { type?: string };
    submittedCommands.push(submitted);
    if (submitted.type === 'SubmitVote' && rejectNextVote) {
      rejectNextVote = false;
      await route.fulfill({
        status: 409,
        json: { error: 'Command rejected' },
      });
      return;
    }
    await route.fulfill({
      status: 200,
      json: { serverNow: Date.now(), version: 13, view: publicView },
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

  await expect(
    page.getByRole('dialog', { name: 'Shield your screen' }),
  ).toHaveCount(0);
  await expect(page.getByTestId('button-hold-reveal')).toHaveCount(0);
  await expect(page.getByText('Your private role')).toHaveCount(0);
  const choiceList = page.getByTestId('private-choice-list');
  await expect(choiceList).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Jamie', exact: true }),
  ).toBeVisible();
  const displayedChoices = await choiceList
    .getByRole('button')
    .evaluateAll((buttons) =>
      buttons.map(
        (button) =>
          button.querySelector('span')?.textContent?.trim() ??
          button.textContent?.trim() ??
          '',
      ),
    );
  expect(displayedChoices.sort()).toEqual(
    ['Jamie', 'Practice player 2'].sort(),
  );
  await expect(
    page.getByText('Who do you vote to banish?', { exact: true }),
  ).toHaveCSS('color', 'rgb(250, 250, 245)');
  for (const choiceButton of await choiceList.getByRole('button').all()) {
    await expect(choiceButton).toBeEnabled();
    const visualState = await choiceButton.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        color: style.color,
        cursor: style.cursor,
        opacity: style.opacity,
      };
    });
    expect(visualState.color).toBe('rgb(250, 250, 245)');
    expect(visualState.opacity).toBe('1');
    expect(visualState.cursor).not.toBe('not-allowed');
  }
  const contentOverflow = await page
    .getByTestId('private-choice-content')
    .evaluate((element) => getComputedStyle(element).overflowY);
  expect(contentOverflow).not.toMatch(/auto|scroll/);
  // R5 item 25: genuine overflow scrolls the document, never an inner game pane.
  const scrolling = await page.locator('.game-shell-main').evaluate((main) => ({
    innerOverflow: getComputedStyle(main).overflowY,
    innerScroll: main.scrollHeight > main.clientHeight,
    documentHeight: document.scrollingElement!.scrollHeight,
    contentBottom: main.getBoundingClientRect().bottom + window.scrollY,
  }));
  expect(scrolling.innerOverflow).toBe('visible');
  expect(scrolling.innerScroll).toBe(false);
  expect(scrolling.documentHeight).toBeLessThanOrEqual(
    Math.ceil(scrolling.contentBottom),
  );
  const lastChoice = page
    .getByTestId('private-choice-list')
    .getByRole('button')
    .last();
  await lastChoice.evaluate((element) =>
    element.scrollIntoView({ block: 'center' }),
  );
  const lastChoiceBounds = await lastChoice.boundingBox();
  const footerBounds = await page
    .getByTestId('brand-footer-shell')
    .boundingBox();
  expect(lastChoiceBounds!.y + lastChoiceBounds!.height).toBeLessThanOrEqual(
    footerBounds!.y,
  );
  await expect(
    page.getByRole('button', { name: 'Morgan', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Alex', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Jamie', exact: true }).click();
  await expect(
    page.getByText('Your pick: Jamie', { exact: true }),
  ).toBeVisible();
  await expect(
    choiceList.getByRole('button', { name: 'Jamie', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('button', { name: 'Practice player 2', exact: true })
    .click();
  await expect(
    page.getByText('Your pick: Practice player 2', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Jamie', exact: true }).click();
  await expect(
    page.getByText('Your pick: Jamie', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Review this choice' }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(
    page.getByText(
      'Your vote was not recorded. The game may have moved on; please try again.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText('Please choose someone else.', { exact: true }),
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
  await expect(
    page.getByText('Thanks. Waiting for everyone.', { exact: true }),
  ).toHaveCount(1);
});

for (const role of ['faithful', 'traitor'] as const) {
  test(
    role === 'traitor'
      ? 'shadow explicitly refuses fellow Traitor Jamie, then accepts Faithful Sam'
      : 'shadow choices appear after shielding without a hold and complete privately',
    async ({ page }) => {
      const gameId = 'shadow-choice';
      const publicView = {
        ...createPublicView(gameId),
        phase: 'SHADOW',
        shadowRound: 1,
        shadowSlot: 2,
        murderSlots: 2,
        progress: { done: 0, total: 3 },
      } as FullView;
      publicView.seats.push({ id: 'seat-sam', name: 'Sam', status: 'alive' });
      publicView.seats.push({
        id: 'seat-taylor',
        name: 'Taylor',
        status: 'alive',
      });
      let privateRequests = 0;
      const privateFlow: string[] = [];
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
        route.fulfill({
          status: 200,
          json: { serverNow: Date.now(), version: 12, view: publicView },
        }),
      );
      await page.route(`**/api/games/${gameId}/commands`, async (route) => {
        const command = route.request().postDataJSON();
        submittedCommands.push(command);
        privateFlow.push(`command:${command.type}`);
        if (
          role === 'traitor' &&
          command.type === 'SubmitShadowChoice' &&
          command.choice === 'seat-jamie'
        ) {
          await route.fulfill({
            status: 409,
            json: { error: 'Command rejected' },
          });
          return;
        }
        await route.fulfill({
          status: 200,
          json: { serverNow: Date.now(), version: 13, view: publicView },
        });
      });
      await page.route(`**/api/games/${gameId}/private-view`, async (route) => {
        privateRequests += 1;
        privateFlow.push('private-view');
        await route.fulfill({
          status: 200,
          json: {
            serverNow: Date.now(),
            version: 13,
            view: {
              ...publicView,
              private: {
                role,
                team:
                  role === 'traitor'
                    ? [
                        { id: 'seat-morgan', name: 'Morgan', role: 'traitor' },
                        { id: 'seat-jamie', name: 'Jamie', role: 'traitor' },
                      ]
                    : [],
                options: [
                  { id: 'seat-jamie', name: 'Jamie' },
                  { id: 'seat-sam', name: 'Sam' },
                  { id: 'seat-taylor', name: 'Taylor' },
                ],
                choices: {},
                choiceSlots:
                  role === 'traitor'
                    ? [
                        {
                          slot: 1,
                          round: 1,
                          picks: [{ seatId: 'seat-jamie', choice: 'seat-sam' }],
                        },
                        {
                          slot: 2,
                          round: 1,
                          picks: [
                            { seatId: 'seat-jamie', choice: 'seat-taylor' },
                          ],
                        },
                      ]
                    : [],
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
      await expect(shieldConfirmation).toHaveAttribute(
        'aria-disabled',
        'false',
        {
          timeout: 6500,
        },
      );
      await shieldConfirmation.click();
      await expect.poll(() => privateRequests).toBe(1);
      expect(privateFlow.slice(0, 2)).toEqual([
        'command:AcknowledgePrivate',
        'private-view',
      ]);
      await expect(page.getByTestId('private-choice-content')).toBeVisible();
      await expect(page.getByTestId('button-hold-reveal')).toHaveCount(0);
      await expect(
        page.getByText(
          role === 'traitor'
            ? 'Who will the Traitors take tonight?'
            : 'Who do you think the Traitors will take tonight?',
          { exact: true },
        ),
      ).toBeVisible();
      const candleColor = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--candle)';
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      });
      await expect(page.getByTestId('shadow-slot-label')).toHaveCSS(
        'color',
        candleColor,
      );
      const nightPrompt = page.getByText(
        role === 'traitor'
          ? 'Who will the Traitors take tonight?'
          : 'Who do you think the Traitors will take tonight?',
        { exact: true },
      );
      await expect(nightPrompt).toHaveCSS('color', candleColor);
      const nightChoices = page
        .getByTestId('private-choice-list')
        .getByRole('button');
      await expect(nightChoices.first()).toBeEnabled();
      await expect(nightChoices.first()).toHaveCSS('cursor', 'pointer');
      await expect(nightChoices.first()).toHaveCSS('opacity', '1');
      await expect(nightChoices.first()).toHaveCSS('color', candleColor);
      const shadowStatusLines = page.getByTestId('shadow-status').locator('p');
      await expect(shadowStatusLines).toHaveCount(4);
      await expect(shadowStatusLines.nth(0)).toHaveText(
        role === 'traitor'
          ? "You haven't picked yet"
          : "You haven't guessed yet",
      );
      await expect(shadowStatusLines.nth(1)).toHaveText(
        role === 'traitor'
          ? 'Jamie picked: 1st: Sam · 2nd: Taylor'
          : 'Guesses stay secret until the end.',
      );
      await expect(shadowStatusLines.nth(2)).toHaveText(
        role === 'traitor' ? '' : 'Think about who the Traitors fear most.',
      );
      await expect(shadowStatusLines.nth(3)).toHaveText(
        role === 'traitor'
          ? 'You can change your pick until the night ends.'
          : 'You can change your guess until the night ends.',
      );
      await expect(page.getByText(/round [12]/i)).toHaveCount(0);
      await expect(page.getByTestId('shadow-slot-label')).toHaveText(
        'Second choice',
      );
      await expect(
        page.getByRole('button', { name: 'Morgan', exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Alex', exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Jamie', exact: true }),
      ).toBeEnabled();
      await page.getByRole('button', { name: 'Jamie', exact: true }).click();
      await expect(
        page.getByText('Your pick: Jamie', { exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Review this choice' }).click();
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();
      if (role === 'traitor') {
        await expect(
          page.getByText('Please choose someone else.', { exact: true }),
        ).toBeVisible();
        await expect(page.getByTestId('waiting-for-everyone')).toHaveCount(0);
        expect(submittedCommands).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'SubmitShadowChoice',
              choice: 'seat-jamie',
            }),
          ]),
        );
        await page.getByRole('button', { name: 'Sam', exact: true }).click();
        await page.getByRole('button', { name: 'Review this choice' }).click();
        await page
          .getByRole('button', { name: 'Confirm', exact: true })
          .click();
      }
      await expect
        .poll(() => submittedCommands)
        .toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'SubmitShadowChoice',
              choice: role === 'traitor' ? 'seat-sam' : 'seat-jamie',
            }),
            expect.objectContaining({ type: 'AcknowledgePrivate' }),
          ]),
        );
      await expect(
        page.getByText('Thanks. Waiting for everyone.', { exact: true }),
      ).toBeVisible();
    },
  );
}

test('banishment votes are alphabetical while night choices stay shuffled per seat', async ({
  page,
  browser,
}) => {
  const otherPage = await browser.newPage({
    viewport: page.viewportSize() ?? { width: 402, height: 874 },
  });
  const roster = [
    { id: 'seat-morgan', name: 'Morgan', status: 'alive' },
    { id: 'seat-alex', name: 'Alex', status: 'alive' },
    { id: 'seat-jamie', name: 'Jamie', status: 'alive' },
    { id: 'seat-sam', name: 'Sam', status: 'alive' },
    { id: 'seat-riley', name: 'Riley', status: 'alive' },
    { id: 'seat-taylor', name: 'Taylor', status: 'alive' },
    { id: 'seat-casey', name: 'Casey', status: 'alive' },
    { id: 'seat-jordan', name: 'Jordan', status: 'alive' },
  ] as const;
  const canonicalOptions = [
    'Alex',
    'Sam',
    'Riley',
    'Taylor',
    'Casey',
    'Jordan',
  ];
  const configureTraitorPage = async (
    targetPage: Page,
    gameId: string,
    viewerSeatId: string,
    phase: 'SHADOW' | 'VOTE' | 'FINAL_BANISH' = 'SHADOW',
  ) => {
    const publicView = {
      ...createPublicView(gameId),
      phase,
      viewerSeatId,
      seats: roster.map((seat) => ({ ...seat })),
    } as FullView;
    await targetPage.route('**/api/csrf', (route) =>
      route.fulfill({
        status: 200,
        headers: {
          'Set-Cookie': 'turnstone-csrf=test-csrf; Path=/; SameSite=Strict',
        },
        json: { csrfToken: 'test-csrf' },
      }),
    );
    await targetPage.route(`**/api/games/${gameId}/view`, (route) =>
      route.fulfill({
        status: 200,
        json: { serverNow: Date.now(), version: 12, view: publicView },
      }),
    );
    await targetPage.route(`**/api/games/${gameId}/commands`, (route) =>
      route.fulfill({
        status: 200,
        json: { serverNow: Date.now(), version: 13, view: publicView },
      }),
    );
    await targetPage.route(`**/api/games/${gameId}/private-view`, (route) =>
      route.fulfill({
        status: 200,
        json: {
          serverNow: Date.now(),
          version: 12,
          view: {
            ...publicView,
            private: {
              role: 'traitor',
              team: [],
              options: canonicalOptions.map((name) => ({
                id: `seat-${name.toLowerCase()}`,
                name,
              })),
              choices: {},
              choiceSlots: [],
              chat: [],
              task: null,
              minimumDurationMs: 0,
            },
          },
        },
      }),
    );
    await targetPage.goto(`/game/${gameId}`);
    if (phase === 'SHADOW') {
      const shield = targetPage
        .getByRole('dialog', { name: 'Shield your screen' })
        .getByRole('button', { name: /i’m shielded/i });
      await expect(shield).toHaveAttribute('aria-disabled', 'false', {
        timeout: 6500,
      });
      await shield.click();
    } else {
      await expect(
        targetPage.getByRole('dialog', { name: 'Shield your screen' }),
      ).toHaveCount(0);
    }
    await expect(targetPage.getByTestId('private-choice-list')).toBeVisible();
    return targetPage
      .getByTestId('private-choice-list')
      .getByRole('button')
      .evaluateAll((buttons) =>
        buttons.map(
          (button) =>
            button.querySelector('span')?.textContent?.trim() ??
            button.textContent?.trim() ??
            '',
        ),
      );
  };

  const isCanonicalRotation = (order: string[]) =>
    canonicalOptions.some((_, offset) =>
      order.every(
        (name, index) =>
          name === canonicalOptions[(index + offset) % canonicalOptions.length],
      ),
    );
  const expectedBanishmentOrder = (viewerSeatId: string) =>
    roster
      .filter((seat) => seat.status === 'alive' && seat.id !== viewerSeatId)
      .map((seat) => seat.name)
      .sort((left, right) =>
        left.localeCompare(right, 'en-GB', { sensitivity: 'base' }),
      );
  try {
    const [morganOrder, jamieOrder] = await Promise.all([
      configureTraitorPage(page, 'shadow-order-game', 'seat-morgan'),
      configureTraitorPage(otherPage, 'shadow-order-game', 'seat-jamie'),
    ]);
    expect(morganOrder.slice().sort()).toEqual(jamieOrder.slice().sort());
    expect(morganOrder).not.toEqual(jamieOrder);
    expect(isCanonicalRotation(morganOrder)).toBe(false);
    expect(isCanonicalRotation(jamieOrder)).toBe(false);

    const [morganVoteOrder, jamieVoteOrder] = await Promise.all([
      configureTraitorPage(page, 'vote-order-game', 'seat-morgan', 'VOTE'),
      configureTraitorPage(otherPage, 'vote-order-game', 'seat-jamie', 'VOTE'),
    ]);
    expect(morganVoteOrder).toEqual(expectedBanishmentOrder('seat-morgan'));
    expect(jamieVoteOrder).toEqual(expectedBanishmentOrder('seat-jamie'));

    const [morganFinalOrder, jamieFinalOrder] = await Promise.all([
      configureTraitorPage(
        page,
        'final-banish-order-game',
        'seat-morgan',
        'FINAL_BANISH',
      ),
      configureTraitorPage(
        otherPage,
        'final-banish-order-game',
        'seat-jamie',
        'FINAL_BANISH',
      ),
    ]);
    expect(morganFinalOrder).toEqual(expectedBanishmentOrder('seat-morgan'));
    expect(jamieFinalOrder).toEqual(expectedBanishmentOrder('seat-jamie'));
  } finally {
    await otherPage.close();
  }
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
    route.fulfill({
      status: 200,
      json: { serverNow: Date.now(), version: 12, view: publicView },
    }),
  );
  await page.route(`**/api/games/${gameId}/private-view`, async (route) => {
    privateRequests += 1;
    expect(route.request().postDataJSON()).toEqual({ purpose: 'notes' });
    await route.fulfill({
      status: 200,
      json: {
        serverNow: Date.now(),
        version: 12,
        view: {
          ...publicView,
          private: {
            role: 'faithful',
            team: [],
            options: [],
            choices: {},
            choiceSlots: [],
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
  await expect(
    page.getByRole('dialog', { name: 'Shield your screen' }),
  ).toHaveCount(0);
  const notes = page.getByTestId('private-notes-content');
  await expect.poll(() => privateRequests).toBe(1);
  await expect(notes).toBeVisible();

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(notes).toHaveCount(0);
  await expect.poll(() => privateRequests).toBe(1);
  const restore = page.getByRole('button', {
    name: 'Tap to see your private screen again',
  });
  await expect(restore).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
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

test('held role text stays above the seal in compact phone viewports', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'desktop',
    'Compact role geometry runs on the phone and tablet profiles',
  );
  const gameId = 'role-viewport';
  const roleView = {
    ...createPublicView(gameId),
    phase: 'DEAL',
  } as FullView;

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
      json: {
        serverNow: Date.now(),
        version: roleView.version,
        view: roleView,
      },
    }),
  );
  await page.route(`**/api/games/${gameId}/commands`, (route) =>
    route.fulfill({
      status: 200,
      json: {
        serverNow: Date.now(),
        version: roleView.version + 1,
        view: roleView,
      },
    }),
  );
  await page.route(`**/api/games/${gameId}/private-view`, (route) =>
    route.fulfill({
      status: 200,
      json: {
        serverNow: Date.now(),
        version: roleView.version,
        view: {
          ...roleView,
          private: {
            role: 'faithful',
            team: [],
            options: [],
            choices: {},
            choiceSlots: [],
            chat: [],
            task: null,
            minimumDurationMs: 0,
          },
        },
      },
    }),
  );

  await page.goto(`/game/${gameId}`);
  const shield = page.getByRole('dialog', { name: 'Shield your screen' });
  const acknowledge = shield.getByRole('button', { name: /I’m shielded/i });
  await expect(acknowledge).toHaveAttribute('aria-disabled', 'false', {
    timeout: 7_000,
  });
  await acknowledge.click();

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    const seal = page.getByTestId('button-hold-reveal');
    const sealBox = await seal.boundingBox();
    expect(
      sealBox,
      `seal at ${viewport.width}x${viewport.height}`,
    ).not.toBeNull();
    await page.mouse.move(
      sealBox!.x + sealBox!.width / 2,
      sealBox!.y + sealBox!.height / 2,
    );
    const scrollYBeforeHold = await page.evaluate(() => window.scrollY);
    await page.mouse.down();
    const roleContent = page.getByTestId('private-role-content');
    await expect(roleContent).toContainText('Faithful');
    const heldSealBox = await seal.boundingBox();
    expect(
      heldSealBox,
      `held seal at ${viewport.width}x${viewport.height}`,
    ).not.toBeNull();

    const heldLayout = await roleContent.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        scrollY: window.scrollY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });
    expect(heldLayout.left).toBeGreaterThanOrEqual(0);
    expect(heldLayout.top).toBeGreaterThanOrEqual(0);
    expect(heldLayout.right).toBeLessThanOrEqual(heldLayout.viewportWidth);
    expect(heldLayout.bottom).toBeLessThanOrEqual(heldLayout.viewportHeight);
    expect(heldLayout.bottom).toBeLessThanOrEqual(heldSealBox!.y);
    expect(heldLayout.scrollY).toBe(scrollYBeforeHold);

    await page.mouse.up();
    await expect(roleContent).not.toContainText('Faithful');
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
    route.fulfill({
      status: 200,
      json: { serverNow: Date.now(), version: 12, view: currentView },
    }),
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
    seats: [
      ...currentView.seats,
      { id: 'seat-taylor', name: 'Taylor', status: 'alive' },
      { id: 'seat-sam', name: 'Sam', status: 'alive' },
    ],
    publicAnnouncement: {
      kind: 'verdict',
      cycle: 1,
      seat: { id: 'seat-alex', name: 'Alex', role: 'traitor' },
    },
    ballots: {
      'seat-morgan': 'seat-alex',
      'seat-jamie': 'seat-alex',
      'seat-taylor': 'seat-morgan',
      'seat-sam': 'seat-jamie',
    },
  };
  await page.reload();
  const verdictAnnouncement = page.getByTestId('shared-announcement');
  await expect(verdictAnnouncement).toHaveText(
    'Alex has been banished. They were Traitor.',
  );
  const verdictHeadings = await page
    .getByTestId('player-game')
    .getByRole('heading')
    .allTextContents();
  expect(verdictHeadings[0]).toBe('Alex has been banished. They were Traitor.');
  const voteReveal = page.getByTestId('list-vote-reveal');
  await expect(voteReveal.locator('li')).toHaveCount(4);
  await expect(voteReveal).toContainText('Morgan voted to banish Alex.');
  const revealAnimations = await voteReveal
    .locator('li')
    .evaluateAll((rows) =>
      rows.map((row) => getComputedStyle(row).animationName),
    );
  expect(revealAnimations).toEqual([
    'vote-reveal',
    'vote-reveal',
    'vote-reveal',
    'vote-reveal',
  ]);
  const resultMotion = await verdictAnnouncement.evaluate((announcement) => {
    return getComputedStyle(announcement).animationName;
  });
  expect(resultMotion).toBe('verdict-reveal');
  const resultFollowsReveal = await page.evaluate(() => {
    const votes = document.querySelector('[data-testid="list-vote-reveal"]');
    const result = document.querySelector(
      '[data-testid="shared-announcement"]',
    );
    return Boolean(
      votes &&
      result &&
      votes.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  expect(resultFollowsReveal).toBe(true);

  currentView = {
    ...currentView,
    phase: 'VERDICT',
    publicAnnouncement: { kind: 'no_votes', cycle: 2 },
    ballots: {},
    publicLog: [
      ...currentView.publicLog,
      { seq: 13, at: Date.now(), action: 'no_votes' },
    ],
  };
  await page.reload();
  const noVotesAnnouncement = page.getByTestId('shared-announcement');
  await expect(noVotesAnnouncement).toHaveCount(1);
  await expect(noVotesAnnouncement).toHaveText(
    'No votes were cast. Nobody is banished.',
  );
  await expect(
    page.getByTestId('player-game').getByRole('heading').first(),
  ).toHaveText('No votes were cast. Nobody is banished.');
  await expect(page.getByTestId('public-log-entry-13')).toHaveText(
    'No votes were cast. Nobody is banished.',
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
    route.fulfill({
      status: 200,
      json: { serverNow: Date.now(), version: 12, view: lobbyView },
    }),
  );
  await page.goto(`/game/${gameId}`);

  await expect(page.getByTestId('lobby-room-code')).toHaveText('ABC234');
  await expect(page.getByTestId('lobby-join-qr')).toBeVisible();
  const supportsFullscreen = await page.evaluate(
    () => typeof document.documentElement.requestFullscreen === 'function',
  );
  const fullscreenButton = page.getByRole('button', { name: 'Full screen' });
  if (supportsFullscreen) {
    await expect(fullscreenButton).toBeVisible();
  } else {
    await expect(fullscreenButton).toHaveCount(0);
  }
});

test('a player taken at dawn sees their own fate in second person', async ({
  page,
}) => {
  const gameId = 'personal-taken-fate';
  const view = createPublicView(gameId);
  view.phase = 'DAWN';
  view.seats[0]!.status = 'murdered';
  view.publicAnnouncement = {
    kind: 'dawn',
    cycle: view.cycle,
    victims: [{ id: 'seat-morgan', name: 'Morgan' }],
  };
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'c'.repeat(64) } }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );

  await page.goto(`/game/${gameId}`);

  await expect(page.getByTestId('player-fate')).toHaveText(
    "You were taken in the night. You're out, but you can keep watching.",
  );
});

test('an out player sees a clear second-person watch-only message', async ({
  page,
}) => {
  const gameId = 'personal-out-fate';
  const view = createPublicView(gameId);
  view.seats[0]!.status = 'banished';
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'c'.repeat(64) } }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );

  await page.goto(`/game/${gameId}`);

  await expect(page.getByTestId('player-fate')).toHaveText(
    "You're out. You can watch, but you can't vote or choose.",
  );
});

test('organiser confirms before moving on when players are unfinished', async ({
  page,
}) => {
  const gameId = 'organiser-advance-confirmation';
  const publicView = createPublicView(gameId);
  publicView.canAdvancePhase = true;
  publicView.progress = { done: 1, total: 3 };
  let serverVersion = 12;
  let commandRequests = 0;
  let commandExpectedVersion: number | undefined;

  await page.route('**/api/csrf', (route) =>
    route.fulfill({
      status: 200,
      json: { csrfToken: 'c'.repeat(64) },
    }),
  );
  await page.route(`**/api/games/${gameId}/view`, (route) =>
    route.fulfill({
      status: 200,
      json: {
        serverNow: Date.now(),
        version: serverVersion,
        view: { ...publicView, version: serverVersion },
      },
    }),
  );
  await page.route(`**/api/games/${gameId}/commands`, async (route) => {
    commandRequests += 1;
    commandExpectedVersion = route.request().postDataJSON().expectedVersion;
    await route.fulfill({
      status: 200,
      json: { serverNow: Date.now(), version: 14, view: publicView },
    });
  });

  await page.goto(`/game/${gameId}`);
  await expect(
    page.getByRole('region', { name: 'Organiser controls' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Move everyone on', exact: true })
    .click();

  const confirmation = page.getByRole('dialog');
  await expect(confirmation).toContainText(
    "2 players haven't finished. Move everyone on anyway?",
  );
  expect(commandRequests).toBe(0);
  await confirmation.getByRole('button', { name: 'Keep waiting' }).click();
  await expect(confirmation).toHaveCount(0);
  expect(commandRequests).toBe(0);

  serverVersion = 13;
  await page
    .getByRole('button', { name: 'Move everyone on', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Move everyone on', exact: true })
    .click();
  await expect.poll(() => commandRequests).toBe(1);
  expect(commandExpectedVersion).toBe(13);
});
