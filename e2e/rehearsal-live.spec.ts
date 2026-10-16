import { expect, test, type Page } from '@playwright/test';
import { sql } from 'drizzle-orm';

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

const rehearsalStartExplanation =
  "This is a practice game. Computer players fill the other seats, and nothing here is real. Each step explains itself; tap Next step when you're ready.";

const rehearsalExplanationByPhase: Partial<Record<Phase, string>> = {
  DEAL: 'Everyone is secretly dealt a role: Traitor or Faithful. Shield your screen, then hold the seal to see yours. Let go and it hides.',
  MISSION:
    'Work together to complete the mission. Your organiser records the result and any prize earned.',
  DEBATE:
    'Everyone talks it over. Who is acting suspiciously, and why? In a real game this lasts as long as the organiser sets.',
  VOTE: 'Everyone secretly votes for the player they think is a Traitor. Votes are revealed one by one once everyone has voted.',
  VERDICT:
    'The player with the most votes is banished, and their role is revealed to everyone.',
  SHADOW:
    'Night falls. The Traitors secretly choose someone to take. Everyone sees a private screen at the same moment, so nobody can tell who is choosing.',
  DAWN: 'Morning. Everyone finds out who was taken in the night, then a new day begins.',
  ENDGAME:
    'Choose whether to end the game or banish again. The final result depends on who remains.',
  FINAL_VOTE:
    'Everyone secretly decides whether to end the game or continue playing.',
  FINAL_BANISH:
    'The remaining players vote to banish someone before the final result.',
  FINISHED:
    'The Faithful win by banishing every Traitor. The Traitors win if any of them make it to the end. Every role is now revealed.',
};

async function currentPhase(page: Page): Promise<Phase> {
  const phase = await page
    .getByTestId('player-game')
    .getAttribute('data-phase');
  if (!phase) throw new Error('The current game phase is not rendered.');
  return phase as Phase;
}

async function latestServerPhase(
  page: Page,
  gameId: string,
): Promise<{
  phase: string;
  version: number;
  progress: { done: number; total: number };
  viewerSeatId?: string;
  seats: { id: string; name: string; status: string }[];
}> {
  return page.evaluate(
    async ({ id }) => {
      const response = await fetch(
        `/api/games/${encodeURIComponent(id)}/view`,
        {
          cache: 'no-store',
          credentials: 'include',
        },
      );
      const payload = (await response.json()) as {
        view: {
          phase: string;
          version: number;
          progress: { done: number; total: number };
          viewerSeatId?: string;
          seats: { id: string; name: string; status: string }[];
        };
      };
      return payload.view;
    },
    { id: gameId },
  );
}

