import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  gameViewResponseSchema,
  type FullView,
} from '../lib/shared/src/contracts';

function createView(): FullView {
  return {
    id: 'coordinator-console-test',
    viewerSeatId: 'seat-morgan',
    canAdvancePhase: false,
    coordinatorUndo: { expiresAt: Date.now() + 60_000 },
    gameName: 'Coordinator test',
    version: 12,
    phase: 'VOTE',
    paused: false,
    deadline: Date.now() + 60_000,
    coordinatorPlays: true,
    cycle: 2,
    revote: false,
    shadowRound: 0,
    shadowSlot: 0,
    murderSlots: 1,
    endRule: 'unanimous',
    missionsEnabled: false,
    rehearsal: false,
    pot: 0,
    unit: 'points',
    seats: [
      { id: 'seat-morgan', name: 'Morgan', status: 'alive' },
      { id: 'seat-alex', name: 'Alex', status: 'alive' },
      { id: 'seat-jamie', name: 'Jamie', status: 'alive' },
      { id: 'seat-sam', name: 'Sam', status: 'alive' },
    ],
    commitment: null,
    progress: { done: 1, total: 4 },
    // Three disconnected actions have already been skipped, not cast as votes.
    actionStatus: { waiting: 0, total: 4 },
    coordinatorPendingSeats: [],
    coordinatorSkippedSeats: [
      { id: 'seat-alex', name: 'Alex' },
      { id: 'seat-jamie', name: 'Jamie' },
      { id: 'seat-sam', name: 'Sam' },
    ],
    coordinatorRestorableSeats: [],
    votedSeatIds: [],
    voteCandidates: [],
    ballots: {},
    winner: null,
    publicAnnouncement: null,
    private: null,
    publicLog: [
      {
        seq: 5,
        at: Date.now(),
        action: 'banishment',
        seat: { id: 'seat-taylor', name: 'Taylor' },
      },
    ],
    coordinatorAlerts: [
      {
        seq: 6,
        at: Date.now(),
        code: 'seat_pin_locked',
        seatId: 'seat-alex',
        name: 'Alex',
        lockedUntil: Date.now() + 15 * 60_000,
      },
    ],
    fairness: null,
  } as FullView;
}

