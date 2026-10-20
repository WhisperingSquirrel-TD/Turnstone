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

const rehearsalWatchMessageByPhase: Partial<Record<Phase, string>> = {
  DEBATE: 'The remaining players are talking it over now.',
  VOTE: 'The remaining players are voting now.',
  VERDICT: 'The remaining players are seeing the result now.',
  SHADOW: 'The remaining players are making their private night choices now.',
  DAWN: 'The remaining players are seeing who was taken in the night.',
  ENDGAME: 'The remaining players are deciding whether to end the game now.',
  FINAL_VOTE: 'The remaining players are deciding whether to end the game now.',
  FINAL_BANISH: 'The remaining players are voting now.',
  FINISHED: "The game is complete. Everyone's roles are revealed.",
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
  cycle: number;
  version: number;
  progress: { done: number; total: number };
  viewerSeatId?: string;
  voteCandidates?: string[];
  votedSeatIds: string[];
  ballots: Record<string, string>;
  revote: boolean;
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
          cycle: number;
          version: number;
          progress: { done: number; total: number };
          viewerSeatId?: string;
          voteCandidates?: string[];
          votedSeatIds: string[];
          ballots: Record<string, string>;
          revote: boolean;
          seats: { id: string; name: string; status: string }[];
        };
      };
      return payload.view;
    },
    { id: gameId },
  );
}

async function latestSynchronizedServerPhase(
  page: Page,
  gameId: string,
): Promise<Awaited<ReturnType<typeof latestServerPhase>>> {
  const game = page.getByTestId('player-game');
  const deadline = Date.now() + 5_000;
  let latest = await latestServerPhase(page, gameId);
  while (Date.now() < deadline) {
    const clientVersion = Number(await game.getAttribute('data-version'));
    if (clientVersion === latest.version) return latest;
    await page.waitForTimeout(100);
    latest = await latestServerPhase(page, gameId);
  }
  throw new Error('The game view did not resync before the choice screen.');
}

type ShadowPrivateContext = {
  role: 'traitor' | 'faithful';
  teamNames: string[];
  options: { id: string; name: string }[];
};

async function handleShield(
  page: Page,
  gameId: string,
): Promise<ShadowPrivateContext | null> {
  const shield = page.getByRole('dialog', { name: 'Shield your screen' });
  await expect(shield).toBeVisible({ timeout: 5_000 });
  const phase = await currentPhase(page);
  const privateViewPromise =
    phase === 'SHADOW'
      ? page
          .waitForResponse(
            (response) =>
              response.request().method() === 'POST' &&
              new URL(response.url()).pathname ===
                `/api/games/${gameId}/private-view`,
            { timeout: 5_000 },
          )
          .catch(() => null)
      : null;
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
  if (!privateViewPromise) return null;
  const privateResponse = await privateViewPromise;
  if (!privateResponse?.ok()) {
    throw new Error('The private night view did not load after shielding.');
  }
  const payload = (await privateResponse.json()) as {
    view?: {
      viewerSeatId?: string;
      private?: {
        role?: string | null;
        team?: { name: string; role: string }[];
        options?: { id: string; name: string }[];
      };
    };
  };
  const viewerSeatId = payload.view?.viewerSeatId;
  const privateView = payload.view?.private;
  if (
    !viewerSeatId ||
    !privateView ||
    (privateView.role !== 'traitor' && privateView.role !== 'faithful')
  ) {
    throw new Error('The private night view omitted the seat choice context.');
  }
  return {
    role: privateView.role,
    teamNames: (privateView.team ?? [])
      .filter((member) => member.role === 'traitor')
      .map((member) => member.name),
    options: privateView.options ?? [],
  };
}

