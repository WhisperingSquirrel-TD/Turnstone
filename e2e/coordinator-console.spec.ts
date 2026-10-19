import { expect, test } from '@playwright/test';
import {
  gameViewResponseSchema,
  type FullView,
} from '../lib/shared/src/contracts';

function createView(): FullView {
  return {
    id: 'coordinator-console-test',
    viewerSeatId: 'seat-morgan',
    canAdvancePhase: false,
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
  const commands: Array<Record<string, unknown>> = [];
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
  await page.route(`**/games/${gameId}/view`, (route) =>
    route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    }),
  );
  await page.route(`**/games/${gameId}/join-requests`, (route) =>
    route.fulfill({ json: { requests: [] } }),
  );
  await page.route(`**/games/${gameId}/presenter-pairings`, (route) =>
    route.fulfill({
      status: 201,
      json: { code: pairingCode, expiresAt: Date.now() + 10 * 60_000 },
    }),
  );
  await page.route(`**/games/${gameId}/commands`, async (route) => {
    const command = route.request().postDataJSON() as Record<string, unknown>;
    commands.push(command);
    view = {
      ...view,
      version: view.version + 1,
      ...(command.type === 'Pause' ? { paused: true } : {}),
      ...(command.type === 'Resume' ? { paused: false } : {}),
      ...(command.type === 'ExtendPhase' && typeof command.minutes === 'number'
        ? { deadline: (view.deadline ?? Date.now()) + command.minutes * 60_000 }
        : {}),
      ...(command.type === 'AdvancePhase' ? { phase: 'VERDICT' } : {}),
      ...(command.type === 'EndGameEarly' ? { phase: 'FINISHED' } : {}),
    } as FullView;
    await route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    });
  });
  await page.route('**/socket.io/**', (route) => route.abort());

  await page.goto(`/coordinate/${gameId}`);
  const coordinatorConsole = page.getByTestId('coordinator-console');
  await expect(coordinatorConsole).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Invite a late player' }),
  ).toBeVisible();
  await expect(page.getByTestId('coordinator-current-step')).toHaveText(
    'The vote',
  );
  await expect(page.getByTestId('coordinator-progress')).toHaveText(
    '1 of 4 done',
  );
  await expect(
    coordinatorConsole.getByText('Morgan', { exact: true }),
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

  await page.getByTestId('button-coordinator-move-on').click();
  await expect(
    page.getByText("3 players haven't finished. Move everyone on anyway?"),
  ).toBeVisible();
  expect(commands.map((command) => command.type)).toEqual([
    'Pause',
    'Resume',
    'ExtendPhase',
  ]);
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
