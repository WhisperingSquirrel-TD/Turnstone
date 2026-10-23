import { expect, type BrowserContext, type Page } from '@playwright/test';
import { test } from './support/rehearsal-test';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import type { FullView } from '../lib/shared/src/contracts';

// This spec belongs to the real-server rehearsal runner, not the routed UI
// suite. Every mutation below is a user interaction; HTTP reads only observe.
async function readView(page: Page, gameId: string): Promise<FullView> {
  const scope = new URL(page.url()).pathname.startsWith('/coordinate/')
    ? 'coordinator/view'
    : 'view';
  const response = await page.request.get(`/api/games/${gameId}/${scope}`);
  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as { view: FullView };
  return payload.view;
}

async function acknowledgeRole(page: Page): Promise<void> {
  const shield = page.getByRole('dialog', { name: 'Shield your screen' });
  await expect(shield).toBeVisible({ timeout: 20_000 });
  await shield
    .getByRole('button', { name: 'I’m shielded', exact: true })
    .click();
  await expect(shield).toBeHidden();
  const seal = page.getByRole('button', {
    name: 'Hold the seal to see your role',
    exact: true,
  });
  await expect(seal).toBeVisible();
  await seal.hover();
  await page.mouse.down();
  await expect(
    page.getByRole('heading', { name: /^(Traitor|Faithful)$/ }),
  ).toBeVisible();
  await page.mouse.up();
  await expect(
    page.getByRole('heading', { name: /^(Traitor|Faithful)$/ }),
  ).toBeHidden();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Done', exact: true }),
  ).toBeHidden();
}