async function ownSeatStatus(
  page: Page,
  gameId: string,
): Promise<{ seatId: string | null; status: string | null }> {
  return page.evaluate(
    async ({ id }) => {
      const response = await fetch(
        `/api/games/${encodeURIComponent(id)}/view`,
        { cache: 'no-store', credentials: 'include' },
      );
      if (!response.ok) return { seatId: null, status: null };
      const payload = (await response.json()) as {
        view: {
          viewerSeatId?: string;
          seats: { id: string; status: string }[];
        };
      };
      const viewerSeatId = payload.view.viewerSeatId;
      return {
        seatId: viewerSeatId ?? null,
        status: viewerSeatId
          ? (payload.view.seats.find((seat) => seat.id === viewerSeatId)
              ?.status ?? null)
          : null,
      };
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

async function submitPrivateChoice(
  page: Page,
  gameId: string,
  shadowContext: ShadowPrivateContext | null,
  preferredVoteName?: string,
  excludedShadowChoiceName?: string,
): Promise<string> {
  await expect(page.getByTestId('button-hold-reveal')).toHaveCount(0);
  const choiceList = page.getByTestId('private-choice-list');
  await expect(choiceList).toBeVisible({ timeout: 5_000 });
  const phaseBeforeChoice = await currentPhase(page);
  const screenText = await page.locator('body').innerText();
  expect(screenText).not.toMatch(/round [12]/i);
  if (
    phaseBeforeChoice === 'SHADOW' &&
    Number(
      await page.getByTestId('player-game').getAttribute('data-shadow-round'),
    ) === 2
  ) {
    await expect(page.getByTestId('game-context-line')).toHaveText(
      'No decision yet. One more round of choosing tonight.',
    );
    await expect(page.getByTestId('selected-choice')).toBeVisible();
  }
  if (phaseBeforeChoice === 'FINAL_VOTE') {
    await expect(page.getByTestId('game-context-line')).toContainText(
      'players remain. If everyone chooses End the game',
    );
  } else if (phaseBeforeChoice === 'FINAL_BANISH') {
    await expect(page.getByTestId('game-context-line')).toHaveText(
      'Not everyone chose to end the game, so one more player will be banished. Vote now.',
    );
  }
  const choices = choiceList.getByRole('button');
  let selectedName: string | undefined;
  let nightAlternativeName: string | undefined;
  if (phaseBeforeChoice === 'FINAL_VOTE') {
    const endgameChoices = (await choices.allTextContents()).map((name) =>
      name.trim(),
    );
    expect(endgameChoices.length).toBe(2);
    expect(new Set(endgameChoices)).toEqual(
      new Set(['End the game', 'Continue playing']),
    );
    selectedName = preferredVoteName ?? 'End the game';
    expect(endgameChoices).toContain(selectedName);
  } else if (['VOTE', 'FINAL_BANISH', 'SHADOW'].includes(phaseBeforeChoice)) {
    const roster = await latestSynchronizedServerPhase(page, gameId);
    expect(roster.phase).toBe(phaseBeforeChoice);
    expect(roster.viewerSeatId).toBeTruthy();
    const eligibleNames = roster.seats
      .filter(
        (seat) => seat.status === 'alive' && seat.id !== roster.viewerSeatId,
      )
      .map((seat) => seat.name);
    if (phaseBeforeChoice === 'SHADOW' && !shadowContext) {
      throw new Error('The shield step did not provide private night context.');
    }
    const shadowOptions =
      phaseBeforeChoice === 'SHADOW'
        ? shadowContext?.options.filter(
            (option) => option.name !== excludedShadowChoiceName,
          )
        : undefined;
    const displayedNames = await choices.evaluateAll((buttons) =>
      buttons.map(
        (button) =>
          button.querySelector('span')?.textContent?.trim() ??
          button.textContent?.trim() ??
          '',
      ),
    );
    const displayedNameSet = new Set(displayedNames);
    expect(displayedNames.length).toBeGreaterThan(0);
    expect(displayedNameSet.size).toBe(displayedNames.length);
    if (phaseBeforeChoice !== 'SHADOW') {
      expect(displayedNames).toEqual(
        [...displayedNames].sort((left, right) =>
          left.localeCompare(right, 'en', { sensitivity: 'base' }),
        ),
      );
    }
    const voteCandidates = new Set(roster.voteCandidates ?? []);
    const expectedNames = shadowOptions
      ? shadowOptions.map((option) => option.name)
      : roster.seats
          .filter(
            (seat) =>
              seat.status === 'alive' &&
              seat.id !== roster.viewerSeatId &&
              (voteCandidates.size === 0 || voteCandidates.has(seat.id)),
          )
          .map((seat) => seat.name);
    expect(
      displayedNameSet,
      `${phaseBeforeChoice} v${roster.version} candidates=${roster.voteCandidates?.length ?? 0}`,
    ).toEqual(new Set(expectedNames));
    for (const name of displayedNames) {
      expect(eligibleNames).toContain(name);
    }
    for (const seat of roster.seats.filter(
      (seat) => seat.id === roster.viewerSeatId || seat.status !== 'alive',
    )) {
      await expect(
        choiceList.getByRole('button', { name: seat.name, exact: true }),
      ).toHaveCount(0);
    }
    selectedName =
      phaseBeforeChoice === 'VOTE' && preferredVoteName
        ? preferredVoteName
        : displayedNames[0];
    if (phaseBeforeChoice === 'SHADOW') {
      await expect(page.getByTestId('vote-progress-list')).toHaveCount(0);
      await expect(page.locator('[data-testid^="vote-status-"]')).toHaveCount(
        0,
      );
      await expect(page.getByTestId('phase-progress-status')).toHaveCount(0);
      if (!shadowContext) {
        throw new Error(
          'The shield step did not provide private night context.',
        );
      }
      const viewerName = roster.seats.find(
        (seat) => seat.id === roster.viewerSeatId,
      )?.name;
      const fellowTraitors = new Set(
        shadowContext.teamNames.filter((name) => name !== viewerName),
      );
      for (const teammate of fellowTraitors) {
        expect(displayedNameSet.has(teammate)).toBe(true);
      }
      selectedName = displayedNames.find((name) => !fellowTraitors.has(name));
      if (!selectedName) {
        throw new Error('The private night list has no eligible target.');
      }
      nightAlternativeName = displayedNames.find(
        (name) => name !== selectedName && !fellowTraitors.has(name),
      );
    }
  }
  if (!selectedName) throw new Error('The choice list is empty.');
  const selectedChoice = choiceList.getByRole('button', {
    name: selectedName,
    exact: true,
  });
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
    await selectedChoice.evaluate((choice: HTMLButtonElement) =>
      choice.click(),
    );
    await page
      .getByRole('button', { name: 'Review this choice' })
      .evaluate((button: HTMLButtonElement) => button.click());
    await page
      .getByRole('button', { name: 'Confirm', exact: true })
      .evaluate((button: HTMLButtonElement) => button.click());

    const waiting = page.getByTestId('waiting-for-everyone');
    if (phaseBeforeChoice === 'SHADOW') {
      await expect(page.getByTestId('selected-choice')).toHaveText(
        `Your pick: ${selectedName}`,
      );
      await expect(selectedChoice).toBeEnabled();
      if (!nightAlternativeName) {
        throw new Error(
          'The private night list has no alternate eligible pick.',
        );
      }
      await expect(
        choiceList.getByRole('button', {
          name: nightAlternativeName,
          exact: true,
        }),
      ).toBeEnabled();
    }
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
      if (await waiting.isVisible().catch(() => false)) {
        if (phaseBeforeChoice === 'SHADOW') {
          await expect(waiting).toHaveText('Thanks. Waiting for everyone.');
          await expect(
            page
              .getByTestId('rehearsal-action-bar')
              .getByText('Thanks. Waiting for everyone.'),
          ).toHaveCount(0);
          await expect(page.getByTestId('phase-progress-status')).toHaveCount(
            0,
          );
        }
        return selectedName;
      }
      if ((await currentPhase(page)) !== phaseBeforeChoice) return selectedName;
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
  const phaseAtEntry = await currentPhase(page);
  if (phaseAtEntry !== phase) {
    throw new Error(
      `The rehearsal advanced from ${phase} to ${phaseAtEntry} before the player tapped Next step.`,
    );
  }
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
  if (
    phase === 'SHADOW' &&
    Number(
      await page.getByTestId('player-game').getAttribute('data-shadow-round'),
    ) !== shadowRoundAtStart
  )
    return;

  const phaseBeforeAdvance = await currentPhase(page);
  if (phaseBeforeAdvance !== phase) {
    throw new Error(
      `The rehearsal advanced from ${phase} to ${phaseBeforeAdvance} before the player tapped Next step.`,
    );
  }
  const versionAtStart = Number(
    await page.getByTestId('player-game').getAttribute('data-version'),
  );
  const advanceResponsePromise = page.waitForResponse(
    (response) => {
      const request = response.request();
      if (
        request.method() !== 'POST' ||
        !new URL(response.url()).pathname.endsWith('/commands')
      ) {
        return false;
      }
      try {
        return (
          (request.postDataJSON() as { type?: unknown }).type === 'AdvancePhase'
        );
      } catch {
        return false;
      }
    },
    { timeout: 15_000 },
  );
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  const advanceResponse = await advanceResponsePromise;
  expect(
    advanceResponse.ok(),
    `AdvancePhase returned HTTP ${advanceResponse.status()} for ${phase}.`,
  ).toBe(true);
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
  test.setTimeout(150_000);
  const wakeLockNotice =
    'Your screen may lock during play. Tap it to keep the game visible.';
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
  const privateHttpStatuses: string[] = [];
  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname;
    if (
      response.request().method() === 'POST' &&
      (pathname.endsWith('/commands') || pathname.endsWith('/private-view'))
    ) {
      let commandType = '';
      if (pathname.endsWith('/commands')) {
        try {
          const body = response.request().postDataJSON() as {
            type?: unknown;
            data?: { type?: unknown };
            command?: { type?: unknown };
          };
          const type = body.type ?? body.data?.type ?? body.command?.type;
          if (typeof type === 'string') commandType = `:${type}`;
        } catch {
          commandType = ':unparsed';
        }
      }
      privateHttpStatuses.push(
        `${pathname.endsWith('/private-view') ? 'private-view' : `command${commandType}`}:${response.status()}`,
      );
      if (privateHttpStatuses.length > 12) privateHttpStatuses.shift();
    }
  });
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
          .some((cookie) => cookie.trim().startsWith('oathstone-seat-'));
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
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: {
          request: () =>
            Promise.reject(new Error('Simulated wake-lock unavailability.')),
        },
      });
    });
    await page.goto('/play');
    captureAppDocumentLoads = true;
    await page.getByTestId('button-practise-alone').click();
    await expect(
      page.getByRole('heading', { name: 'Practise alone first' }),
    ).toBeVisible();
    await expect(page.getByTestId('text-rehearsal-player-count')).toHaveText(
      '8',
    );
    const players = page.getByTestId('input-rehearsal-player-count');
    await players.focus();
    await players.press('Home');
    await page.getByTestId('input-rehearsal-player-count').press('ArrowRight');
    await page.getByTestId('input-rehearsal-player-count').press('ArrowRight');
    await expect(page.getByTestId('text-rehearsal-player-count')).toHaveText(
      '8',
    );
    await page.getByTestId('input-rehearsal-name').fill('Morgan');
    await page.evaluate(() => {
      const fixedIds = [
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
      ];
      let nextId = 0;
      const cryptoObject = window.crypto;
      const nativeRandomUUID = cryptoObject.randomUUID.bind(cryptoObject);
      Object.defineProperty(cryptoObject, 'randomUUID', {
        configurable: true,
        value: () => fixedIds[nextId++] ?? nativeRandomUUID(),
      });
    });
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
      const errorBody = await rehearsalStartResponse.text();
      throw new Error(
        `Rehearsal start failed with HTTP ${rehearsalStartResponse.status()}: ${errorBody}`,
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
    const connectionStatus = page.getByRole('status', {
      name: 'Connection status',
    });
    await expect(connectionStatus).toHaveText('Online');
    await page.context().setOffline(true);
    await expect(connectionStatus).toHaveText('Reconnecting...', {
      timeout: 5_000,
    });
    await page.context().setOffline(false);
    await expect(connectionStatus).toHaveText('Online', { timeout: 15_000 });
    await expect(game).toHaveAttribute('data-version', /\d+/);
    await expect(game).toHaveAttribute('data-progress-total', '8');
    const initialProgressDone = Number(
      await game.getAttribute('data-progress-done'),
    );
    expect(initialProgressDone).toBeGreaterThanOrEqual(0);
    expect(initialProgressDone).toBeLessThanOrEqual(7);
    await expect
      .poll(async () => Number(await game.getAttribute('data-progress-done')), {
        timeout: 2_500,
      })
      .toBeGreaterThan(0);
    const seenShadowSlots = new Set<number>();
    const seenFirstNightShadowSlots = new Set<number>();
    const shadowContextByCycle = new Map<number, ShadowPrivateContext>();
    const shadowShieldCountByCycle = new Map<number, number>();
    const seenExplanations = new Set<Phase>();
    const checkedNoAutoAdvancePhases = new Set<Phase>();
    let previousLoopPhase: Phase | null = null;
    let previousVerdictRowCount = 0;
    let sawVoteRevealInCurrentVerdict = false;
    let sawVoteReveal = false;
    let sawVerdictResult = false;
    let sawForcedVoteTie = false;
    let submittedVoteToForceTie = false;
    let firstCycleInitialVoteSafe = false;
    let firstCycleRevoteSafe = false;
    let inspectFirstCycleRevoteAfterAdvance = false;
    let firstCycleRevoteExpectedBotVotes = 0;
    let firstCycleRevoteViewerSeatId = '';
    let firstCycleNightSafe = false;
    let sawHumanRemoved = false;
    let forcedHumanRemovalAfterSafety = false;
    let watchModeStarted = false;
    const watchModePhases = new Set<Phase>();
    const visitedPhases = new Set<Phase>();
    const seatStatusByPhase = new Map<Phase, string | null>();
    const seatStatusTimeline: string[] = [];
    let expectedTieCandidateIds: string[] = [];
    for (let step = 0; step < 80; step += 1) {
      const phase = await currentPhase(page);
      if (phase !== 'FINISHED' && phase !== 'ARCHIVED') {
        await expect(
          page
            .locator('.player-shell-header')
            .getByText(wakeLockNotice, { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText(wakeLockNotice, { exact: true }),
        ).toHaveCount(1);
      }
      await expect(page.locator('.game-shell')).toHaveAttribute(
        'data-game-theme',
        phase === 'SHADOW' || phase === 'LOBBY' || phase === 'DRAFT'
          ? 'night'
          : 'day',
      );
      visitedPhases.add(phase);
      const phaseStartedAt = Date.now();
      const ownSeat = await ownSeatStatus(page, activeGameId);
      const seatStatus = ownSeat.status;
      seatStatusByPhase.set(phase, seatStatus);
      seatStatusTimeline.push(
        `${phase}:${ownSeat.seatId ?? 'no-seat'}:${seatStatus ?? 'unknown'}`,
      );
      if (seatStatus && seatStatus !== 'alive') {
        sawHumanRemoved = true;
        watchModeStarted = true;
      }
      if (seatStatus && seatStatus !== 'alive') {
        await expect(page.getByTestId('player-fate')).toHaveText(
          phase === 'DAWN' && seatStatus === 'murdered'
            ? "You were taken in the night. You're out, but you can keep watching."
            : "You're out. You can watch, but you can't vote or choose.",
        );
      } else {
        await expect(page.getByTestId('player-fate')).toHaveCount(0);
      }
      if (seatStatus && seatStatus !== 'alive' && !firstCycleNightSafe) {
        const { readGameEvents } = await import('@workspace/db/game-store');
        const events = await readGameEvents(activeGameId);
        const recentVotes = events
          .filter(
            (event) =>
              event.type === 'VoteSubmitted' || event.type === 'VoteClosed',
          )
          .slice(-24);
        throw new Error(
          `The human was removed before completing the first night: ${JSON.stringify(recentVotes)}`,
        );
      }
      if (phase === 'FINISHED') {
        if (watchModeStarted) {
          const watchMessage = rehearsalWatchMessageByPhase[phase];
          if (!watchMessage)
            throw new Error(`Watch mode has no copy for phase ${phase}.`);
          await expect(
            page.getByTestId('rehearsal-watch-commentary'),
          ).toHaveText(watchMessage);
          watchModePhases.add(phase);
        }
        break;
      }
      if (phase === 'VERDICT' && previousLoopPhase !== 'VERDICT') {
        previousVerdictRowCount = 0;
        sawVoteRevealInCurrentVerdict = false;
      }
      previousLoopPhase = phase;
      const shadowCycleBefore =
        phase === 'SHADOW'
          ? (await latestServerPhase(page, activeGameId)).cycle
          : 0;
      const explanation = rehearsalExplanationByPhase[phase];
      if (!explanation) {
        throw new Error(`Rehearsal step ${phase} has no explanation copy.`);
      }
      if (seenExplanations.has(phase)) {
        await expect(page.getByTestId('rehearsal-explainer')).toBeHidden();
      } else {
        await expect(page.getByTestId('rehearsal-explanation-copy')).toHaveText(
          explanation,
        );
        await expect(
          page
            .getByTestId('rehearsal-explainer')
            .getByTestId('brand-footer-overlay'),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Got it' }).click();
        seenExplanations.add(phase);
      }
      if (watchModeStarted) {
        const watchMessage = rehearsalWatchMessageByPhase[phase];
        if (!watchMessage)
          throw new Error(`Watch mode has no copy for phase ${phase}.`);
        await expect(page.getByTestId('rehearsal-watch-commentary')).toHaveText(
          watchMessage,
        );
        await expect(
          page.getByRole('button', { name: 'Practise again', exact: true }),
        ).toBeVisible();
        watchModePhases.add(phase);
      }
      await expect(
        page.locator('header.public-shell-header .oathstone-wordmark'),
      ).toHaveCount(1);
      await expect(page.getByTestId('brand-footer-shell')).toContainText(
        'made by Stackstone Consulting',
      );
      if (['DEBATE', 'VERDICT', 'DAWN'].includes(phase)) {
        await expect(
          page.getByText(/players have completed this part/),
        ).toHaveCount(0);
      }
      if (phase === 'DEBATE') {
        const prompts = page.getByTestId('conversation-prompts');
        await expect(prompts).toBeVisible();
        await expect(prompts.getByRole('listitem')).toHaveCount(3);
      } else {
        await expect(page.getByTestId('conversation-prompts')).toHaveCount(0);
      }
      if (phase === 'VERDICT') {
        const revealRows = page.getByTestId('list-vote-reveal').locator('li');
        const votingCircle = page.getByTestId('voting-circle');
        if ((await votingCircle.count()) > 0 && seatStatus === 'alive') {
          const voteCard = page.getByTestId('vote-circle-card');
          const revealButton = page.getByRole('button', {
            name: 'I’ve said who I voted for and why',
            exact: true,
          });
          await expect(voteCard).toContainText('You voted for');
          await expect(revealButton).toBeVisible();

          const originalViewport = page.viewportSize();
          const voteCardLabel = voteCard.locator('span');
          const voteCardPlayer = voteCard.locator('strong');
          const cardLabelText = await voteCardLabel.innerText();
          const cardPlayerText = await voteCardPlayer.innerText();
          if (originalViewport) {
            await page.setViewportSize({ width: 390, height: 844 });
            await expect(voteCard).toBeVisible();
            await expect(voteCardLabel).toHaveText(cardLabelText);
            await expect(voteCardPlayer).toHaveText(cardPlayerText);
            await page.setViewportSize({ width: 844, height: 390 });
            await expect(voteCard).toBeVisible();
            await expect(voteCardLabel).toHaveText(cardLabelText);
            await expect(voteCardPlayer).toHaveText(cardPlayerText);
            await page.setViewportSize(originalViewport);
          }

          const revealedBefore = await revealRows.count();
          await revealButton.click();
          await expect
            .poll(() => revealRows.count(), { timeout: 10_000 })
            .toBeGreaterThan(revealedBefore);
          sawVoteRevealInCurrentVerdict = true;
          sawVoteReveal = true;
        }
        const revealedCount = await revealRows.count();
        expect(revealedCount).toBeGreaterThanOrEqual(previousVerdictRowCount);
        if (revealedCount > previousVerdictRowCount) {
          sawVoteRevealInCurrentVerdict = true;
          sawVoteReveal = true;
        }
        previousVerdictRowCount = revealedCount;
      }
      const announcement = page.getByTestId('shared-announcement');
      if ((await announcement.count()) > 0) {
        const announcementText = await announcement.textContent();
        if (announcementText?.includes(' has been banished.')) {
          await expect(announcement).toHaveText(
            /^.+ has been banished\. They were (Traitor|Faithful)\.$/,
          );
          expect(sawVoteRevealInCurrentVerdict).toBe(true);
          sawVerdictResult = true;
        }
      }
      if (!checkedNoAutoAdvancePhases.has(phase)) {
        await page.waitForTimeout(2_000);
        expect(
          await currentPhase(page),
          `Rehearsal phase ${phase} advanced without the player choosing Next step.`,
        ).toBe(phase);
        checkedNoAutoAdvancePhases.add(phase);
      }
      const shadowRoundBefore =
        phase === 'SHADOW'
          ? Number(await game.getAttribute('data-shadow-round'))
          : 0;
      const shadowSlotBefore =
        phase === 'SHADOW'
          ? Number(await game.getAttribute('data-shadow-slot'))
          : 0;
      if (!['DEAL', 'SHADOW'].includes(phase)) {
        await expect(
          page.getByRole('heading', {
            name: 'Shield your screen',
            exact: true,
          }),
        ).toHaveCount(0);
      }
      if (phase === 'SHADOW') {
        expect(
          shadowSlotBefore,
          'rehearsal should resolve one murder per night',
        ).toBe(1);
        seenShadowSlots.add(shadowSlotBefore);
        if (shadowCycleBefore === 1) {
          seenFirstNightShadowSlots.add(shadowSlotBefore);
        }
      }
      if (phase === 'DAWN') {
        const dawnView = await latestSynchronizedServerPhase(
          page,
          activeGameId,
        );
        if (dawnView.cycle === 1) {
          const { readGameEvents } = await import('@workspace/db/game-store');
          const events = await readGameEvents(activeGameId);
          const nightStart = events.findIndex(
            (event) =>
              event.type === 'PhaseChanged' &&
              event.phase === 'SHADOW' &&
              event.cycle === 1,
          );
          const dawnResolvedIndex = events.findIndex(
            (event, index) =>
              index > nightStart && event.type === 'DawnResolved',
          );
          const viewerSeatId = dawnView.viewerSeatId;
          const firstNightPicks = events
            .slice(nightStart + 1, dawnResolvedIndex)
            .filter((event) => event.type === 'ShadowSubmitted');
          expect(nightStart).toBeGreaterThanOrEqual(0);
          expect(dawnResolvedIndex).toBeGreaterThan(nightStart);
          expect(viewerSeatId).toBeTruthy();
          expect(firstNightPicks.length).toBeGreaterThan(0);
          expect(
            firstNightPicks.every(
              (event) =>
                event.type !== 'ShadowSubmitted' ||
                event.choice !== viewerSeatId,
            ),
          ).toBe(true);
          firstCycleNightSafe = true;
        }
      }
      let shadowContext: ShadowPrivateContext | null = null;
      if (phase === 'DEAL') {
        await handleShield(page, activeGameId);
        playerRole = await revealDealRole(page);
      } else if (['SHADOW', 'FINAL_VOTE'].includes(phase)) {
        if (seatStatus === 'alive') {
          if (
            phase === 'SHADOW' &&
            !shadowContextByCycle.has(shadowCycleBefore)
          ) {
            shadowContext = await handleShield(page, activeGameId);
            if (!shadowContext)
              throw new Error('The first night choice had no shield context.');
            shadowContextByCycle.set(shadowCycleBefore, shadowContext);
            shadowShieldCountByCycle.set(
              shadowCycleBefore,
              (shadowShieldCountByCycle.get(shadowCycleBefore) ?? 0) + 1,
            );
          } else if (phase === 'SHADOW') {
            await expect(
              page.getByRole('dialog', { name: 'Shield your screen' }),
            ).toHaveCount(0);
            expect(shadowShieldCountByCycle.get(shadowCycleBefore)).toBe(1);
            await expect(
              page.getByTestId('rehearsal-explanation-copy'),
            ).toHaveCount(0);
            shadowContext = shadowContextByCycle.get(shadowCycleBefore) ?? null;
          }
          if (phase === 'SHADOW') {
            shadowContext ??=
              shadowContextByCycle.get(shadowCycleBefore) ?? null;
            if (!shadowContext)
              throw new Error('The night choice has no private team context.');
            await expect(
              page.getByText(
                shadowContext.role === 'traitor'
                  ? 'Who will the Traitors take tonight?'
                  : 'Who do you think the Traitors will take tonight?',
                { exact: true },
              ),
            ).toBeVisible();
            const statusLines = page.getByTestId('shadow-status').locator('p');
            await expect(statusLines).toHaveCount(4);
            if (shadowContext.role === 'faithful') {
              await expect(statusLines.nth(0)).toContainText(
                /^(Your guess: .+|You haven't guessed yet)$/,
              );
              await expect(statusLines.nth(1)).toHaveText(
                'Guesses stay secret until the end.',
              );
              await expect(statusLines.nth(2)).toHaveText(
                'Think about who the Traitors fear most.',
              );
              await expect(statusLines.nth(3)).toHaveText(
                'You can change your guess until the night ends.',
              );
            } else {
              await expect(statusLines.nth(0)).toContainText(
                /^(You picked: .+|You haven't picked yet)$/,
              );
              await expect(statusLines.nth(3)).toContainText(
                /^(All agreed: .+|You can change your pick until the night ends\.)$/,
              );
            }
            try {
              await expect(page.getByTestId('shadow-slot-label')).toHaveText(
                shadowSlotBefore === 1 ? 'First choice' : 'Second choice',
              );
            } catch {
              const current = await latestServerPhase(page, activeGameId);
              const visibleText = (
                await page.locator('body').innerText()
              ).slice(0, 1200);
              throw new Error(
                `Night choice missing at cycle ${shadowCycleBefore}, slot ${shadowSlotBefore}, round ${shadowRoundBefore}; server phase=${current.phase}, cycle=${current.cycle}, progress=${JSON.stringify(current.progress)}; requests=${privateHttpStatuses.join(',')}; screen=${JSON.stringify(visibleText)}`,
              );
            }
          }
          await submitPrivateChoice(
            page,
            activeGameId,
            shadowContext,
            phase === 'FINAL_VOTE' ? 'Continue playing' : undefined,
          );
        } else {
          await expect(
            page.getByRole('dialog', { name: 'Shield your screen' }),
          ).not.toBeVisible();
          await expect(page.getByTestId('private-choice-list')).toHaveCount(0);
        }
      } else if (['VOTE', 'FINAL_BANISH'].includes(phase)) {
        if (seatStatus === 'alive') {
          const currentVoteView = await latestSynchronizedServerPhase(
            page,
            activeGameId,
          );
          if (
            firstCycleNightSafe &&
            (phase === 'FINAL_BANISH' ||
              (phase === 'VOTE' && currentVoteView.cycle > 1))
          ) {
            await expect
              .poll(
                async () =>
                  (await latestServerPhase(page, activeGameId)).progress.done,
                { timeout: 10_000 },
              )
              .toBe(currentVoteView.progress.total - 1);
            const finalBanishView = await latestSynchronizedServerPhase(
              page,
              activeGameId,
            );
            const { readGameEvents } = await import('@workspace/db/game-store');
            const events = await readGameEvents(activeGameId);
            const lastVoteClosedIndex = events.reduce(
              (lastIndex, event, index) =>
                event.type === 'VoteClosed' ? index : lastIndex,
              -1,
            );
            const botVotes = events
              .slice(lastVoteClosedIndex + 1)
              .filter((event) => event.type === 'VoteSubmitted')
              .filter((event) => event.seatId !== finalBanishView.viewerSeatId);
            expect(botVotes).toHaveLength(finalBanishView.progress.total - 1);
            expect(
              botVotes.every(
                (event) => event.target === finalBanishView.viewerSeatId,
              ),
            ).toBe(true);
            forcedHumanRemovalAfterSafety = true;
          }
          if (phase === 'VOTE' && !submittedVoteToForceTie) {
            const { readGameEvents } = await import('@workspace/db/game-store');
            await expect
              .poll(
                async () =>
                  (await latestServerPhase(page, activeGameId)).progress.done,
                { timeout: 10_000 },
              )
              .toBe(7);
            const voteView = await latestSynchronizedServerPhase(
              page,
              activeGameId,
            );
            expect(voteView.revote).toBe(false);
            const activeVoters = voteView.seats.filter(
              (seat) => seat.status === 'alive',
            );
            expect(voteView.votedSeatIds).toHaveLength(7);
            expect(voteView.ballots).toEqual({});
            for (const seat of activeVoters) {
              await expect(
                page.getByTestId(`vote-status-${seat.id}`),
              ).toHaveText(
                voteView.votedSeatIds.includes(seat.id) ? 'Voted' : 'Waiting',
              );
            }
            const events = await readGameEvents(activeGameId);
            const lastVoteClosedIndex = events.reduce(
              (lastIndex, event, index) =>
                event.type === 'VoteClosed' ? index : lastIndex,
              -1,
            );
            const botVotes = events
              .slice(lastVoteClosedIndex + 1)
              .filter((event) => event.type === 'VoteSubmitted')
              .filter((event) => event.seatId !== voteView.viewerSeatId);
            if (voteView.cycle === 1) {
              expect(
                botVotes.every((vote) => vote.target !== voteView.viewerSeatId),
                'bots must leave the human safe through the first full day',
              ).toBe(true);
              firstCycleInitialVoteSafe = true;
            }
            const voteCounts = new Map<string, number>();
            for (const vote of botVotes) {
              voteCounts.set(
                vote.target,
                (voteCounts.get(vote.target) ?? 0) + 1,
              );
            }
            const livingSeats = voteView.seats.filter(
              (seat) => seat.status === 'alive',
            );
            const candidates = livingSeats.filter(
              (seat) => seat.id !== voteView.viewerSeatId,
            );
            const highestCount = Math.max(
              ...livingSeats.map((seat) => voteCounts.get(seat.id) ?? 0),
            );
            const leadingSeats = livingSeats.filter(
              (seat) => (voteCounts.get(seat.id) ?? 0) === highestCount,
            );
            const voteToTie = candidates.find(
              (seat) => (voteCounts.get(seat.id) ?? 0) === highestCount - 1,
            );
            if (!voteToTie) {
              throw new Error(
                `The test-only first-vote pattern did not create a tie: ${JSON.stringify(
                  Object.fromEntries(
                    livingSeats.map((seat) => [
                      seat.name,
                      voteCounts.get(seat.id) ?? 0,
                    ]),
                  ),
                )}`,
              );
            }
            expectedTieCandidateIds = [
              ...leadingSeats.map((seat) => seat.id),
              voteToTie.id,
            ].sort();
            await submitPrivateChoice(page, activeGameId, null, voteToTie.name);
            submittedVoteToForceTie = true;
          } else if (phase === 'VOTE' && !sawForcedVoteTie) {
            const tieView = await latestSynchronizedServerPhase(
              page,
              activeGameId,
            );
            expect(tieView.revote).toBe(true);
            if (tieView.cycle === 1) {
              if (!tieView.viewerSeatId) {
                throw new Error('The re-vote view omitted the viewer seat.');
              }
              inspectFirstCycleRevoteAfterAdvance = true;
              firstCycleRevoteExpectedBotVotes = tieView.progress.total - 1;
              firstCycleRevoteViewerSeatId = tieView.viewerSeatId;
            }
            const tiedCandidateIds = tieView.voteCandidates;
            if (!tiedCandidateIds) {
              throw new Error(
                'The server did not include tied candidates for the re-vote.',
              );
            }
            expect([...tiedCandidateIds].sort()).toEqual(
              expectedTieCandidateIds,
            );
            const tiedNames = tiedCandidateIds
              .map(
                (seatId) =>
                  tieView.seats.find((seat) => seat.id === seatId)?.name,
              )
              .filter((name): name is string => Boolean(name))
              .sort((left, right) =>
                left.localeCompare(right, 'en-GB', { sensitivity: 'base' }),
              );
            const tiedNamesText =
              tiedNames.length === 2
                ? `${tiedNames[0]} and ${tiedNames[1]}`
                : `${tiedNames.slice(0, -1).join(', ')} and ${tiedNames[tiedNames.length - 1]}`;
            await expect(page.getByTestId('tie-revote-prompt')).toHaveText(
              `It's a tie between ${tiedNamesText}. Vote again, choosing between them.`,
            );
            sawForcedVoteTie = true;
            await submitPrivateChoice(page, activeGameId, null);
          } else {
            await submitPrivateChoice(page, activeGameId, null);
          }
        } else {
          await expect(
            page.getByRole('dialog', { name: 'Shield your screen' }),
          ).not.toBeVisible();
          await expect(page.getByTestId('private-choice-list')).toHaveCount(0);
        }
      }

      if (['VOTE', 'FINAL_BANISH'].includes(phase)) {
        await expect(page.getByTestId('phase-progress-status')).toHaveCount(0);
        try {
          await expect
            .poll(
              async () => {
                const latest = await latestServerPhase(page, activeGameId);
                return latest.phase === phase &&
                  latest.progress.total > 0 &&
                  latest.progress.done === latest.progress.total
                  ? latest.progress.done
                  : -1;
              },
              { timeout: 10_000 },
            )
            .toBeGreaterThan(0);
        } catch (error) {
          const latest = await latestServerPhase(page, activeGameId);
          const { readGameEvents } = await import('@workspace/db/game-store');
          const recentVotes = (await readGameEvents(activeGameId))
            .filter((event) =>
              ['VoteSubmitted', 'VoteClosed', 'SeatRemoved'].includes(
                event.type,
              ),
            )
            .slice(-16)
            .map((event) => ({
              type: event.type,
              ...('seatId' in event ? { seatId: event.seatId } : {}),
              ...('target' in event ? { target: event.target } : {}),
              ...('cycle' in event ? { cycle: event.cycle } : {}),
            }));
          throw new Error(
            `Vote progress stalled: expected phase ${phase}; server phase ${latest.phase}, cycle ${latest.cycle}, revote=${latest.revote}, progress=${latest.progress.done}/${latest.progress.total}, viewer=${latest.viewerSeatId}, voted=${latest.votedSeatIds.join(',')}, recent=${JSON.stringify(recentVotes)}, screen=${JSON.stringify((await page.locator('body').innerText()).slice(0, 800))}`,
            { cause: error },
          );
        }
        const completedVoteView = await latestSynchronizedServerPhase(
          page,
          activeGameId,
        );
        expect(completedVoteView.phase).toBe(phase);
        expect(completedVoteView.progress.total).toBeGreaterThan(0);
        expect(completedVoteView.progress.done).toBe(
          completedVoteView.progress.total,
        );
        expect(completedVoteView.votedSeatIds).toHaveLength(
          completedVoteView.progress.total,
        );
        await expect(page.getByTestId('waiting-for-everyone')).toHaveText(
          'Everyone has voted. Tap Next step to see the result.',
        );
      } else if (['DEAL', 'FINAL_VOTE'].includes(phase)) {
        const done = await game.getAttribute('data-progress-done');
        const total = await game.getAttribute('data-progress-total');
        await expect(
          page.getByText(`${done} of ${total} are ready`, { exact: true }),
        ).toBeVisible();
      } else if (phase === 'SHADOW') {
        await expect(
          page.getByText(/\d+ of \d+ are ready/, { exact: true }),
        ).toHaveCount(0);
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
      if (inspectFirstCycleRevoteAfterAdvance) {
        const { readGameEvents } = await import('@workspace/db/game-store');
        const events = await readGameEvents(activeGameId);
        const voteClosedIndices = events.flatMap((event, index) =>
          event.type === 'VoteClosed' ? [index] : [],
        );
        const firstClose = voteClosedIndices.at(-2);
        const secondClose = voteClosedIndices.at(-1);
        expect(firstClose).toBeDefined();
        expect(secondClose).toBeDefined();
        const botRevotes = events
          .slice(firstClose! + 1, secondClose)
          .filter((event) => event.type === 'VoteSubmitted')
          .filter((event) => event.seatId !== firstCycleRevoteViewerSeatId);
        expect(botRevotes).toHaveLength(firstCycleRevoteExpectedBotVotes);
        expect(
          botRevotes.every(
            (event) => event.target !== firstCycleRevoteViewerSeatId,
          ),
          'bots must leave the human safe during the first-cycle re-vote',
        ).toBe(true);
        firstCycleRevoteSafe = true;
        inspectFirstCycleRevoteAfterAdvance = false;
      }
      if (phase === 'SHADOW' && shadowRoundBefore === 1) {
        await expect(game).toHaveAttribute('data-shadow-round', '2');
      }
      if (phase === 'SHADOW' && shadowRoundBefore === 2) {
        const phaseAfterFirstSlot = await currentPhase(page);
        expect(['DAWN', 'FINISHED']).toContain(phaseAfterFirstSlot);
      }
      expect(appDocumentLoads).toBe(0);
    }

    expect(sawVoteReveal).toBe(true);
    expect(sawVerdictResult).toBe(true);
    expect(sawForcedVoteTie).toBe(true);
    expect(firstCycleInitialVoteSafe && firstCycleRevoteSafe).toBe(true);
    expect(firstCycleNightSafe).toBe(true);
    const { readGameEvents } = await import('@workspace/db/game-store');
    const finalTrace = (await readGameEvents(activeGameId))
      .filter((event) =>
        [
          'PhaseChanged',
          'VoteClosed',
          'SeatRemoved',
          'ShadowSubmitted',
          'MurderSlotResolved',
          'DawnResolved',
          'GameFinished',
        ].includes(event.type),
      )
      .slice(-50);
    expect(
      forcedHumanRemovalAfterSafety,
      `phases/status: ${seatStatusTimeline.join(', ')}; trace: ${JSON.stringify(finalTrace)}`,
    ).toBe(true);
    expect(sawHumanRemoved).toBe(true);
    const finalView = await latestServerPhase(page, activeGameId);
    expect(
      watchModePhases.has('SHADOW'),
      `viewer=${finalView.viewerSeatId ?? 'no-seat'}; phases/status: ${seatStatusTimeline.join(', ')}; trace: ${JSON.stringify(finalTrace)}`,
    ).toBe(true);
    const lastDawnIndex = finalTrace
      .map((event) => event.type)
      .lastIndexOf('DawnResolved');
    const lastFinishIndex = finalTrace
      .map((event) => event.type)
      .lastIndexOf('GameFinished');
    const terminalDawn = lastDawnIndex >= 0 && lastFinishIndex > lastDawnIndex;
    expect(
      watchModePhases.has('DAWN') || terminalDawn,
      `phases/status: ${seatStatusTimeline.join(', ')}; trace: ${JSON.stringify(finalTrace)}`,
    ).toBe(true);
    expect(watchModePhases.has('FINISHED')).toBe(true);
    expect([...seenShadowSlots].sort()).toEqual([1]);
    expect([...seenFirstNightShadowSlots].sort()).toEqual([1]);
    await expect(game).toHaveAttribute('data-phase', 'FINISHED', {
      timeout: 5_000,
    });
    await expect(page.getByTestId('rehearsal-explanation-copy')).toHaveText(
      rehearsalExplanationByPhase.FINISHED!,
    );
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.getByTestId('shared-announcement')).toContainText(/win/);
    await expect(page.getByTestId('rehearsal-watch-commentary')).toHaveText(
      rehearsalWatchMessageByPhase.FINISHED!,
    );
    expect((await ownSeatStatus(page, activeGameId)).status).not.toBe('alive');
    await expect(
      page.getByText(/players have completed this part/),
    ).toHaveCount(0);
    await expect(page.getByTestId('status-prize-pot')).toHaveCount(0);
    const murderSlotRecords = page.getByTestId('murder-slot-record');
    await expect
      .poll(() => murderSlotRecords.count(), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId('fairness-murder-slots')).toContainText(
      'First choice',
    );
    await expect(
      page.getByTestId('fairness-murder-slots').getByText('Second choice'),
    ).toHaveCount(0);
    expect(
      [...shadowShieldCountByCycle.values()].every((count) => count === 1),
    ).toBe(true);
    const firstNightRecords = murderSlotRecords.filter({
      hasText: 'Night 1',
    });
    await expect(firstNightRecords).toHaveCount(1);
    await expect(firstNightRecords.nth(0)).toContainText('First choice');

    const playerRows = page.locator('[data-testid^="player-seat-"]');
    await expect(playerRows).toHaveCount(8);
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
    const ownRoleLabel =
      playerRole === 'Traitor' ? 'a Traitor' : 'one of the Faithful';
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
    expect(updates).toMatch(/was taken in the night\.|No one was taken\./);
    expect(updates).toMatch(/The Traitors won|The Faithful won/);
    await expect(
      page.getByRole('button', { name: 'Practise again' }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole('button', { name: 'Back to start', exact: true }),
    ).toBeVisible({ timeout: 5_000 });
    await page.locator('.player-shell-header .oathstone-wordmark').click();
    await expect(
      page.getByRole('link', { name: 'Start a new game', exact: true }),
    ).toBeVisible();
    expect(appDocumentLoads).toBe(0);
    await page.goBack();
    await expect(page.getByTestId('rehearsal-explanation-copy')).toHaveText(
      rehearsalExplanationByPhase.FINISHED!,
    );
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.getByTestId('rehearsal-explainer')).toHaveCount(0);
    await expect(page.getByTestId('player-outcome')).toBeVisible();
    expect(appDocumentLoads).toBe(0);
    await page
      .getByRole('button', { name: 'Practise again' })
      .click({ timeout: 5_000 });
    await expect(page.getByTestId('button-start-rehearsal')).toBeVisible({
      timeout: 5_000,
    });
    captureAppDocumentLoads = false;
    await page.goto(`/game/${gameId}`);
    await expect(page.getByTestId('rehearsal-explanation-copy')).toHaveText(
      rehearsalExplanationByPhase.FINISHED!,
    );
    await page
      .getByRole('button', { name: 'Got it' })
      .click({ timeout: 5_000 });
    await expect(page.getByTestId('rehearsal-explainer')).toHaveCount(0);
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

test('a cold browser restart restores the existing seat from its stored token @rehearsal-live', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const { db } = await import('@workspace/db');
  let gameId: string | undefined;
  let coldContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;

  try {
    await page.goto('/play');
    await page.getByTestId('button-practise-alone').click();
    await page.getByTestId('input-rehearsal-name').fill('Cold restart');
    await page.getByTestId('button-speed-fast').click();
    const startResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/rehearsals' &&
        response.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await page.getByTestId('button-start-rehearsal').click();
    const startResult = await startResponse;
    expect(startResult.ok()).toBe(true);
    await page.waitForURL(/\/game\/[^/]+$/, { timeout: 15_000 });
    const match = new URL(page.url()).pathname.match(/\/game\/([^/]+)$/);
    gameId = match?.[1];
    if (!gameId) throw new Error('The restarted game id is missing.');

    await page
      .getByRole('button', { name: 'Got it', exact: true })
      .click({ timeout: 10_000 });
    const roleGuide = page.getByTestId('rehearsal-explainer');
    await expect(roleGuide).toBeVisible();
    await expect(
      roleGuide.getByRole('heading', { name: 'Your role' }),
    ).toBeVisible();
    await roleGuide.getByRole('button', { name: 'Got it' }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const state = window.history.state as { usr?: unknown } | null;
          return state?.usr ?? null;
        }),
      )
      .toBeNull();
    await expect(page.getByTestId('player-game')).toHaveAttribute(
      'data-phase',
      'DEAL',
    );
    await handleShield(page, gameId);
    const roleSeal = page.getByTestId('button-hold-reveal');
    const roleContent = page.getByTestId('private-role-content');
    await roleSeal.focus();
    await page.keyboard.down('Space');
    await expect(roleContent).toContainText(/Traitor|Faithful/);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(roleContent).toHaveCount(0);
    await expect(page.getByTestId('away-resync-overlay')).toBeVisible();
    await page.keyboard.up('Space');

    await page.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    const originalSeatId = await page.evaluate(async (id) => {
      const response = await fetch(
        `/api/games/${encodeURIComponent(id)}/view`,
        {
          cache: 'no-store',
          credentials: 'include',
        },
      );
      if (!response.ok)
        throw new Error('The original seat view was unavailable.');
      const payload = (await response.json()) as {
        view: { viewerSeatId?: string };
      };
      return payload.view.viewerSeatId;
    }, gameId);
    expect(originalSeatId).toBeTruthy();

    const savedBrowserState = await page.context().storageState();
    const seatCookie = savedBrowserState.cookies.find((cookie) =>
      cookie.name.startsWith('oathstone-seat-'),
    );
    expect(seatCookie).toBeDefined();
    expect(seatCookie?.expires).toBeGreaterThan(Math.floor(Date.now() / 1_000));
    expect(
      savedBrowserState.origins.some((originState) =>
        originState.localStorage.some(
          (entry) => entry.name === `oathstone-away-seq:${gameId}`,
        ),
      ),
    ).toBe(true);
    const savedAwayCursor = savedBrowserState.origins
      .flatMap((originState) => originState.localStorage)
      .find((entry) => entry.name === `oathstone-away-seq:${gameId}`);
    const savedAwaySnapshot = JSON.parse(savedAwayCursor?.value ?? 'null') as {
      lastPublicSeq?: unknown;
      showEmptyCard?: unknown;
    } | null;
    expect(savedAwaySnapshot).not.toBeNull();
    expect(typeof savedAwaySnapshot?.showEmptyCard).toBe('boolean');
    expect(
      savedAwaySnapshot?.lastPublicSeq === null ||
        Number.isSafeInteger(savedAwaySnapshot?.lastPublicSeq),
    ).toBe(true);

    const gameUrl = new URL(`/game/${gameId}`, page.url()).toString();
    await page.close();
    await page.context().close();
    coldContext = await browser.newContext({
      storageState: savedBrowserState,
    });
    const coldPage = await coldContext.newPage();
    await coldPage.goto(gameUrl);
    expect(
      await coldPage.evaluate(
        (id) => window.localStorage.getItem(`oathstone-away-seq:${id}`),
        gameId,
      ),
    ).toBe(savedAwayCursor?.value);
    expect(
      await coldPage.evaluate(() => {
        const state = window.history.state as {
          usr?: { showRehearsalStartGuide?: boolean };
        } | null;
        return state?.usr?.showRehearsalStartGuide === true;
      }),
    ).toBe(false);
    await expect(coldPage.getByTestId('player-game')).toHaveAttribute(
      'data-phase',
      'DEAL',
    );
    const restoredGuide = coldPage.getByTestId('rehearsal-explainer');
    await expect(restoredGuide).toHaveAttribute('data-guide-started', 'true');
    await expect(restoredGuide).toHaveAttribute('data-start-entry', 'false');
    await expect(restoredGuide).toHaveAttribute('data-guide-key', 'role');
    await expect(
      restoredGuide.getByRole('heading', { name: 'Your role' }),
    ).toBeVisible();
    await expect(coldPage.getByTestId('away-resync-overlay')).toHaveCount(0);
    await expect(coldPage.getByTestId('private-role-content')).toHaveCount(0);
    const restoredSeatId = await coldPage.evaluate(async (id) => {
      const response = await fetch(
        `/api/games/${encodeURIComponent(id)}/view`,
        {
          cache: 'no-store',
          credentials: 'include',
        },
      );
      if (!response.ok)
        throw new Error('The restored seat view was unavailable.');
      const payload = (await response.json()) as {
        view: { viewerSeatId?: string };
      };
      return payload.view.viewerSeatId;
    }, gameId);
    expect(restoredSeatId).toBe(originalSeatId);
  } finally {
    await coldContext?.close().catch(() => undefined);
    if (gameId) {
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