async function handleShield(page: Page, gameId: string): Promise<void> {
  const shield = page.getByRole('dialog', { name: 'Shield your screen' });
  if (!(await shield.isVisible().catch(() => false))) return;
  await expect(shield.getByTestId('brand-footer-overlay')).toBeVisible();
  await expect(page.getByTestId('rehearsal-action-bar')).toHaveCount(0);
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
  await expect(page.getByTestId('rehearsal-action-bar')).toHaveCount(0);
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

async function ownSeatStatus(
  page: Page,
  gameId: string,
): Promise<string | null> {
  return page.evaluate(
    async ({ id }) => {
      const response = await fetch(
        `/api/games/${encodeURIComponent(id)}/view`,
        { cache: 'no-store', credentials: 'include' },
      );
      if (!response.ok) return null;
      const payload = (await response.json()) as {
        view: {
          viewerSeatId?: string;
          seats: { id: string; status: string }[];
        };
      };
      const viewerSeatId = payload.view.viewerSeatId;
      return viewerSeatId
        ? (payload.view.seats.find((seat) => seat.id === viewerSeatId)
            ?.status ?? null)
        : null;
    },
    { id: gameId },
  );
}

async function revealDealRole(page: Page): Promise<'Traitor' | 'Faithful'> {
  const seal = page.getByTestId('button-hold-reveal');
  await expect(seal).toBeVisible();
  await expect(page.getByTestId('rehearsal-action-bar')).toHaveCount(0);
  await seal.focus();
  await page.keyboard.down('Space');
  const content = page.getByTestId('private-role-content');
  await expect(content).toContainText(/Traitor|Faithful/, { timeout: 3_000 });
  const role: 'Traitor' | 'Faithful' = (await content.innerText()).includes(
    'Traitor',
  )
    ? 'Traitor'
    : 'Faithful';
  await page.keyboard.up('Space');
  await expect(content).not.toContainText(/Traitor|Faithful/);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  return role;
}

async function submitPrivateChoice(page: Page, gameId: string): Promise<void> {
  await handleShield(page, gameId);
  await expect(page.getByTestId('button-hold-reveal')).toHaveCount(0);
  const choiceList = page.getByTestId('private-choice-list');
  await expect(choiceList).toBeVisible({ timeout: 5_000 });
  const phaseBeforeChoice = await currentPhase(page);
  const choices = choiceList.getByRole('button');
  if (['VOTE', 'FINAL_BANISH', 'SHADOW'].includes(phaseBeforeChoice)) {
    const roster = await latestServerPhase(page, gameId);
    expect(roster.phase).toBe(phaseBeforeChoice);
    expect(roster.viewerSeatId).toBeTruthy();
    const eligibleNames = roster.seats
      .filter(
        (seat) => seat.status === 'alive' && seat.id !== roster.viewerSeatId,
      )
      .map((seat) => seat.name);
    const displayedNames = await choices.allTextContents();
    expect(displayedNames.length).toBeGreaterThan(0);
    expect(new Set(displayedNames).size).toBe(displayedNames.length);
    for (const name of displayedNames) {
      expect(eligibleNames).toContain(name.trim());
    }
    for (const seat of roster.seats.filter(
      (seat) => seat.id === roster.viewerSeatId || seat.status !== 'alive',
    )) {
      await expect(
        choiceList.getByRole('button', { name: seat.name, exact: true }),
      ).toHaveCount(0);
    }
  }
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
    await choices
      .first()
      .evaluate((choice: HTMLButtonElement) => choice.click());
    await page
      .getByRole('button', { name: 'Review this choice' })
      .evaluate((button: HTMLButtonElement) => button.click());
    await page
      .getByRole('button', { name: 'Confirm', exact: true })
      .evaluate((button: HTMLButtonElement) => button.click());

    const waiting = page.getByTestId('waiting-for-everyone');
    const rejected = page.getByText('Please choose someone else.', {
      exact: true,
    });
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (
        (await rejected.isVisible().catch(() => false)) ||
        commandStatuses.some((status) => status >= 400)
      ) {
        throw new Error(
          `${phaseBeforeChoice} rejected the selected eligible choice (HTTP ${commandStatuses.join(', ') || 'none'}); the test does not retry another name.`,
        );
      }
      if (await waiting.isVisible().catch(() => false)) return;
      if ((await currentPhase(page)) !== phaseBeforeChoice) return;
      await page.waitForTimeout(100);
    }
    const latest = await latestServerPhase(page, gameId);
    throw new Error(
      `${phaseBeforeChoice} choice had no visible result (HTTP ${commandStatuses.join(', ') || 'none'}, server ${latest.phase} v${latest.version} progress ${latest.progress.done}/${latest.progress.total}).`,
    );
  } finally {
    page.off('response', recordCommandStatus);
  }
}

