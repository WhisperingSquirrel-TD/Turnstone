import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
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
    shieldsPublic: false,
    shieldHolderIds: [],
    rehearsal: false,
    pot: 0,
    unit: 'points',
    seats: [{ id: 'seat-one', name: 'Alex', status: 'alive' }],
    commitment: null,
    progress: { done: 0, total: 1 },
    actionStatus: { waiting: 0, total: 1 },
    votedSeatIds: [],
    voteCandidates: [],
    ballots: {},
    winner: null,
    publicAnnouncement: null,
    private: null,
    publicLog: [],
    coordinatorUndo: null,
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
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const enlargedTextLayout = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const overflowingElements = Array.from(
      document.querySelectorAll<HTMLElement>('body *'),
    )
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: element.className,
          left: Math.round(bounds.left),
          right: Math.round(bounds.right),
          width: Math.round(bounds.width),
        };
      })
      .filter(
        (element) =>
          element.width > 0 &&
          (element.left < -1 || element.right > viewportWidth + 1),
      )
      .slice(0, 8);
    return {
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth,
      overflowingElements,
    };
  });
  expect(
    enlargedTextLayout.scrollWidth,
    JSON.stringify(enlargedTextLayout),
  ).toBeLessThanOrEqual(enlargedTextLayout.viewportWidth);
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('font-size');
  });
  await page.setViewportSize({ width: 3840, height: 2160 });
  const presenterBounds = await page.locator('.presenter-main').boundingBox();
  expect(presenterBounds?.width).toBeLessThanOrEqual(1200);
  expect(
    await page
      .locator('.presenter-main')
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  const undersizedPresenterTargets = await page
    .locator('.presenter-main input, .presenter-main button')
    .evaluateAll((controls) =>
      controls
        .map((control) => {
          const bounds = control.getBoundingClientRect();
          return { width: bounds.width, height: bounds.height };
        })
        .filter(({ width, height }) => width < 44 || height < 44),
    );
  expect(undersizedPresenterTargets).toEqual([]);
  const pairingInput = page.getByLabel('Presenter pairing code');
  const pairingButton = page.getByRole('button', { name: 'Pair this screen' });
  await page.keyboard.press('Tab');
  await expect(pairingInput).toBeFocused();
  const inputFocusStyle = await pairingInput.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(inputFocusStyle.outlineStyle).not.toBe('none');
  expect(parseFloat(inputFocusStyle.outlineWidth)).toBeGreaterThan(0);
  await pairingInput.fill(pairingCode);
  await page.keyboard.press('Tab');
  await expect(pairingButton).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('presenter-game-view')).toBeVisible();
  await expect(page.getByTestId('presenter-lobby-code')).toHaveText('ABC234');
  await expect(page.getByTestId('presenter-join-qr')).toBeVisible();
  await expect(page.getByText('A public game')).toBeVisible();
  await expect(page.getByText('Faithful')).toHaveCount(0);
  await expect(page.getByText('Traitor')).toHaveCount(0);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);

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
    seats: [
      { id: 'seat-one', name: 'Alex', status: 'alive', role: 'traitor' },
      { id: 'seat-two', name: 'Sam', status: 'banished' },
    ],
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
      {
        seq: 2,
        at: Date.now() + 1,
        action: 'schedule_shift',
        minutes: 5,
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
    // Stamp the two-minute deadline when the server answers, not before the
    // page loads: slow WebKit loads otherwise used up seconds of it (#358).
    const serverNow = Date.now();
    const result = presenterPairResponseSchema.parse({
      game: {
        serverNow,
        version: publicView.version,
        view: { ...publicView, deadline: serverNow + 120_000 },
      },
    });
    await route.fulfill({ json: result });
  });
  await page.route('**/socket.io/**', (route) => route.abort());

  await page.goto(`/tv/${gameId}`);
  await page.getByLabel('Presenter pairing code').fill(pairingCode);
  await page.getByRole('button', { name: 'Pair this screen' }).click();
  await expect(page.getByTestId('presenter-countdown')).toHaveText(/1:59|2:00/);

  await expect(
    page.getByText('Sam has been banished. They were Faithful.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText('Faithful', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Traitor', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Sam was banished.')).toBeVisible();
  await expect(
    page.getByText('The schedule has been shifted by 5 minutes.'),
  ).toBeVisible();
  await expect(page.getByText('private-ballot-seat')).toHaveCount(0);
  await expect(page.getByText(/Prize pot:/)).toHaveCount(0);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test('presenter shows the public game result but never per-seat roles', async ({
  page,
}) => {
  const gameId = 'presenter-finished-test';
  const pairingCode = 'C'.repeat(43);
  const publicView = {
    ...presenterView(),
    id: gameId,
    version: 4,
    phase: 'FINISHED',
    lobbyCode: undefined,
    seats: [
      {
        id: 'seat-one',
        name: 'Alex',
        status: 'banished',
        role: 'traitor',
      },
      {
        id: 'seat-two',
        name: 'Sam',
        status: 'alive',
        role: 'faithful',
      },
    ],
    winner: 'traitor',
    publicAnnouncement: { kind: 'finished', winner: 'traitor' },
    publicLog: [
      { seq: 1, at: Date.now(), action: 'finished', winner: 'traitor' },
    ],
  } as unknown as FullView;

  await page.route('**/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'presenter-test-token' } }),
  );
  await page.route(`**/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: {
        serverNow: Date.now(),
        version: 4,
        view: {
          exists: true,
          phase: 'FINISHED',
          lobbyOpen: false,
          seatCount: 2,
        },
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
    page.getByRole('heading', { name: 'Game complete' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Results' })
      .getByText('The game has finished.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('The Traitors won.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Traitor', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Faithful', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Alex: Traitor')).toHaveCount(0);
  await expect(page.getByText('Sam: Faithful')).toHaveCount(0);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test('presenter does not announce the winner before the result is public', async ({
  page,
}) => {
  const gameId = 'presenter-unannounced-result-test';
  const pairingCode = 'E'.repeat(43);
  const publicView = {
    ...presenterView(),
    id: gameId,
    version: 5,
    phase: 'FINISHED',
    lobbyCode: undefined,
    winner: 'traitor',
    publicAnnouncement: null,
    publicLog: [
      { seq: 1, at: Date.now(), action: 'finished', winner: 'traitor' },
    ],
  } as unknown as FullView;

  await page.route('**/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'presenter-test-token' } }),
  );
  await page.route(`**/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: {
        serverNow: Date.now(),
        version: 5,
        view: {
          exists: true,
          phase: 'FINISHED',
          lobbyOpen: false,
          seatCount: 1,
        },
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
    page.getByRole('heading', { name: 'Game complete' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Results' })
      .getByText('The game has finished.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('The Traitors won.', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('The Faithful won.', { exact: true }),
  ).toHaveCount(0);
});

test('presenter vote screen shows aggregate progress without ballot targets', async ({
  page,
}) => {
  const gameId = 'presenter-vote-test';
  const pairingCode = 'D'.repeat(43);
  const publicView = {
    ...presenterView(),
    id: gameId,
    version: 4,
    phase: 'VOTE',
    lobbyCode: undefined,
    seats: [
      { id: 'seat-one', name: 'Alex', status: 'alive' },
      { id: 'seat-two', name: 'Sam', status: 'alive' },
    ],
    progress: { done: 1, total: 2 },
    actionStatus: { waiting: 1, total: 2 },
    votedSeatIds: ['seat-one'],
    voteCandidates: ['seat-two'],
    ballots: { 'seat-one': 'seat-two' },
  } as unknown as FullView;

  await page.route('**/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'presenter-test-token' } }),
  );
  await page.route(`**/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: {
        serverNow: Date.now(),
        version: 4,
        view: {
          exists: true,
          phase: 'VOTE',
          lobbyOpen: false,
          seatCount: 2,
        },
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
    page.getByText('1 of 2 have voted.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Sam', { exact: true })).toHaveCount(0);
  await expect(page.getByText('seat-two', { exact: true })).toHaveCount(0);
});
