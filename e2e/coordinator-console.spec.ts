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
  let delegateSeatIds: string[] = [];
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
      ...(command.type === 'UndoCoordinatorAction'
        ? { coordinatorUndo: null }
        : {}),
    } as FullView;
    await route.fulfill({
      json: { serverNow: Date.now(), version: view.version, view },
    });
  });
  await page.route('**/socket.io/**', (route) => route.abort());

  await page.goto(`/coordinate/${gameId}`);
  const coordinatorConsole = page.getByTestId('coordinator-console');
  await expect(coordinatorConsole).toBeVisible();
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

  await page.getByTestId('button-coordinator-move-on').click();
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

test('a living player can request a blind majority takeover', async ({
  page,
}) => {
  const gameId = 'coordinator-console-test';
  const view = { ...createView(), phase: 'DEBATE' } as FullView;
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