async function advanceIfStillOn(
  page: Page,
  gameId: string,
  phase: Phase,
  phaseStartedAt: number,
): Promise<void> {
  if ((await currentPhase(page)) !== phase) return;
  const shadowRoundAtStart =
    phase === 'SHADOW'
      ? Number(
          await page
            .getByTestId('player-game')
            .getAttribute('data-shadow-round'),
        )
      : 0;
  const privateMinimum =
    phase === 'SHADOW'
      ? 8_000
      : ['DEAL', 'VOTE', 'FINAL_VOTE', 'FINAL_BANISH'].includes(phase)
        ? 5_500
        : 0;
  const remainingMinimum = privateMinimum - (Date.now() - phaseStartedAt);
  if (remainingMinimum > 0) await page.waitForTimeout(remainingMinimum);
  if (phase === 'DEAL') {
    await page.waitForTimeout(1_200);
    const phaseAfterWaiting = await currentPhase(page);
    if (phaseAfterWaiting !== phase) {
      throw new Error(
        `Rehearsal advanced from ${phase} to ${phaseAfterWaiting} without the player choosing Next step.`,
      );
    }
  }
  if (
    phase === 'SHADOW' &&
    Number(
      await page.getByTestId('player-game').getAttribute('data-shadow-round'),
    ) !== shadowRoundAtStart
  )
    return;

  const versionAtStart = Number(
    await page.getByTestId('player-game').getAttribute('data-version'),
  );
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  try {
    await expect
      .poll(
        async () => {
          const nextPhase = await currentPhase(page);
          const nextRound =
            nextPhase === 'SHADOW'
              ? Number(
                  await page
                    .getByTestId('player-game')
                    .getAttribute('data-shadow-round'),
                )
              : 0;
          const nextVersion = Number(
            await page.getByTestId('player-game').getAttribute('data-version'),
          );
          return `${nextPhase}:${nextRound}:${nextVersion > versionAtStart ? 'updated' : 'same'}`;
        },
        { timeout: 15_000, intervals: [100, 250, 500, 1_000] },
      )
      .not.toBe(`${phase}:${shadowRoundAtStart}:same`);
  } catch {
    const latest = await latestServerPhase(page, gameId);
    const currentRound =
      (await currentPhase(page)) === 'SHADOW'
        ? Number(
            await page
              .getByTestId('player-game')
              .getAttribute('data-shadow-round'),
          )
        : 0;
    throw new Error(
      `Timed out advancing ${phase}:${shadowRoundAtStart}; browser remains ${await currentPhase(page)}:${currentRound}, server reports ${latest.phase} v${latest.version} with progress ${latest.progress.done}/${latest.progress.total}.`,
    );
  }
}