test('disconnected player can be skipped, undone, removed, reinstated and return to act @rehearsal-live', async ({
  browser,
  baseURL,
}, testInfo) => {
  // Includes six real joins, the unmodified 60-second server grace, and
  // shield/hold minimums. No browser clock or server-presence overrides.
  test.setTimeout(240_000);
  if (!baseURL) throw new Error('The real-server runner requires a baseURL.');
  const { db } = await import('@workspace/db');
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  const names = ['Morgan', 'Alex', 'Sam', 'Robin', 'Edda', 'Faye'];
  let gameId: string | undefined;
  let coordinatorPage: Page | undefined;
  try {
    for (let index = 0; index < names.length; index += 1) {
      // Inherit the runner's actual device, including UA, touch and scale.
      const context = await browser.newContext({
        ...testInfo.project.use,
        baseURL,
      });
      contexts.push(context);
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      pages.push(page);
    }
    const organiser = pages[0]!;
    await organiser.goto('/');
    await organiser
      .getByRole('link', { name: 'Start a new game', exact: true })
      .click();
    await organiser
      .getByRole('textbox', { name: 'Game name (optional)' })
      .fill(`Q6 ${randomUUID().slice(0, 8)}`);
    await organiser
      .getByRole('button', { name: 'Continue', exact: true })
      .click();
    for (let count = 15; count > names.length; count -= 1) {
      await organiser
        .getByRole('button', { name: 'Fewer players', exact: true })
        .click();
    }
    await expect(organiser.getByTestId('text-create-player-count')).toHaveText(
      '6',
    );
    await organiser
      .getByRole('button', { name: 'Continue', exact: true })
      .click();
    await organiser
      .getByRole('textbox', { name: 'Your first name' })
      .fill(names[0]!);
    await organiser
      .getByRole('textbox', { name: 'Choose a 4-digit PIN' })
      .fill('6284');
    const created = organiser.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/games' &&
        response.request().method() === 'POST',
    );
    await organiser
      .getByRole('button', { name: 'Create game', exact: true })
      .click();
    const creationResponse = await created;
    expect(creationResponse.ok()).toBe(true);
    gameId = (creationResponse.request().postDataJSON() as { id: string }).id;
    const creation = (await creationResponse.json()) as {
      view: { id: string };
    };
    expect(gameId).toBeTruthy();
    expect(creation.view.id).toBe(gameId);
    await expect(organiser.getByTestId('text-lobby-code')).toHaveText(
      /^[A-Z0-9]{6}$/,
    );
    const code = (
      await organiser.getByTestId('text-lobby-code').innerText()
    ).trim();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    for (let index = 1; index < pages.length; index += 1) {
      const player = pages[index]!;
      await player.goto('/');
      await player
        .getByRole('link', { name: 'Join a game', exact: true })
        .click();
      for (let digit = 0; digit < code.length; digit += 1) {
        await player
          .getByRole('textbox', { name: `Game code character ${digit + 1}` })
          .fill(code[digit]!);
      }
      await player
        .getByRole('button', { name: 'Continue', exact: true })
        .click();
      await player
        .getByRole('textbox', { name: 'Your first name' })
        .fill(names[index]!);
      await player
        .getByRole('button', { name: 'Continue', exact: true })
        .click();
      await player
        .getByRole('textbox', { name: '4-digit PIN' })
        .fill(String(6284 + index));
      await player.getByRole('button', { name: 'Join', exact: true }).click();
      await expect(
        player.getByRole('button', { name: 'Check again', exact: true }),
      ).toBeVisible();
      await expect(
        organiser.getByText(names[index]!, { exact: true }),
      ).toBeVisible();
      await organiser
        .getByRole('button', { name: 'Approve', exact: true })
        .click();
      await expect
        .poll(
          async () => {
            if (/\/game\//.test(player.url())) return true;
            const check = player.getByRole('button', {
              name: 'Check again',
              exact: true,
            });
            if ((await check.isVisible()) && (await check.isEnabled()))
              await check.click();
            return /\/game\//.test(player.url());
          },
          { timeout: 30_000 },
        )
        .toBe(true);
      await expect(player.getByTestId('player-game')).toHaveAttribute(
        'data-phase',
        'LOBBY',
      );
      await expect(
        player.getByRole('status', { name: 'Connection status' }),
      ).toHaveText('Online');
    }
    await expect(organiser.getByTestId('text-lobby-player-count')).toHaveText(
      '6 of 6 player seats are ready.',
    );
    const started = organiser.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/games/${gameId}/commands` &&
        response.request().method() === 'POST' &&
        (response.request().postDataJSON() as { type?: string }).type ===
          'StartGame',
    );
    await organiser
      .getByRole('button', { name: 'Start the game', exact: true })
      .click();
    const startResponse = await started;
    expect(startResponse.ok()).toBe(true);
    const startPayload = (await startResponse.json()) as { view: FullView };
    expect(startPayload.view.phase).toBe('DEAL');
    await expect(organiser).toHaveURL(new RegExp(`/game/${gameId}$`));
    for (const page of pages) {
      await expect(page.getByTestId('player-game')).toHaveAttribute(
        'data-phase',
        'DEAL',
      );
    }
    const coordinator = await contexts[0]!.newPage();
    coordinatorPage = coordinator;
    coordinator.setDefaultTimeout(20_000);
    await coordinator.goto(`/coordinate/${gameId}`);
    const controls = coordinator.getByTestId('pending-player-controls');
    const moveOn = coordinator.getByTestId('button-coordinator-move-on');
    const initialCoordinatorView = await readView(coordinator, gameId);
    const summaryPath = testInfo.outputPath('q6-organiser-view-summary.json');
    await writeFile(
      summaryPath,
      JSON.stringify({
        phase: initialCoordinatorView.phase,
        viewerSeatId: initialCoordinatorView.viewerSeatId,
        canAdvancePhase: initialCoordinatorView.canAdvancePhase,
        actionStatus: initialCoordinatorView.actionStatus,
        hasNamedPendingList: Object.hasOwn(
          initialCoordinatorView,
          'coordinatorPendingSeats',
        ),
        pendingSeats: initialCoordinatorView.coordinatorPendingSeats,
      }),
    );
    await testInfo.attach('q6-organiser-view-summary', {
      path: summaryPath,
      contentType: 'application/json',
    });
    await expect(controls.getByTestId('text-pending-count')).toContainText(
      'Waiting for 6 players.',
    );
    await expect(moveOn).toBeDisabled();
    for (const page of pages.slice(0, 4)) await acknowledgeRole(page);

    const view = await readView(coordinator, gameId);
    const target = view.seats.find((seat) => seat.name === 'Faye');
    const connected = view.seats.find((seat) => seat.name === 'Edda');
    if (!target || !connected)
      throw new Error('The two pending seats must exist.');
    const row = controls.getByTestId(`row-pending-${target.id}`);
    const connectedRow = controls.getByTestId(`row-pending-${connected.id}`);
    await expect(controls.getByTestId('text-pending-count')).toHaveText(
      'Waiting for 2 players. The phase will not end until everyone living has acted.',
    );
    await expect(connectedRow).toContainText(
      'options become available after 60 seconds',
    );
    await expect(connectedRow.locator('button')).toHaveCount(0);
    await expect(row.locator('button')).toHaveCount(0);
    const observer = pages[1]!;
    const publicBefore = await readView(observer, gameId);
    expect(publicBefore.actionStatus).toEqual({ waiting: 2, total: 6 });
    for (const key of [
      'coordinatorPendingSeats',
      'coordinatorSkippedSeats',
      'coordinatorRestorableSeats',
    ])
      expect(publicBefore).not.toHaveProperty(key);
    await expect(observer.getByTestId('pending-player-controls')).toHaveCount(
      0,
    );
    await expect(
      observer.locator('[data-testid^="text-pending-name-"]'),
    ).toHaveCount(0);
    // A player cannot obtain the organiser's named pending list by opening
    // the coordinate URL in their own authenticated context.
    const unauthorised = await contexts[1]!.newPage();
    const deniedView = unauthorised.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
        `/api/games/${gameId}/coordinator/view`,
    );
    await unauthorised.goto(`/coordinate/${gameId}`);
    expect((await deniedView).status()).toBe(401);
    await expect(
      unauthorised.getByTestId('pending-player-controls'),
    ).toHaveCount(0);
    await unauthorised.close();

    const savedState = await contexts[5]!.storageState();
    const disconnectedAt = Date.now();
    await contexts[5]!.close(); // Actually closes the player's Socket.IO connection.
    await expect(row.locator('button')).toHaveCount(0);
    await expect(controls.getByTestId(`button-skip-${target.id}`)).toBeVisible({
      timeout: 75_000, // Production grace (60s) plus heartbeat/view refresh delivery.
    });
    const observedGraceMs = Date.now() - disconnectedAt;
    expect(observedGraceMs).toBeGreaterThanOrEqual(60_000);
    await expect(row).toContainText('Disconnected for at least 60 seconds.');
    await expect(connectedRow.locator('button')).toHaveCount(0);
    await expect(moveOn).toHaveText('Waiting for 2 players');
    await expect(moveOn).toBeDisabled();
    await controls.getByTestId(`button-wait-${target.id}`).click();
    expect((await readView(coordinator, gameId)).actionStatus.waiting).toBe(2);

    const confirmation = controls.getByTestId(
      `confirmation-pending-${target.id}`,
    );
    await controls.getByTestId(`button-skip-${target.id}`).click();
    await expect(confirmation).toContainText(
      "Skip Faye's action? They stay in the game and this counts as no action.",
    );
    await expect(confirmation).toContainText(
      'You can undo the skip before the phase resolves. The public log records it as disconnected.',
    );
    expect((await readView(coordinator, gameId)).actionStatus.waiting).toBe(2);
    await controls.getByTestId(`button-wait-confirmation-${target.id}`).click();
    await expect(confirmation).toHaveCount(0);
    await controls.getByTestId(`button-skip-${target.id}`).click();
    await controls.getByTestId(`button-confirm-skip-${target.id}`).click();
    await expect(
      controls.getByTestId(`row-skipped-${target.id}`),
    ).toBeVisible();
    await expect(moveOn).toHaveText('Waiting for 1 player');
    await expect(moveOn).toBeDisabled();
    await expect(
      coordinator.getByTestId('coordinator-public-log'),
    ).toContainText('Faye’s pending action was skipped after a disconnection.');
    const skipped = await readView(observer, gameId);
    expect(skipped.actionStatus).toEqual({ waiting: 1, total: 6 });
    const skippedEntry = skipped.publicLog.find(
      (entry) => entry.action === 'phase_action_skipped',
    );
    expect(skippedEntry).toMatchObject({
      seat: { id: target.id, name: 'Faye' },
    });
    expect(JSON.stringify(skippedEntry)).not.toMatch(
      /traitor|faithful|role|side/i,
    );
    expect(skipped.seats.find((seat) => seat.id === target.id)?.status).toBe(
      'alive',
    );
    await controls.getByTestId(`button-undo-skip-${target.id}`).click();
    await expect(row).toBeVisible();
    await expect(controls.getByTestId(`row-skipped-${target.id}`)).toHaveCount(
      0,
    );
    await expect(moveOn).toHaveText('Waiting for 2 players');
    await expect(
      coordinator.getByTestId('coordinator-public-log'),
    ).toContainText('Faye’s pending action was restored.');
    expect((await readView(coordinator, gameId)).phase).toBe('DEAL');

    await controls.getByTestId(`button-remove-${target.id}`).click();
    await expect(confirmation).toContainText(
      'Their role and side stay unknown. They can return until the next phase starts.',
    );
    await expect(confirmation).toContainText(
      'This may end the game if the removal settles the result',
    );
    expect(
      (await readView(observer, gameId)).seats.find(
        (seat) => seat.id === target.id,
      )?.status,
    ).toBe('alive');
    await controls.getByTestId(`button-confirm-remove-${target.id}`).click();
    await expect(
      controls.getByTestId(`row-restorable-${target.id}`),
    ).toContainText(
      'They can still complete their pending action if they return before the next phase starts.',
    );
    await expect(moveOn).toHaveText('Waiting for 1 player');
    await expect(
      coordinator.getByTestId('coordinator-public-log'),
    ).toContainText(
      'Faye left the game after a disconnection. Nobody knows their role.',
    );
    const removed = await readView(observer, gameId);
    expect(removed.phase).toBe('DEAL');
    expect(removed.actionStatus).toEqual({ waiting: 1, total: 5 });
    expect(removed.seats.find((seat) => seat.id === target.id)).toEqual({
      id: target.id,
      name: 'Faye',
      status: 'departed',
    });
    const removalEntry = removed.publicLog.find(
      (entry) => entry.action === 'seat_left_disconnected',
    );
    expect(removalEntry).toMatchObject({
      seat: { id: target.id, name: 'Faye' },
    });
    expect(JSON.stringify(removalEntry)).not.toMatch(
      /traitor|faithful|role|side/i,
    );
    await controls.getByTestId(`button-reinstate-${target.id}`).click();
    await expect(row).toBeVisible();
    await expect(
      controls.getByTestId(`row-restorable-${target.id}`),
    ).toHaveCount(0);
    await expect(moveOn).toHaveText('Waiting for 2 players');
    await expect(
      coordinator.getByTestId('coordinator-public-log'),
    ).toContainText('Faye returned to the game.');
    expect((await readView(coordinator, gameId)).phase).toBe('DEAL');

    const returnedContext = await browser.newContext({
      ...testInfo.project.use,
      baseURL,
      storageState: savedState,
    });
    contexts.push(returnedContext);
    const returned = await returnedContext.newPage();
    returned.setDefaultTimeout(20_000);
    await returned.goto(`/game/${gameId}`);
    await expect(returned.getByTestId('player-game')).toHaveAttribute(
      'data-phase',
      'DEAL',
    );
    const restored = await readView(returned, gameId);
    expect(restored.viewerSeatId).toBe(target.id);
    expect(restored.seats.find((seat) => seat.id === target.id)?.status).toBe(
      'alive',
    );
    await acknowledgeRole(returned);
    await expect(controls.getByTestId(`row-pending-${target.id}`)).toHaveCount(
      0,
    );
    await expect(moveOn).toHaveText('Waiting for 1 player');
    expect((await readView(observer, gameId)).actionStatus).toEqual({
      waiting: 1,
      total: 6,
    });
    await expect(connectedRow.locator('button')).toHaveCount(0);
    await acknowledgeRole(pages[4]!);
    await expect(coordinator.getByTestId('coordinator-progress')).toHaveText(
      '6 of 6 done',
    );
    // Honour the real minimum: never force-click or alter clocks/deadlines.
    await expect(moveOn).toBeEnabled({ timeout: 20_000 });
    await moveOn.click();
    await expect(returned.getByTestId('player-game')).not.toHaveAttribute(
      'data-phase',
      'DEAL',
    );
    await expect(observer.getByTestId('player-game')).not.toHaveAttribute(
      'data-phase',
      'DEAL',
    );
    // DEAL deliberately shields the player UI for the entire private phase.
    // The observer's public projection was checked at each action above; once
    // that phase ends, retain all four public player-screen log assertions.
    await expect(observer.getByTestId('list-public-log')).toContainText(
      'Faye’s pending action was skipped after a disconnection.',
    );
    await expect(observer.getByTestId('list-public-log')).toContainText(
      'Faye’s pending action was restored.',
    );
    await expect(observer.getByTestId('list-public-log')).toContainText(
      'Faye left the game after a disconnection. Nobody knows their role.',
    );
    await expect(observer.getByTestId('list-public-log')).toContainText(
      'Faye returned to the game.',
    );
    const completedSummaryPath = testInfo.outputPath(
      'q6-real-server-summary.json',
    );
    await writeFile(
      completedSummaryPath,
      JSON.stringify({
        profile: process.env.REHEARSAL_PROFILE ?? 'Pixel',
        separatePlayerContexts: names.length,
        disconnectMethod: 'close authenticated browser context',
        observedGraceMs,
        completed: [
          'skip',
          'undo',
          'remove',
          'reinstate',
          'same-seat-return',
          'pending-action',
          'next-phase',
        ],
      }),
    );
    await testInfo.attach('q6-real-server-summary', {
      path: completedSummaryPath,
      contentType: 'application/json',
    });
    const playerScreenPath = testInfo.outputPath(
      'q6-returned-player-public-log.png',
    );
    await returned.screenshot({ path: playerScreenPath, fullPage: true });
    await testInfo.attach('q6-returned-player-public-log', {
      path: playerScreenPath,
      contentType: 'image/png',
    });
  } catch (error) {
    if (coordinatorPage && !coordinatorPage.isClosed()) {
      const screenshotPath = testInfo.outputPath('q6-organiser-screen.png');
      await coordinatorPage.screenshot({
        path: screenshotPath,
        fullPage: true,
      });
      await testInfo.attach('q6-organiser-screen', {
        path: screenshotPath,
        contentType: 'image/png',
      });
    }
    throw error;
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    if (gameId) {
      await db.transaction(async (transaction) => {
        await transaction.execute(sql`SET LOCAL lock_timeout = '3s'`);
        await transaction.execute(sql`SET LOCAL statement_timeout = '3s'`);
        await transaction.execute(sql`delete from games where id = ${gameId}`);
      });
    }
  }
});