test('coordinator can pause, extend and safely advance an active game', async ({
  page,
}) => {
  const gameId = 'coordinator-console-test';
  let view = createView();
  view = { ...view, coordinatorMinimumAdvanceAt: Date.now() + 5_000 };
  const commands: Array<Record<string, unknown>> = [];
  let delegateSeatIds: string[] = [];
  let rejectNextAdvance = false;
  const pairingCode = 'A'.repeat(43);
  const responseSchemaCheck = gameViewResponseSchema.safeParse({
    serverNow: Date.now(),
    version: view.version,
    view,
  });
  expect(
    responseSchemaCheck.success,
    JSON.stringify(responseSchemaCheck.error?.issues),
  ).toBe(true);
  await page.route('**/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'screen-test-token' } }),
  );
  await page.route(`**/games/${gameId}/coordinator/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );
  await page.route(`**/games/${gameId}/join-requests`, (route) =>
    route.fulfill({ json: { requests: [] } }),
  );
  await page.route(
    `**/games/${gameId}/coordinator/delegates`,
    async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { limit: 1, seatIds: delegateSeatIds } });
        return;
      }
      const body = route.request().postDataJSON() as { seatIds: string[] };
      delegateSeatIds = body.seatIds;
      await route.fulfill({
        json: { limit: 1, seatIds: delegateSeatIds },
      });
    },
  );
  await page.route(`**/games/${gameId}/coordinator/presence`, (route) =>
    route.fulfill({ json: { status: 'online' } }),
  );
  await page.route(`**/games/${gameId}/presenter-pairings`, (route) =>
    route.fulfill({
      status: 201,
      json: { code: pairingCode, expiresAt: Date.now() + 10 * 60_000 },
    }),
  );
  await page.route(`**/games/${gameId}/commands`, async (route) => {
    const command = route.request().postDataJSON() as Record<string, unknown>;
    if (command.type === 'AdvancePhase' && rejectNextAdvance) {
      rejectNextAdvance = false;
      view = {
        ...view,
        coordinatorMinimumAdvanceAt: Date.now() + 1_500,
      };
      await route.fulfill({
        status: 409,
        json: { error: 'Command rejected' },
      });
      return;
    }
    commands.push(command);
    view = {
      ...view,
      version: view.version + 1,
      ...(command.type === 'Pause' ? { paused: true } : {}),
      ...(command.type === 'Resume' ? { paused: false } : {}),
      ...(command.type === 'ExtendPhase' && typeof command.minutes === 'number'
        ? { deadline: (view.deadline ?? Date.now()) + command.minutes * 60_000 }
        : {}),
      ...(command.type === 'AdvancePhase'
        ? { phase: 'VERDICT', coordinatorSkippedSeats: [] }
        : {}),
      ...(command.type === 'EndGameEarly'
        ? { phase: 'FINISHED', coordinatorSkippedSeats: [] }
        : {}),
      ...(command.type === 'UndoCoordinatorAction'
        ? { coordinatorUndo: null }
        : {}),
    } as FullView;
    await route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    });
  });
  await page.route('**/socket.io/**', (route) => route.abort());

  await page.addInitScript(() => {
    const originalNow = Date.now.bind(Date);
    Date.now = () => originalNow() + 120_000;
  });
  await page.goto(`/coordinate/${gameId}`);
  const initialViewport = page.viewportSize();
  if (!initialViewport) {
    throw new Error('Coordinator screen test needs a configured viewport.');
  }
  const coordinatorConsole = page.getByTestId('coordinator-console');
  await expect(coordinatorConsole).toBeVisible();
  const moveOnButton = page.getByTestId('button-coordinator-move-on');
  await expect(moveOnButton).toBeDisabled();
  await expect(moveOnButton).toHaveText(/^Ready in \d+$/);
  await expect(moveOnButton).toBeEnabled({ timeout: 7_000 });
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    coordinatorConsole.getByRole('heading', { name: 'Game controls' }),
  ).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('font-size');
  });
  await page.setViewportSize({ width: 3840, height: 2160 });
  const coordinatorBounds = await coordinatorConsole.boundingBox();
  expect(coordinatorBounds?.width).toBeLessThanOrEqual(1200);
  expect(
    await coordinatorConsole.evaluate((element) =>
      parseFloat(getComputedStyle(element).fontSize),
    ),
  ).toBeGreaterThanOrEqual(16);
  const undersizedButtons = await coordinatorConsole
    .locator('button')
    .evaluateAll((buttons) =>
      buttons
        .map((button) => {
          const bounds = button.getBoundingClientRect();
          return { width: bounds.width, height: bounds.height };
        })
        .filter(({ width, height }) => width < 44 || height < 44),
    );
  expect(undersizedButtons).toEqual([]);
  await page.setViewportSize(initialViewport);
  expect(page.viewportSize()).toEqual(initialViewport);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press('Tab');
  const focusedControl = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    const style = getComputedStyle(active);
    return {
      tag: active.tagName,
      outlineStyle: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth),
    };
  });
  expect(focusedControl?.tag).not.toBe('BODY');
  expect(focusedControl?.outlineStyle).not.toBe('none');
  expect(focusedControl?.outlineWidth).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const motionDurations = await coordinatorConsole.evaluate((element) => {
    const toMilliseconds = (value: string) =>
      value.endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000;
    const elements = [element, ...Array.from(element.querySelectorAll('*'))];
    return elements.flatMap((item) => {
      const style = getComputedStyle(item);
      return [style.animationDuration, style.transitionDuration]
        .flatMap((values) => values.split(','))
        .map((value) => toMilliseconds(value.trim()));
    });
  });
  expect(Math.max(0, ...motionDurations)).toBeLessThanOrEqual(0.01);
  await expect(
    page.getByRole('heading', { name: 'Invite a late player' }),
  ).toBeVisible();
  const delegateSection = coordinatorConsole.getByTestId(
    'coordinator-delegates',
  );
  await expect(
    delegateSection.getByRole('heading', {
      name: 'Co-coordinator takeover',
    }),
  ).toBeVisible();
  await delegateSection.getByLabel('Alex').check();
  await delegateSection
    .getByRole('button', { name: /save co-coordinators/i })
    .click();
  await expect(delegateSection.getByRole('status')).toHaveText(
    'Co-coordinators saved.',
  );
  expect(delegateSeatIds).toEqual(['seat-alex']);
  await expect(page.getByTestId('coordinator-current-step')).toHaveText(
    'The vote',
  );
  await expect(page.getByTestId('coordinator-progress')).toHaveText(
    '1 of 4 done',
  );
  await expect(
    delegateSection.getByText('Morgan', { exact: true }),
  ).toBeVisible();
  await expect(
    coordinatorConsole.getByText('Traitor', { exact: true }),
  ).toHaveCount(0);
  await expect(
    coordinatorConsole.getByText('Faithful', { exact: true }),
  ).toHaveCount(0);
  await expect(
    coordinatorConsole
      .getByTestId('coordinator-public-log')
      .getByText(/Taylor/),
  ).toBeVisible();
  await expect(
    coordinatorConsole.getByTestId('coordinator-pin-lockouts'),
  ).toContainText('Alex is locked out after too many PIN attempts');

  await coordinatorConsole
    .getByTestId('button-create-presenter-pairing')
    .click();
  await expect(
    coordinatorConsole.getByTestId('text-presenter-pairing-code'),
  ).toHaveValue(pairingCode);
  await expect(
    coordinatorConsole.getByTestId('link-presenter-screen'),
  ).toHaveAttribute('href', /\/tv\/coordinator-console-test$/);

  await page.getByTestId('button-coordinator-pause').click();
  await expect(page.getByTestId('button-coordinator-pause')).toHaveText(
    'Resume game',
  );
  await page.getByTestId('button-coordinator-pause').click();
  await page.getByTestId('button-extend-5').click();
  await expect(page.getByTestId('coordinator-time-left')).toContainText(
    'Time left:',
  );
  await expect(page.getByTestId('button-coordinator-undo')).toBeVisible();
  await page.getByTestId('button-coordinator-undo').click();
  await expect(page.getByTestId('button-coordinator-undo')).toHaveCount(0);
  expect(commands.at(-1)?.type).toBe('UndoCoordinatorAction');

  rejectNextAdvance = true;
  await moveOnButton.click();
  await expect(
    page.getByText("3 players haven't finished. Move everyone on anyway?"),
  ).toBeVisible();
  expect(commands.map((command) => command.type)).toEqual([
    'Pause',
    'Resume',
    'ExtendPhase',
    'UndoCoordinatorAction',
  ]);
  await page.getByRole('button', { name: 'Move everyone on anyway' }).click();
  await expect(
    page.getByText(
      'This step needs a little longer. The countdown has been refreshed.',
    ),
  ).toBeVisible();
  await expect(moveOnButton).toBeDisabled();
  await expect(moveOnButton).toHaveText(/^Ready in \d+$/);
  await expect(moveOnButton).toBeEnabled({ timeout: 5_000 });
  await moveOnButton.click();
  await expect(
    page.getByText("3 players haven't finished. Move everyone on anyway?"),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Move everyone on anyway' }).click();
  await expect(page.getByTestId('coordinator-current-step')).toHaveText(
    'The verdict',
  );
  expect(commands.at(-1)?.type).toBe('AdvancePhase');

  await page.getByTestId('button-coordinator-end-early').click();
  await expect(
    page.getByText('End this game early? Everyone will see the final result.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Keep playing' }).click();
  expect(commands.some((command) => command.type === 'EndGameEarly')).toBe(
    false,
  );
  await page.getByTestId('button-coordinator-end-early').click();
  await page.getByRole('button', { name: 'End game now' }).click();
  await expect(page.getByTestId('coordinator-current-step')).toHaveText(
    'Game complete',
  );
  await expect(page.getByTestId('button-coordinator-end-early')).toHaveCount(0);
  expect(commands.at(-1)?.type).toBe('EndGameEarly');
});

test('organiser join-request polling honours Retry-After after a 429', async ({
  page,
}) => {
  await page.clock.install();
  const gameId = 'coordinator-join-poll-backoff';
  const view = createView();
  let joinRequestCalls = 0;
  let rateLimited = true;
  await page.route('**/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'screen-test-token' } }),
  );
  await page.route(`**/games/${gameId}/coordinator/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );
  await page.route(`**/games/${gameId}/join-requests`, async (route) => {
    joinRequestCalls += 1;
    if (rateLimited) {
      await route.fulfill({
        status: 429,
        headers: { 'Retry-After': '10' },
        json: { error: 'rate-limited' },
      });
      return;
    }
    await route.fulfill({ json: { requests: [] } });
  });
  await page.route(`**/games/${gameId}/coordinator/delegates`, (route) =>
    route.fulfill({ json: { limit: 0, seatIds: [] } }),
  );
  await page.route(`**/games/${gameId}/coordinator/presence`, (route) =>
    route.fulfill({ json: { status: 'online' } }),
  );

  await page.goto(`/coordinate/${gameId}`);
  await expect(page.getByTestId('button-coordinator-move-on')).toBeVisible();
  expect(joinRequestCalls).toBe(1);

  rateLimited = false;
  await page.clock.fastForward(10_000);
  expect(joinRequestCalls).toBe(1);
  await page.clock.fastForward(1_000);
  await expect.poll(() => joinRequestCalls).toBe(2);
});