async function rejectStuckZero(page: Page, phase: Phase): Promise<void> {
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

test('plays a full rehearsal from the player screen with no presenter or refresh @rehearsal-live', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { db } = await import('@workspace/db');
  let gameId: string | undefined;
  let playerRole: 'Traitor' | 'Faithful' | undefined;
  let appDocumentLoads = 0;
  let captureAppDocumentLoads = false;
  let socketConnections = 0;
  let socketFramesReceived = 0;
  let socketGameViewFramesReceived = 0;
  let socketCloses = 0;
  let socketErrors = 0;
  let socketErrorCategory = 'none';
  let socketConnectAcks = 0;
  let socketConnectErrors = 0;
  let socketSeatCookieSeen = false;
  const socketHttpDetails: string[] = [];
  const socketRequestDetails: string[] = [];
  const observeSocketPacket = (payload: unknown) => {
    const packet = String(payload).slice(0, 2);
    if (packet === '40') socketConnectAcks += 1;
    if (packet === '44') socketConnectErrors += 1;
  };
  page.on('websocket', (socket) => {
    if (new URL(socket.url()).pathname.startsWith('/socket.io')) {
      socketConnections += 1;
      socket.on('framereceived', (frame) => {
        socketFramesReceived += 1;
        observeSocketPacket(frame);
        if (String(frame).includes('"game:view"'))
          socketGameViewFramesReceived += 1;
      });
      socket.on('close', () => {
        socketCloses += 1;
      });
      socket.on('socketerror', (error) => {
        socketErrors += 1;
        const message = String(error).toLowerCase();
        socketErrorCategory = message.includes('403')
          ? 'http-403'
          : message.includes('404')
            ? 'http-404'
            : message.includes('closed')
              ? 'closed'
              : 'other';
      });
    }
  });
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/socket.io')) {
      const pathname = new URL(response.url()).pathname;
      const contentType = response.headers()['content-type'];
      socketHttpDetails.push(
        `${response.request().method()} ${pathname} ${response.status()} ${contentType?.split(';')[0] ?? 'none'}`,
      );
      void response
        .text()
        .then(observeSocketPacket)
        .catch(() => {});
    }
  });
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/socket.io')) {
      void request.allHeaders().then((headers) => {
        const cookieHeader = headers.cookie ?? '';
        const seatCookiePresent = cookieHeader
          .split(';')
          .some((cookie) => cookie.trim().startsWith('turnstone-seat-'));
        socketSeatCookieSeen ||= seatCookiePresent;
        const origin = headers.origin;
        const originStatus = !origin
          ? 'missing'
          : origin === new URL(page.url()).origin
            ? 'same'
            : 'other';
        socketRequestDetails.push(
          `${request.method()} origin=${originStatus} seat-cookie=${seatCookiePresent ? 'yes' : 'no'}`,
        );
      });
    }
    if (
      captureAppDocumentLoads &&
      request.isNavigationRequest() &&
      request.resourceType() === 'document'
    ) {
      appDocumentLoads += 1;
    }
  });

  try {
    await page.goto('/play');
    captureAppDocumentLoads = true;
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
    const rehearsalStartResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/rehearsals' &&
        response.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await page.getByTestId('button-start-rehearsal').click();
    const rehearsalStartResponse = await rehearsalStartResponsePromise;
    if (!rehearsalStartResponse.ok()) {
      throw new Error(
        `Rehearsal start failed with HTTP ${rehearsalStartResponse.status()}.`,
      );
    }
    await page.waitForURL(/\/game\/[^/]+$/, { timeout: 15_000 });

    const match = new URL(page.url()).pathname.match(/\/game\/([^/]+)$/);
    const activeGameId = match?.[1];
    expect(activeGameId).toBeTruthy();
    if (!activeGameId) throw new Error('The rehearsal game id is missing.');
    gameId = activeGameId;

    await expect(page.getByTestId('rehearsal-explanation-copy')).toHaveText(
      "This is a practice game. Computer players fill the other seats, and nothing here is real. Each step explains itself; tap Next step when you're ready.",
    );
    await expect(page.getByTestId('text-entry-brand')).toBeVisible();
    await page.getByTestId('text-entry-brand').click();
    await expect(
      page.getByRole('link', { name: 'Start a new game', exact: true }),
    ).toBeVisible();
    expect(appDocumentLoads).toBe(0);
    await page.goBack();
    await expect(page.getByTestId('rehearsal-explanation-copy')).toHaveText(
      "This is a practice game. Computer players fill the other seats, and nothing here is real. Each step explains itself; tap Next step when you're ready.",
    );
    await page
      .getByRole('button', { name: 'Got it' })
      .click({ timeout: 5_000 });

    const game = page.getByTestId('player-game');
    await expect(game).toHaveAttribute('data-phase', 'DEAL');
    await expect.poll(() => socketConnections).toBeGreaterThan(0);
    await expect.poll(() => socketSeatCookieSeen).toBe(true);
    try {
      await expect.poll(() => socketConnectAcks).toBeGreaterThan(0);
    } catch {
      throw new Error(
        `Socket.IO namespace was not accepted (acks=${socketConnectAcks}, rejects=${socketConnectErrors}, connections=${socketConnections}, frames=${socketFramesReceived}, errors=${socketErrors}/${socketErrorCategory}, closes=${socketCloses}, seat cookie present=${socketSeatCookieSeen}, requests=${socketRequestDetails.join(' | ') || 'none'}, HTTP=${socketHttpDetails.join(' | ') || 'none'}).`,
      );
    }
    await expect(game).toHaveAttribute('data-version', /\d+/);
    await expect(game).toHaveAttribute('data-progress-total', '6');
    const initialProgressDone = Number(
      await game.getAttribute('data-progress-done'),
    );
    expect(initialProgressDone).toBeGreaterThanOrEqual(0);
    expect(initialProgressDone).toBeLessThanOrEqual(6);
    await expect
      .poll(async () => Number(await game.getAttribute('data-progress-done')), {
        timeout: 2_500,
      })
      .toBeGreaterThan(0);
    for (let step = 0; step < 80; step += 1) {
      const phase = await currentPhase(page);
      const phaseStartedAt = Date.now();
      const seatStatus = await ownSeatStatus(page, activeGameId);
      if (phase === 'FINISHED') break;
      const explanation = rehearsalExplanationByPhase[phase];
      if (!explanation) {
        throw new Error(`Rehearsal step ${phase} has no explanation copy.`);
      }
      await expect(page.getByTestId('rehearsal-explanation-copy')).toHaveText(
        explanation,
      );
      await expect(
        page
          .getByTestId('rehearsal-explainer')
          .getByTestId('brand-footer-overlay'),
      ).toBeVisible();
      await expect(
        page.locator('header.public-shell-header .turnstone-wordmark'),
      ).toHaveCount(1);
      await expect(page.getByTestId('brand-footer-shell')).toContainText(
        'made by Stackstone Consulting',
      );
      await page.getByRole('button', { name: 'Got it' }).click();
      if (['DEBATE', 'VERDICT', 'DAWN'].includes(phase)) {
        await expect(
          page.getByText(/players have completed this part/),
        ).toHaveCount(0);
      }
      await page.waitForTimeout(2_500);
      expect(
        await currentPhase(page),
        `Rehearsal phase ${phase} advanced without the player choosing Next step.`,
      ).toBe(phase);
      const shadowRoundBefore =
        phase === 'SHADOW'
          ? Number(await game.getAttribute('data-shadow-round'))
          : 0;
      if (phase === 'DEAL') {
        await handleShield(page, activeGameId);
        playerRole = await revealDealRole(page);
      } else if (['SHADOW', 'FINAL_VOTE'].includes(phase)) {
        if (seatStatus === 'alive') {
          await handleShield(page, activeGameId);
          await submitPrivateChoice(page, activeGameId);
        } else {
          await expect(
            page.getByRole('dialog', { name: 'Shield your screen' }),
          ).not.toBeVisible();
          await expect(page.getByTestId('private-choice-list')).toHaveCount(0);
        }
      } else if (['VOTE', 'FINAL_BANISH'].includes(phase)) {
        if (seatStatus === 'alive') {
          await submitPrivateChoice(page, activeGameId);
        } else {
          await expect(
            page.getByRole('dialog', { name: 'Shield your screen' }),
          ).not.toBeVisible();
          await expect(page.getByTestId('private-choice-list')).toHaveCount(0);
        }
      }

      if (['VOTE', 'FINAL_BANISH'].includes(phase)) {
        const done = await game.getAttribute('data-progress-done');
        const total = await game.getAttribute('data-progress-total');
        await expect(
          page.getByText(`${done} of ${total} have voted`, { exact: true }),
        ).toBeVisible();
      } else if (['DEAL', 'SHADOW', 'FINAL_VOTE'].includes(phase)) {
        const done = await game.getAttribute('data-progress-done');
        const total = await game.getAttribute('data-progress-total');
        await expect(
          page.getByText(`${done} of ${total} are ready`, { exact: true }),
        ).toBeVisible();
      }

      await expect(
        page.getByRole('button', { name: 'Next step', exact: true }),
      ).toBeVisible();
      await rejectStuckZero(page, phase);
      try {
        await advanceIfStillOn(page, activeGameId, phase, phaseStartedAt);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown phase transition error';
        throw new Error(
          `${message} Socket diagnostics: ${socketConnections} connection(s), ${socketFramesReceived} frame(s), ${socketGameViewFramesReceived} game-view frame(s), ${socketErrors} error(s), ${socketCloses} close(s), seat cookie present=${socketSeatCookieSeen}, requests ${socketRequestDetails.join(' | ') || 'none'}, HTTP ${socketHttpDetails.join(' | ') || 'none'}.`,
          { cause: error },
        );
      }
      if (phase === 'SHADOW' && shadowRoundBefore === 1) {
        await expect(game).toHaveAttribute('data-shadow-round', '2');
      }
      expect(appDocumentLoads).toBe(0);
    }

    await expect(game).toHaveAttribute('data-phase', 'FINISHED', {
      timeout: 5_000,
    });
    await expect(page.getByTestId('rehearsal-explanation-copy')).toHaveText(
      rehearsalExplanationByPhase.FINISHED!,
    );
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.getByTestId('shared-announcement')).toContainText(/win/);
    await expect(
      page.getByText(/players have completed this part/),
    ).toHaveCount(0);
    await expect(page.getByTestId('status-prize-pot')).toHaveCount(0);

    const playerRows = page.locator('[data-testid^="player-seat-"]');
    const rowTexts = await playerRows.allTextContents();
    expect(rowTexts.some((text) => text.includes('Playing'))).toBe(false);
    expect(rowTexts.some((text) => /Traitor|Faithful/.test(text))).toBe(true);
    for (const text of rowTexts) {
      expect(text).toMatch(/Traitor|Faithful/);
    }
    for (const text of rowTexts.filter((row) => row.includes('Out'))) {
      expect(text).toMatch(/Out,\s*(Traitor|Faithful)/);
    }
    expect(playerRole).toBeDefined();
    const ownSeat = playerRows.filter({ hasText: 'Morgan' });
    await expect(ownSeat).toHaveCount(1);
    const ownSeatText = await ownSeat.innerText();
    await expect(ownSeat).toContainText(playerRole!);
    if (ownSeatText.includes('Out')) {
      await expect(ownSeat).toContainText(`Out, ${playerRole!}`);
    }

    const winningRole = (
      await page.getByTestId('shared-announcement').innerText()
    ).includes('Traitors')
      ? 'Traitor'
      : 'Faithful';
    const ownRoleLabel = playerRole === 'Traitor' ? 'a Traitor' : 'a Faithful';
    const outcomeText =
      playerRole === winningRole
        ? `You won as ${ownRoleLabel}.`
        : `The ${winningRole === 'Traitor' ? 'Traitors' : 'Faithful'} won. You were ${ownRoleLabel}.`;
    await expect(page.getByTestId('player-outcome')).toHaveText(outcomeText);
    await expect(page.getByTestId('player-outcome')).toContainText(playerRole!);

    const publicUpdates = await page
      .getByTestId('list-public-log')
      .allTextContents();
    const updates = publicUpdates.join('\n');
    expect(updates).toMatch(/was banished/);
    expect(updates).toMatch(/The Traitors won|The Faithful won/);
    await expect(
      page.getByRole('button', { name: 'Rehearse again' }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole('button', { name: 'Back to start', exact: true }),
    ).toBeVisible({ timeout: 5_000 });
    await page.locator('.player-shell-header .turnstone-wordmark').click();
    await expect(
      page.getByRole('link', { name: 'Start a new game', exact: true }),
    ).toBeVisible();
    expect(appDocumentLoads).toBe(0);
    await page.goBack();
    await expect(page.getByTestId('rehearsal-explanation-copy')).toHaveText(
      rehearsalStartExplanation,
    );
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.getByTestId('rehearsal-explanation-copy')).toHaveText(
      rehearsalExplanationByPhase.FINISHED!,
    );
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.getByTestId('rehearsal-explainer')).toHaveCount(0);
    await expect(page.getByTestId('player-outcome')).toBeVisible();
    expect(appDocumentLoads).toBe(0);
    await page
      .getByRole('button', { name: 'Rehearse again' })
      .click({ timeout: 5_000 });
    await expect(page.getByTestId('button-start-rehearsal')).toBeVisible({
      timeout: 5_000,
    });
    captureAppDocumentLoads = false;
    await page.goto(`/game/${gameId}`);
    await expect(page.getByTestId('rehearsal-explanation-copy')).toHaveText(
      rehearsalStartExplanation,
    );
    await page
      .getByRole('button', { name: 'Got it' })
      .click({ timeout: 5_000 });
    await expect(page.getByTestId('rehearsal-explanation-copy')).toHaveText(
      rehearsalExplanationByPhase.FINISHED!,
    );
    await page
      .getByRole('button', { name: 'Got it' })
      .click({ timeout: 5_000 });
    captureAppDocumentLoads = true;
    await expect(
      page.getByRole('button', { name: 'Back to start', exact: true }),
    ).toBeVisible({ timeout: 5_000 });
    await page
      .getByRole('button', { name: 'Back to start', exact: true })
      .click({ timeout: 5_000 });
    await expect(
      page.getByRole('button', { name: 'Start a new game', exact: true }),
    ).toBeVisible({ timeout: 5_000 });
    expect(appDocumentLoads).toBe(0);

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
  if (!process.env.DATABASE_URL) return;
  const { pool } = await import('@workspace/db');
  await pool.end();
});
