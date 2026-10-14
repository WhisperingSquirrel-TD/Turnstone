import { expect, test, type Page } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { db, pool } from '@workspace/db';

type Phase =
  | 'DRAFT'
  | 'LOBBY'
  | 'DEAL'
  | 'MISSION'
  | 'DEBATE'
  | 'VOTE'
  | 'VERDICT'
  | 'SHADOW'
  | 'DAWN'
  | 'ENDGAME'
  | 'FINAL_VOTE'
  | 'FINAL_BANISH'
  | 'FINISHED'
  | 'ARCHIVED';

async function currentPhase(page: Page): Promise<Phase> {
  const phase = await page.getByTestId('player-game').getAttribute('data-phase');
  if (!phase) throw new Error('The current game phase is not rendered.');
  return phase as Phase;
}

async function latestServerPhase(page: Page, gameId: string): Promise<{
  phase: string;
  version: number;
  progress: { done: number; total: number };
}> {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/games/${encodeURIComponent(id)}/view`, {
      cache: 'no-store',
    });
    const payload = (await response.json()) as {
      view: {
        phase: string;
        version: number;
        progress: { done: number; total: number };
      };
    };
    return payload.view;
  }, gameId);
}

async function handleShield(page: Page, gameId: string): Promise<void> {
  const shield = page.getByRole('dialog', { name: 'Shield your screen' });
  if (!(await shield.isVisible().catch(() => false))) return;
  const button = shield.getByRole('button', { name: 'I’m shielded' });
  await expect(button).toHaveAttribute('aria-disabled', 'false', {
    timeout: 12_000,
  });
  const responsePromise = page
    .waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `/api/games/${gameId}/commands`,
      { timeout: 5_000 },
    )
    .catch(() => null);
  await button.click();
  const response = await responsePromise;
  try {
    await expect(shield).not.toBeVisible();
  } catch {
    const latest = await latestServerPhase(page, gameId);
    throw new Error(
      `Private acknowledgement did not close the shield (HTTP ${response?.status() ?? 'none'}, server ${latest.phase} v${latest.version}, progress ${latest.progress.done}/${latest.progress.total}).`,
    );
  }
}

async function revealDealRole(page: Page): Promise<void> {
  const seal = page.getByTestId('button-hold-reveal');
  await expect(seal).toBeVisible();
  await seal.focus();
  await page.keyboard.down('Space');
  await expect(page.getByTestId('private-role-content')).toContainText(
    /Traitor|Faithful/,
    { timeout: 3_000 },
  );
  await page.keyboard.up('Space');
  await expect(page.getByTestId('private-role-content')).not.toContainText(
    /Traitor|Faithful/,
  );
  await page.getByRole('button', { name: 'Done', exact: true }).click();
}

async function submitPrivateChoice(page: Page, gameId: string): Promise<void> {
  const choiceList = page.getByTestId('private-choice-list');
  if (!(await choiceList.isVisible().catch(() => false))) return;
  const phaseBeforeChoice = await currentPhase(page);
  const choices = choiceList.getByRole('button');
  const choiceCount = await choices.count();
  const commandStatuses: number[] = [];
  const recordCommandStatus = (response: {
    url(): string;
    status(): number;
    request(): { method(): string };
  }) => {
    if (
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/commands')
    ) {
      commandStatuses.push(response.status());
    }
  };
  page.on('response', recordCommandStatus);

  try {
    for (let index = 0; index < choiceCount; index += 1) {
      if ((await currentPhase(page)) !== phaseBeforeChoice) return;
      const choice = choices.nth(index);
      if (!(await choice.isVisible().catch(() => false))) return;
      await choice.click({ timeout: 5_000 });
      await page
        .getByRole('button', { name: 'Review this choice' })
        .click({ timeout: 5_000 });
      await page
        .getByRole('button', { name: 'Confirm', exact: true })
        .click({ timeout: 5_000 });

      const waiting = page.getByTestId('waiting-for-everyone');
      const rejected = page.getByText('Please choose someone else.', {
        exact: true,
      });
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        if ((await currentPhase(page)) !== phaseBeforeChoice) return;
        if (await waiting.isVisible().catch(() => false)) return;
        if (await rejected.isVisible().catch(() => false)) break;
        await page.waitForTimeout(100);
      }
      if (!(await rejected.isVisible().catch(() => false))) {
        const latest = await latestServerPhase(page, gameId);
        const waitingVisible = await waiting.isVisible().catch(() => false);
        const rejectedVisible = await rejected.isVisible().catch(() => false);
        const choicesVisible = await choiceList
          .isVisible()
          .catch(() => false);
        const reviewVisible = await page
          .getByRole('button', { name: 'Review this choice' })
          .isVisible()
          .catch(() => false);
        const confirmVisible = await page
          .getByRole('button', { name: 'Confirm', exact: true })
          .isVisible()
          .catch(() => false);
        const restoreVisible = await page
          .getByRole('button', {
            name: 'Tap to see your private screen again',
          })
          .isVisible()
          .catch(() => false);
        const content = page.getByTestId('private-choice-content');
        const contentCount = await content.count();
        const contentVisible = await content.isVisible().catch(() => false);
        const privateText = await content.innerText().catch(() => '');
        const descendantTags = await content
          .evaluate((element) =>
            Array.from(element.querySelectorAll('*'))
              .map((child) => child.tagName)
              .join(','),
          )
          .catch(() => 'unavailable');
        const hasWaitingCopy = privateText.includes('Thanks. Waiting for everyone.');
        const hasChoicePrompt = /vote|banish|suspect|final decision/i.test(
          privateText,
        );
        const hasLoadingCopy = privateText.includes(
          'Opening your private screen',
        );
        const dialogOpen = await page
          .locator('dialog')
          .evaluate((dialog) => (dialog as HTMLDialogElement).open)
          .catch(() => false);
        throw new Error(
          `${phaseBeforeChoice} choice had no visible result (HTTP ${commandStatuses.join(', ') || 'none'}, server ${latest.phase} v${latest.version} progress ${latest.progress.done}/${latest.progress.total}, waiting ${waitingVisible}/${hasWaitingCopy}, rejected ${rejectedVisible}, choices ${choicesVisible}, review ${reviewVisible}, confirm ${confirmVisible}, restore ${restoreVisible}, prompt ${hasChoicePrompt}, loading ${hasLoadingCopy}, content ${contentCount}/${contentVisible} [${descendantTags}], dialog ${dialogOpen}).`,
        );
      }
    }
  } finally {
    page.off('response', recordCommandStatus);
  }

  throw new Error(
    `No ${phaseBeforeChoice} choice was accepted (HTTP ${commandStatuses.join(', ') || 'none'}).`,
  );
}

async function advanceIfStillOn(
  page: Page,
  phase: Phase,
  gameId: string,
): Promise<void> {
  try {
    await expect
      .poll(() => currentPhase(page), {
        timeout: 20_000,
        intervals: [100, 250, 500],
      })
      .not.toBe(phase);
    return;
  } catch {
    // Read only the public phase/version to diagnose a stalled scheduler.
  }
  const latest = await latestServerPhase(page, gameId);
  throw new Error(
    `The ${phase} deadline did not advance automatically (server version: ${latest.version}, server phase: ${latest.phase}).`,
  );
}

async function rejectStuckZero(
  page: Page,
  phase: Phase,
): Promise<void> {
  const movingOn = page.getByText('Moving on...', { exact: true });
  if (!(await movingOn.isVisible().catch(() => false))) return;
  const started = Date.now();
  while (Date.now() - started < 2_000) {
    if ((await currentPhase(page)) !== phase) return;
    if (!(await movingOn.isVisible().catch(() => false))) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`The ${phase} screen stayed at zero for over 2 seconds.`);
}

test('plays a full rehearsal from the player screen with no presenter or refresh', async ({
  page,
}) => {
  test.setTimeout(90_000);
  let gameId: string | undefined;
  let gameDocumentLoads = 0;
  page.on('request', (request) => {
    if (
      request.isNavigationRequest() &&
      request.resourceType() === 'document' &&
      new URL(request.url()).pathname.startsWith('/game/')
    ) {
      gameDocumentLoads += 1;
    }
  });

  try {
    await page.goto('/play');
    await page.getByTestId('button-practise-alone').click();
    await expect(
      page.getByRole('heading', { name: 'Practise alone first' }),
    ).toBeVisible();
    const players = page.getByTestId('input-rehearsal-player-count');
    await players.focus();
    await players.press('Home');
    await expect(page.getByTestId('text-rehearsal-player-count')).toHaveText(
      '6',
    );
    await page.getByTestId('input-rehearsal-name').fill('Morgan');
    await page.getByTestId('button-speed-fast').click();
    await page.getByTestId('button-start-rehearsal').click();
    await page.waitForURL(/\/game\/[^/]+$/);

    const match = new URL(page.url()).pathname.match(/\/game\/([^/]+)$/);
    const activeGameId = match?.[1];
    expect(activeGameId).toBeTruthy();
    if (!activeGameId) throw new Error('The rehearsal game id is missing.');
    gameId = activeGameId;
    const game = page.getByTestId('player-game');
    await expect(game).toHaveAttribute('data-phase', 'DEAL');
    await expect(game).toHaveAttribute('data-progress-done', '5');
    const loadsAtGameStart = gameDocumentLoads;

    for (let step = 0; step < 80; step += 1) {
      const phase = await currentPhase(page);
      if (phase === 'FINISHED') break;
      await expect(
        page.getByRole('button', { name: 'Move on', exact: true }),
      ).toBeVisible();

      if (phase === 'DEAL') {
        await handleShield(page, activeGameId);
        await revealDealRole(page);
      } else if (['SHADOW', 'FINAL_VOTE'].includes(phase)) {
        await handleShield(page, activeGameId);
        await submitPrivateChoice(page, activeGameId);
      } else if (['VOTE', 'FINAL_BANISH'].includes(phase)) {
        await submitPrivateChoice(page, activeGameId);
      }

      await rejectStuckZero(page, phase);
      await advanceIfStillOn(page, phase, activeGameId);
      expect(gameDocumentLoads).toBe(loadsAtGameStart);
    }

    await expect(game).toHaveAttribute('data-phase', 'FINISHED', {
      timeout: 5_000,
    });
    await expect(page.getByTestId('shared-announcement')).toContainText(/win/);

    const presenterSessions = await db.execute(sql`
      select count(*) as count
      from game_presenter_sessions
      where game_id = ${gameId}
    `);
    const presenterPairings = await db.execute(sql`
      select count(*) as count
      from game_presenter_pairings
      where game_id = ${gameId}
    `);
    expect(Number(presenterSessions.rows[0]?.count)).toBe(0);
    expect(Number(presenterPairings.rows[0]?.count)).toBe(0);
  } finally {
    if (gameId) {
      await page.close().catch(() => undefined);
      await db.transaction(async (transaction) => {
        await transaction.execute(sql`SET LOCAL lock_timeout = '3s'`);
        await transaction.execute(sql`SET LOCAL statement_timeout = '3s'`);
        await transaction.execute(sql`delete from games where id = ${gameId}`);
      });
    }
  }
});

test.afterAll(async () => {
  await pool.end();
});