test('coordinator waits, confirms disconnected actions, undoes a skip and restores a removed seat', async ({
  page,
}) => {
  const gameId = 'coordinator-console-test';
  const alex = { id: 'seat-alex', name: 'Alex', disconnected: false };
  const jamie = { id: 'seat-jamie', name: 'Jamie', disconnected: true };
  let view: FullView = {
    ...createView(),
    coordinatorUndo: null,
    progress: { done: 2, total: 4 },
    actionStatus: { waiting: 2, total: 4 },
    votedSeatIds: ['seat-morgan', 'seat-sam'],
    coordinatorPendingSeats: [alex, jamie],
    coordinatorSkippedSeats: [],
    coordinatorRestorableSeats: [],
  };
  const commands: Array<{ type: string; seatId: string }> = [];
  await page.route('**/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'screen-test-token' } }),
  );
  await page.route(`**/games/${gameId}/coordinator/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );
  await page.route(`**/games/${gameId}/join-requests`, (route) =>
    route.fulfill({ json: { requests: [] } }),
  );
  await page.route(`**/games/${gameId}/coordinator/delegates`, (route) =>
    route.fulfill({ json: { limit: 1, seatIds: [] } }),
  );
  await page.route(`**/games/${gameId}/coordinator/presence`, (route) =>
    route.fulfill({ json: { status: 'online' } }),
  );
  await page.route(`**/games/${gameId}/commands`, async (route) => {
    const command = route.request().postDataJSON() as {
      type: string;
      seatId: string;
    };
    expect(command.seatId).toBe(jamie.id);
    commands.push(command);
    switch (command.type) {
      case 'SkipPendingAction':
        view = {
          ...view,
          actionStatus: { waiting: 1, total: 4 },
          coordinatorPendingSeats: [alex],
          coordinatorSkippedSeats: [{ id: jamie.id, name: jamie.name }],
        };
        break;
      case 'UndoPendingActionSkip':
        view = {
          ...view,
          actionStatus: { waiting: 2, total: 4 },
          coordinatorPendingSeats: [alex, jamie],
          coordinatorSkippedSeats: [],
        };
        break;
      case 'RemoveDisconnectedSeat':
        view = {
          ...view,
          seats: view.seats.map((seat) =>
            seat.id === jamie.id ? { ...seat, status: 'departed' } : seat,
          ),
          progress: { done: 2, total: 3 },
          actionStatus: { waiting: 1, total: 3 },
          coordinatorPendingSeats: [alex],
          coordinatorRestorableSeats: [{ id: jamie.id, name: jamie.name }],
        };
        break;
      case 'ReinstateDisconnectedSeat':
        view = {
          ...view,
          seats: view.seats.map((seat) =>
            seat.id === jamie.id ? { ...seat, status: 'alive' } : seat,
          ),
          progress: { done: 2, total: 4 },
          actionStatus: { waiting: 2, total: 4 },
          coordinatorPendingSeats: [alex, jamie],
          coordinatorRestorableSeats: [],
        };
        break;
      default:
        throw new Error(`Unexpected pending action command: ${command.type}`);
    }
    view = { ...view, version: view.version + 1 };
    const response = { serverNow: Date.now(), version: view.version, view };
    expect(gameViewResponseSchema.safeParse(response).success).toBe(true);
    await route.fulfill({ json: response });
  });
  await page.route('**/socket.io/**', (route) => route.abort());

  await page.goto(`/coordinate/${gameId}`);
  const controls = page.getByTestId('pending-player-controls');
  await expect(controls).toBeVisible();
  await expect(page.getByTestId('button-coordinator-move-on')).toBeDisabled();
  await expect(page.getByTestId('button-coordinator-move-on')).toHaveText(
    'Waiting for 2 players',
  );
  const graceRow = controls.getByTestId('row-pending-seat-alex');
  await expect(graceRow).toContainText(
    'options become available after 60 seconds',
  );
  await expect(graceRow.locator('button')).toHaveCount(0);
  const disconnectedRow = controls.getByTestId('row-pending-seat-jamie');
  await expect(disconnectedRow.locator('button').first()).toHaveText(
    'Wait longer',
  );
  await controls.getByTestId('button-wait-seat-jamie').click();
  expect(commands).toEqual([]);
  await expect(disconnectedRow).toContainText('keeps their action pending');

  await controls.getByTestId('button-skip-seat-jamie').click();
  const confirmation = controls.getByTestId('confirmation-pending-seat-jamie');
  await expect(confirmation).toContainText(
    "Skip Jamie's action? They stay in the game and this counts as no action.",
  );
  await expect(confirmation).toContainText(
    'You can undo the skip before the phase resolves. The public log records it as disconnected.',
  );
  await expect(
    controls.getByTestId('button-confirm-remove-seat-jamie'),
  ).toHaveCount(0);
  expect(commands).toEqual([]);
  await controls.getByTestId('button-wait-confirmation-seat-jamie').click();
  await expect(confirmation).toHaveCount(0);
  await expect(disconnectedRow).toBeVisible();
  expect(commands).toEqual([]);
  await controls.getByTestId('button-skip-seat-jamie').click();
  await controls.getByTestId('button-confirm-skip-seat-jamie').click();
  await expect(controls.getByTestId('row-skipped-seat-jamie')).toBeVisible();
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByTestId('button-coordinator-move-on')).toHaveText(
    'Waiting for 1 player',
  );
  await controls.getByTestId('button-undo-skip-seat-jamie').click();
  await expect(disconnectedRow).toBeVisible();
  await expect(controls.getByTestId('row-skipped-seat-jamie')).toHaveCount(0);

  await controls.getByTestId('button-remove-seat-jamie').click();
  await expect(confirmation).toContainText(
    'Their role and side stay unknown. They can return until the next phase starts.',
  );
  await expect(confirmation).toContainText(
    'This may end the game if the removal settles the result, in which case a winner will be announced.',
  );
  await expect(
    controls.getByTestId('button-confirm-skip-seat-jamie'),
  ).toHaveCount(0);
  expect(commands.map((command) => command.type)).toEqual([
    'SkipPendingAction',
    'UndoPendingActionSkip',
  ]);
  await controls.getByTestId('button-confirm-remove-seat-jamie').click();
  await expect(controls.getByTestId('row-restorable-seat-jamie')).toContainText(
    'They can still complete their pending action if they return before the next phase starts.',
  );
  await expect(confirmation).toHaveCount(0);
  await controls.getByTestId('button-reinstate-seat-jamie').click();
  await expect(disconnectedRow).toBeVisible();
  await expect(controls.getByTestId('row-restorable-seat-jamie')).toHaveCount(
    0,
  );
  await expect(page.getByTestId('button-coordinator-move-on')).toHaveText(
    'Waiting for 2 players',
  );
  expect(commands.map((command) => command.type)).toEqual([
    'SkipPendingAction',
    'UndoPendingActionSkip',
    'RemoveDisconnectedSeat',
    'ReinstateDisconnectedSeat',
  ]);
});

test('a living player can request a blind majority takeover', async ({
  page,
}) => {
  const gameId = 'coordinator-console-test';
  const view = {
    ...createView(),
    phase: 'DEBATE',
    coordinatorSkippedSeats: [],
  } as FullView;
  const status = {
    eligible: true,
    mode: 'majority',
    canRequest: true,
    canVote: false,
    canClaim: false,
    request: null,
  };
  let requestCreated = false;
  await page.route('**/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'screen-test-token' } }),
  );
  await page.route(`**/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );
  await page.route(`**/games/${gameId}/takeover`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: requestCreated
          ? {
              ...status,
              canRequest: false,
              request: {
                id: 'takeover-request',
                requesterName: 'Morgan',
                status: 'pending',
                yesVotes: 1,
                noVotes: 0,
                requiredVotes: 3,
                expiresAt: Date.now() + 60_000,
                viewerVote: true,
              },
            }
          : status,
      });
      return;
    }
    requestCreated = true;
    await route.fulfill({
      status: 201,
      json: { status: 'pending', requestId: 'takeover-request' },
    });
  });
  await page.route('**/socket.io/**', (route) => route.abort());

  await page.goto(`/game/${gameId}`);
  const takeover = page.getByTestId('coordinator-takeover');
  await expect(takeover).toBeVisible();
  await expect(
    takeover.getByRole('button', { name: /request/i }),
  ).toBeVisible();
  await takeover.getByRole('button', { name: /request/i }).click();
  const requestStatus = takeover.locator('div[role="status"]');
  await expect(requestStatus).toContainText('Morgan');
  await expect(requestStatus).toContainText(
    '1 approve, 0 decline; 3 approvals',
  );
  await expect(takeover.getByText('Traitor', { exact: true })).toHaveCount(0);
  await expect(takeover.getByText('Faithful', { exact: true })).toHaveCount(0);
});

