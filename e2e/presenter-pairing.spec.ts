import { expect, test } from '@playwright/test';
import {
  gameViewResponseSchema,
  presenterPairResponseSchema,
  type FullView,
} from '../lib/shared/src/contracts';

function presenterView(): FullView {
  return {
    id: 'presenter-screen-test',
    canAdvancePhase: false,
    gameName: 'A public game',
    lobbyCode: 'ABC234',
    version: 3,
    phase: 'LOBBY',
    paused: false,
    deadline: null,
    coordinatorPlays: true,
    cycle: 0,
    revote: false,
    shadowRound: 0,
    shadowSlot: 0,
    murderSlots: 1,
    endRule: 'unanimous',
    missionsEnabled: false,
    rehearsal: false,
    pot: 0,
    unit: 'points',
    seats: [{ id: 'seat-one', name: 'Alex', status: 'alive' }],
    commitment: null,
    progress: { done: 0, total: 1 },
    votedSeatIds: [],
    voteCandidates: [],
    ballots: {},
    winner: null,
    publicAnnouncement: null,
    private: null,
    publicLog: [],
    coordinatorAlerts: [],
    fairness: null,
  } as FullView;
}

test('presenter pairs with a one-time code and receives only the public lobby view', async ({
  page,
}) => {
  const gameId = 'presenter-screen-test';
  const pairingCode = 'A'.repeat(43);
  const visitorView = {
    exists: true as const,
    phase: 'LOBBY' as const,
    lobbyOpen: true,
    seatCount: 1,
  };
  const publicView = presenterView();

  await page.route('**/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'presenter-test-token' } }),
  );
  await page.route(`**/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: {
        serverNow: Date.now(),
        version: visitorView.phase === 'LOBBY' ? 3 : 0,
        view: visitorView,
      },
    }),
  );
  await page.route('**/presenter/pair', async (route) => {
    const request = route.request().postDataJSON() as {
      gameId?: string;
      code?: string;
    };
    expect(request).toEqual({ gameId, code: pairingCode });
    const response = presenterPairResponseSchema.parse({
      game: {
        serverNow: Date.now(),
        version: publicView.version,
        view: publicView,
      },
    });
    await route.fulfill({ json: response });
  });
  await page.route('**/socket.io/**', (route) => route.abort());

  await page.goto(`/tv/${gameId}`);
  await expect(page.getByTestId('presenter-pairing-form')).toBeVisible();
  await expect(page.getByText('ABC234', { exact: true })).toHaveCount(0);
  await page.getByLabel('Presenter pairing code').fill(pairingCode);
  await page.getByRole('button', { name: 'Pair this screen' }).click();

  await expect(page.getByTestId('presenter-game-view')).toBeVisible();
  await expect(page.getByTestId('presenter-lobby-code')).toHaveText('ABC234');
  await expect(page.getByTestId('presenter-join-qr')).toBeVisible();
  await expect(page.getByText('A public game')).toBeVisible();
  await expect(page.getByText('Faithful')).toHaveCount(0);
  await expect(page.getByText('Traitor')).toHaveCount(0);

  expect(
    gameViewResponseSchema.safeParse({
      serverNow: Date.now(),
      version: publicView.version,
      view: publicView,
    }).success,
  ).toBe(true);
});

test('presenter shows the public verdict without exposing private ballots or a disabled pot', async ({
  page,
}) => {
  await page.clock.install({ time: new Date(Date.now() + 120_000) });
  const gameId = 'presenter-verdict-test';
  const pairingCode = 'B'.repeat(43);
  const visitorView = {
    exists: true as const,
    phase: 'VERDICT' as const,
    lobbyOpen: false,
    seatCount: 5,
  };
  const publicView = {
    ...presenterView(),
    id: gameId,
    lobbyCode: undefined,
    phase: 'VERDICT',
    deadline: Date.now() + 120_000,
    publicAnnouncement: {
      kind: 'verdict',
      cycle: 0,
      seat: { id: 'seat-two', name: 'Sam', role: 'faithful' },
    },
    publicLog: [
      {
        seq: 1,
        at: Date.now(),
        action: 'banishment',
        seat: { id: 'seat-two', name: 'Sam' },
      },
    ],
    ballots: { 'seat-one': 'private-ballot-seat' },
  } as unknown as FullView;

  await page.route('**/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'presenter-test-token' } }),
  );
  await page.route(`**/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: {
        serverNow: Date.now(),
        version: 3,
        view: visitorView,
      },
    }),
  );
  await page.route('**/presenter/pair', async (route) => {
    const result = presenterPairResponseSchema.parse({
      game: {
        serverNow: Date.now(),
        version: publicView.version,
        view: publicView,
      },
    });
    await route.fulfill({ json: result });
  });
  await page.route('**/socket.io/**', (route) => route.abort());

  await page.goto(`/tv/${gameId}`);
  await page.getByLabel('Presenter pairing code').fill(pairingCode);
  await page.getByRole('button', { name: 'Pair this screen' }).click();

  await expect(
    page.getByText('Sam has been banished. They were Faithful.'),
  ).toBeVisible();
  await expect(page.getByText('Sam was banished.')).toBeVisible();
  await expect(page.getByTestId('presenter-countdown')).toHaveText(/1:59|2:00/);
  await expect(page.getByText('private-ballot-seat')).toHaveCount(0);
  await expect(page.getByText(/Prize pot:/)).toHaveCount(0);
});