test('the server-selected player automatically receives blind organiser controls without tapping takeover', async ({
  page,
}) => {
  const gameId = 'coordinator-console-test';
  const view = {
    ...createView(),
    phase: 'DEBATE',
    coordinatorSkippedSeats: [],
  } as FullView;
  let claims = 0;
  const commands: unknown[] = [];
  await page.route('**/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'screen-test-token' } }),
  );
  await page.route(`**/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );
  await page.route(`**/games/${gameId}/coordinator/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );
  await page.route(`**/games/${gameId}/takeover`, (route) =>
    route.fulfill({
      json: {
        eligible: true,
        mode: 'co-coordinator',
        canRequest: false,
        canVote: false,
        canClaim: true,
        request: null,
      },
    }),
  );
  await page.route(`**/games/${gameId}/takeover/claim`, async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['x-csrf-token']).toBe('screen-test-token');
    expect(route.request().postData()).toBeNull();
    claims++;
    await route.fulfill({ json: { status: 'transferred' } });
  });
  await page.route(`**/games/${gameId}/join-requests`, (route) =>
    route.fulfill({ json: { requests: [] } }),
  );
  await page.route(`**/games/${gameId}/coordinator/delegates`, (route) =>
    route.fulfill({ json: { limit: 1, seatIds: [] } }),
  );
  await page.route(`**/games/${gameId}/coordinator/presence`, (route) =>
    route.fulfill({ json: { status: 'online' } }),
  );
  await page.route(`**/games/${gameId}/commands`, (route) => {
    commands.push(route.request().postDataJSON());
    return route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    });
  });
  await page.route('**/socket.io/**', (route) => route.abort());

  await page.goto(`/game/${gameId}`);
  // Deliberately no takeover button click: this is the old-client regression.
  await expect(page).toHaveURL(new RegExp(`/coordinate/${gameId}$`));
  const controls = page.getByTestId('coordinator-console');
  await expect(controls).toBeVisible();
  expect(claims).toBe(1);
  expect(commands).toEqual([]);
  await expect(controls.getByText('Traitor', { exact: true })).toHaveCount(0);
  await expect(controls.getByText('Faithful', { exact: true })).toHaveCount(0);
});
