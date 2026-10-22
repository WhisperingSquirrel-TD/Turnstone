import {
  devices,
  expect,
  test,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { mkdir, rm } from 'node:fs/promises';
import {
  buildVirtualPlayerScenario,
  playerScreenFingerprint,
  waitForPlayerScreenChange,
  type VirtualPlayer,
  type VirtualPlayerScenario,
} from './support/virtual-player-harness';

const playerNamePattern = /^Virtual Player \d{2}$/;
const reviewChoice = 'Review this choice';
const confirmChoice = 'Confirm';
const revealVote = 'I’ve said who I voted for and why';

function contextOptions(
  player: VirtualPlayer,
  videoDir: string,
): BrowserContextOptions {
  let options: BrowserContextOptions;
  if (player.profile === 'pixel') {
    const pixel = devices['Pixel 7'];
    options = {
      viewport: pixel.viewport,
      deviceScaleFactor: pixel.deviceScaleFactor,
      isMobile: pixel.isMobile,
      hasTouch: pixel.hasTouch,
      userAgent: pixel.userAgent,
    };
  } else {
    options = {
      viewport: { width: 1280, height: 800 },
      screen: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    };
  }
  return {
    ...options,
    recordVideo: {
      dir: videoDir,
      size:
        player.profile === 'pixel'
          ? { width: 360, height: 800 }
          : { width: 640, height: 400 },
    },
  };
}

async function visiblePhase(page: Page): Promise<string | null> {
  return page
    .getByTestId('player-game')
    .getAttribute('data-phase')
    .catch(() => null);
}

const coordinatorPhaseByLabel: Record<string, string> = {
  Setup: 'DRAFT',
  Lobby: 'LOBBY',
  'Role reveal': 'DEAL',
  Mission: 'MISSION',
  'The conversation': 'DEBATE',
  'The vote': 'VOTE',
  'The re-vote': 'VOTE',
  'The verdict': 'VERDICT',
  Night: 'SHADOW',
  Dawn: 'DAWN',
  'End or continue': 'ENDGAME',
  'Endgame vote': 'FINAL_VOTE',
  'Endgame verdict': 'FINAL_BANISH',
  'Game complete': 'FINISHED',
  'Archived game': 'ARCHIVED',
};

async function visibleCoordinatorPhase(page: Page): Promise<string | null> {
  const label = await page
    .getByTestId('coordinator-current-step')
    .textContent()
    .catch(() => null);
  return label ? (coordinatorPhaseByLabel[label.trim()] ?? null) : null;
}

async function waitForPlayersOnPhase(
  playerPages: Page[],
  phase: string,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const phases = await Promise.all(playerPages.map(visiblePhase));
        return phases.every((playerPhase) => playerPhase === phase);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
}

async function shouldAdvanceAsOrganiser(
  coordinatorPage: Page,
  playerPages: Page[],
  phase: string,
): Promise<boolean> {
  const currentStep = coordinatorPage.getByTestId('coordinator-current-step');
  await expect(currentStep).toBeVisible({ timeout: 20_000 });
  const coordinatorPhase = await visibleCoordinatorPhase(coordinatorPage);
  if (!coordinatorPhase)
    throw new Error('Coordinator step did not match a known game phase.');
  if (coordinatorPhase === phase) return true;
  await waitForPlayersOnPhase(playerPages, coordinatorPhase);
  return false;
}

async function waitForPhase(page: Page, phase: string): Promise<void> {
  await expect(page.getByTestId('player-game')).toHaveAttribute(
    'data-phase',
    phase,
    { timeout: 30_000 },
  );
}

async function approvePrivacy(page: Page): Promise<void> {
  const shieldDialog = page.getByRole('dialog', { name: 'Shield your screen' });
  const shield = page.getByRole('button', {
    name: 'I’m shielded',
    exact: true,
  });
  await expect(shieldDialog).toBeVisible({ timeout: 20_000 });
  await expect(shield).toBeEnabled({ timeout: 20_000 });
  await shield.click();
  await expect(shieldDialog).toBeHidden({ timeout: 20_000 });
}

async function waitForApprovedSeat(page: Page): Promise<void> {
  const deadline = Date.now() + 30_000;
  const gameUrl = /\/game\//;

  while (!gameUrl.test(page.url()) && Date.now() < deadline) {
    const checkAgain = page.getByRole('button', {
      name: 'Check again',
      exact: true,
    });
    const visible = await checkAgain.isVisible().catch(() => false);
    const enabled = visible
      ? await checkAgain.isEnabled().catch(() => false)
      : false;
    if (!visible || !enabled) {
      await page.waitForTimeout(100);
      continue;
    }
    await checkAgain.click();
    await page.waitForTimeout(250);
  }

  await expect(page).toHaveURL(gameUrl, { timeout: 1_000 });
}

async function revealRoleAndAcknowledge(
  page: Page,
): Promise<'Traitor' | 'Faithful'> {
  const seal = page.getByRole('button', {
    name: 'Hold the seal to see your role',
    exact: true,
  });
  await expect(seal).toBeVisible({ timeout: 20_000 });

  await seal.hover();
  await page.mouse.down();
  const roleHeading = page.getByRole('heading', {
    name: /^(Traitor|Faithful)$/,
  });
  await expect(roleHeading).toBeVisible({ timeout: 10_000 });
  const role = (await roleHeading.textContent())?.trim();
  if (role !== 'Traitor' && role !== 'Faithful')
    throw new Error('The role reveal did not contain a recognised role.');
  await page.mouse.up();
  await expect(roleHeading).toBeHidden();
  const done = page.getByRole('button', { name: 'Done', exact: true });
  await expect(done).toBeVisible();
  await done.click();
  await expect(done).toBeHidden({ timeout: 20_000 });
  return role;
}

async function chooseFirstVisiblePlayer(
  page: Page,
  testInfo: Parameters<typeof waitForPlayerScreenChange>[1],
  scenario: VirtualPlayerScenario,
  player: VirtualPlayer,
  preferredName?: string,
): Promise<boolean> {
  const choices = page.getByRole('button', { name: playerNamePattern });
  const buttons = await choices.all();
  let selected: (typeof buttons)[number] | undefined;
  if (preferredName) {
    const selfChoice = page.getByRole('button', {
      name: preferredName,
      exact: true,
    });
    await expect(selfChoice).toBeVisible();
    await expect(selfChoice).toBeEnabled();
    selected = selfChoice;
  }
  for (const button of buttons) {
    if (selected) break;
    if ((await button.innerText()).trim() === player.name) continue;
    if (
      (await button.isVisible().catch(() => false)) &&
      (await button.isEnabled().catch(() => false))
    ) {
      selected = button;
      break;
    }
  }
  if (!selected) return false;

  await selected.click();
  const review = page.getByRole('button', { name: reviewChoice, exact: true });
  await expect(review).toBeVisible({ timeout: 5_000 });
  await review.click();
  const confirm = page.getByRole('button', {
    name: confirmChoice,
    exact: true,
  });
  await expect(confirm).toBeVisible({ timeout: 5_000 });
  const beforeConfirm = await playerScreenFingerprint(page);
  await confirm.click();
  await waitForPlayerScreenChange(
    page,
    testInfo,
    scenario,
    player,
    beforeConfirm,
    { timeoutMs: 20_000 },
  );
  await expect(review).toBeHidden({ timeout: 2_000 });
  await expect(confirm).toBeHidden({ timeout: 2_000 });
  return true;
}

async function chooseToEndGame(
  page: Page,
  testInfo: Parameters<typeof waitForPlayerScreenChange>[1],
  scenario: VirtualPlayerScenario,
  player: VirtualPlayer,
): Promise<boolean> {
  const end = page.getByRole('button', { name: 'End the game', exact: true });
  if (!(await end.isVisible().catch(() => false))) return false;
  const before = await playerScreenFingerprint(page);
  await end.click();
  const review = page.getByRole('button', { name: reviewChoice, exact: true });
  await expect(review).toBeVisible({ timeout: 5_000 });
  await review.click();
  const confirm = page.getByRole('button', {
    name: confirmChoice,
    exact: true,
  });
  await expect(confirm).toBeVisible({ timeout: 5_000 });
  const beforeConfirm = await playerScreenFingerprint(page);
  await confirm.click();
  await waitForPlayerScreenChange(
    page,
    testInfo,
    scenario,
    player,
    beforeConfirm || before,
    { timeoutMs: 20_000 },
  );
  await expect(review).toBeHidden({ timeout: 2_000 });
  return true;
}

async function advanceAsOrganiser(
  coordinatorPage: Page,
  playerPages: Page[],
  scenario: VirtualPlayerScenario,
  phase: string,
  setActivePlayer: (player: VirtualPlayer) => void,
  allowUnfinished = false,
): Promise<void> {
  const currentPhase = await visibleCoordinatorPhase(coordinatorPage);
  if (!currentPhase)
    throw new Error('Coordinator step did not match a known game phase.');
  if (currentPhase !== phase) {
    await waitForPlayersOnPhase(playerPages, currentPhase);
    return;
  }
  const moveOn = coordinatorPage.getByRole('button', {
    name: 'Move everyone on',
    exact: true,
  });
  await expect(moveOn).toBeVisible({ timeout: 20_000 });
  if (phase === 'VOTE') {
    await expect(
      coordinatorPage.getByTestId('coordinator-progress'),
    ).toHaveText(/^(\d+) of \1 done$/, { timeout: 20_000 });
  }
  if (await moveOn.isDisabled()) {
    await expect(
      coordinatorPage.getByText(/^Move everyone on in \d+ seconds?\.$/),
    ).toBeVisible();
  }
  await expect
    .poll(
      async () => {
        const coordinatorPhase = await visibleCoordinatorPhase(coordinatorPage);
        if (coordinatorPhase !== phase) return 'phase-changed';
        return (await moveOn.isEnabled()) ? 'enabled' : 'waiting';
      },
      { timeout: 20_000 },
    )
    .not.toBe('waiting');
  const phaseAfterWait = await visibleCoordinatorPhase(coordinatorPage);
  if (!phaseAfterWait)
    throw new Error('Coordinator step did not match a known game phase.');
  if (phaseAfterWait !== phase) {
    await waitForPlayersOnPhase(playerPages, phaseAfterWait);
    return;
  }
  await moveOn.click();

  const moveAnyway = coordinatorPage.getByRole('button', {
    name: 'Move everyone on anyway',
    exact: true,
  });
  if (allowUnfinished) {
    const confirmationAppeared = await moveAnyway
      .waitFor({ state: 'visible', timeout: 1_000 })
      .then(
        () => true,
        () => false,
      );
    if (confirmationAppeared) await moveAnyway.click();
  } else {
    await expect(moveAnyway).toBeHidden({ timeout: 1_000 });
  }

  for (let index = 0; index < playerPages.length; index += 1) {
    const player = scenario.players[index]!;
    setActivePlayer(player);
    await expect(
      playerPages[index]!.getByTestId('player-game'),
    ).not.toHaveAttribute('data-phase', phase, { timeout: 20_000 });
  }
}

type PlayerDiagnostics = {
  pageErrors: string[];
  consoleErrors: string[];
  failedResponses: string[];
  failedRequests: string[];
};

function instrumentPageDiagnostics(
  page: Page,
  diagnostics: PlayerDiagnostics,
): void {
  page.on('pageerror', (pageError) => {
    if (diagnostics.pageErrors.length < 20)
      diagnostics.pageErrors.push(scrubDiagnosticText(pageError.message));
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && diagnostics.consoleErrors.length < 20)
      diagnostics.consoleErrors.push(scrubDiagnosticText(message.text()));
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && diagnostics.failedResponses.length < 20) {
      diagnostics.failedResponses.push(
        `${response.status()} ${response.request().method()} ${safeRequestPath(response.url())}`,
      );
    }
  });
  page.on('requestfailed', (request) => {
    if (diagnostics.failedRequests.length < 20) {
      const failureText = request.failure()?.errorText ?? 'unknown error';
      diagnostics.failedRequests.push(
        `${request.method()} ${safeRequestPath(request.url())}: ${scrubDiagnosticText(failureText)}`,
      );
    }
  });
}

function scrubDiagnosticText(value: string): string {
  return value
    .replace(/\b\d{4}\b/g, '[redacted]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted]');
}

function redactCaughtError(error: unknown): void {
  if (!(error instanceof Error)) return;
  error.message = scrubDiagnosticText(error.message);
  if (error.stack) error.stack = scrubDiagnosticText(error.stack);
}

function safeRequestPath(url: string): string {
  try {
    return new URL(url).pathname
      .replace(/(\/(?:api\/)?games\/)[^/]+/g, '$1:game')
      .replace(/(\/join\/)[^/]+/g, '$1:invite');
  } catch {
    return '[unavailable]';
  }
}

async function stopTrace(
  context: BrowserContext,
  activeTraces: Set<BrowserContext>,
  path?: string,
): Promise<boolean> {
  if (!activeTraces.has(context)) return false;
  try {
    if (path) {
      await context.tracing.stop({ path });
      return true;
    }
    await context.tracing.stop();
    return false;
  } finally {
    activeTraces.delete(context);
  }
}

async function attachFailureArtifacts({
  testInfo,
  scenario,
  player,
  page,
  contexts,
  activeTraces,
  diagnostics,
  error,
  phaseTrail,
}: {
  testInfo: TestInfo;
  scenario: VirtualPlayerScenario;
  player: VirtualPlayer;
  page: Page;
  contexts: BrowserContext[];
  activeTraces: Set<BrowserContext>;
  diagnostics: PlayerDiagnostics;
  error: unknown;
  phaseTrail: string[];
}): Promise<{ phase: string | null; errorMessage: string }> {
  const captureErrors: string[] = [];
  const phase =
    (await visiblePhase(page).catch(() => null)) ??
    (await visibleCoordinatorPhase(page).catch(() => null));
  const errorMessage = scrubDiagnosticText(
    error instanceof Error ? error.message : String(error),
  );
  const identity = `${player.id} (${player.profile}, ${player.persona})`;
  const baseName = `h1-${player.id}-failure`;
  const attachSafely = async (
    name: string,
    action: () => Promise<void>,
  ): Promise<void> => {
    try {
      await action();
    } catch (captureError) {
      captureErrors.push(
        `${name}: ${scrubDiagnosticText(
          captureError instanceof Error
            ? captureError.message
            : String(captureError),
        )}`,
      );
    }
  };

  await attachSafely(`${baseName}.png`, async () => {
    await testInfo.attach(`${baseName}.png`, {
      body: await page.screenshot({ timeout: 10_000 }),
      contentType: 'image/png',
    });
  });
  await attachSafely(`${baseName}.html`, async () => {
    await testInfo.attach(`${baseName}.html`, {
      body: await page.content(),
      contentType: 'text/html',
    });
  });

  const tracePath = testInfo.outputPath(`${baseName}-trace.zip`);
  let traceSaved = false;
  for (const context of contexts) {
    try {
      const saved = await stopTrace(
        context,
        activeTraces,
        context === page.context() ? tracePath : undefined,
      );
      if (saved) traceSaved = true;
    } catch (captureError) {
      captureErrors.push(
        `trace: ${scrubDiagnosticText(
          captureError instanceof Error
            ? captureError.message
            : String(captureError),
        )}`,
      );
    }
  }
  if (traceSaved) {
    await attachSafely(`${baseName}-trace.zip`, async () => {
      await testInfo.attach(`${baseName}-trace.zip`, {
        path: tracePath,
        contentType: 'application/zip',
      });
    });
  }

  const report = {
    stage: 'H1',
    seed: scenario.seed,
    scenario: `${scenario.playerCount} separate browser contexts`,
    player: {
      id: player.id,
      name: player.name,
      profile: player.profile,
      persona: player.persona,
      organiser: player.organiser,
    },
    phase,
    phases: phaseTrail,
    error: errorMessage,
    replayCommand: scenario.replayCommand,
    browserDiagnostics: diagnostics,
    captureErrors,
  };
  await attachSafely(`${baseName}.json`, async () => {
    await testInfo.attach(`${baseName}.json`, {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
  });
  await attachSafely(`${baseName}-summary.md`, async () => {
    await testInfo.attach(`${baseName}-summary.md`, {
      body: [
        '# Virtual-player H1 failure',
        '',
        `- Seed: ${scenario.seed}`,
        `- Scenario: ${scenario.playerCount} separate browser contexts`,
        `- Player: ${identity}`,
        `- Phase: ${phase ?? 'not available'}`,
        `- Cause: ${errorMessage}`,
        `- Failed responses: ${diagnostics.failedResponses.join('; ') || 'none'}`,
        `- Failed requests: ${diagnostics.failedRequests.join('; ') || 'none'}`,
        `- Replay: \`${scenario.replayCommand}\``,
      ].join('\n'),
      contentType: 'text/markdown',
    });
  });
  return { phase, errorMessage };
}

test('six virtual players complete a real game across desktop and phone contexts @virtual-player-h1', async ({
  browser,
}, testInfo) => {
  test.setTimeout(540_000);
  const seed = process.env.VIRTUAL_PLAYER_SEED ?? 'h1-seed-6001';
  const scenario = buildVirtualPlayerScenario(seed, 6);
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  const phaseTrail: string[] = [];
  const rolesByPlayer = new Map<string, 'Traitor' | 'Faithful'>();
  const activeTraces = new Set<BrowserContext>();
  const playerDiagnostics = new Map<string, PlayerDiagnostics>();
  const videoDir = testInfo.outputPath('virtual-player-videos');
  let activePlayer = scenario.players[0]!;
  let activePage: Page | null = null;

  try {
    await mkdir(videoDir, { recursive: true });
    for (const player of scenario.players) {
      activePlayer = player;
      const context = await browser.newContext(
        contextOptions(player, videoDir),
      );
      contexts.push(context);
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: false,
      });
      activeTraces.add(context);
      const page = await context.newPage();
      activePage = page;
      page.setDefaultTimeout(20_000);
      page.setDefaultNavigationTimeout(30_000);
      const diagnostics: PlayerDiagnostics = {
        pageErrors: [],
        consoleErrors: [],
        failedResponses: [],
        failedRequests: [],
      };
      playerDiagnostics.set(player.id, diagnostics);
      instrumentPageDiagnostics(page, diagnostics);
      pages.push(page);
    }

    const organiser = scenario.players[0]!;
    const organiserPage = pages[0]!;
    activePlayer = organiser;
    activePage = organiserPage;
    await organiserPage.goto('/');
    await organiserPage
      .getByRole('link', { name: 'Start a new game', exact: true })
      .click();
    await expect(
      organiserPage.getByRole('heading', { name: 'Name your game' }),
    ).toBeVisible();
    await organiserPage
      .getByRole('textbox', { name: 'Game name (optional)' })
      .fill(`Harness ${scenario.seed}`);
    await organiserPage
      .getByRole('button', { name: 'Continue', exact: true })
      .click();

    const fewerPlayers = organiserPage.getByRole('button', {
      name: 'Fewer players',
      exact: true,
    });
    for (let count = 15; count > scenario.playerCount; count -= 1) {
      await fewerPlayers.click();
    }
    await expect(
      organiserPage.getByTestId('text-create-player-count'),
    ).toHaveText(String(scenario.playerCount));
    await organiserPage
      .getByRole('button', { name: 'Continue', exact: true })
      .click();
    await organiserPage
      .getByRole('textbox', { name: 'Your first name' })
      .fill(organiser.name);
    await organiserPage
      .getByRole('textbox', { name: 'Choose a 4-digit PIN' })
      .fill('6284');
    const circleOption = organiserPage.getByRole('radio', {
      name: /Voting circle/i,
    });
    if (await circleOption.isVisible().catch(() => false))
      await circleOption.check();
    await organiserPage
      .getByRole('button', { name: 'Create game', exact: true })
      .click();
    await expect(organiserPage.getByTestId('text-lobby-code')).toBeVisible({
      timeout: 30_000,
    });
    const gameCode = (
      await organiserPage.getByTestId('text-lobby-code').innerText()
    ).trim();
    expect(gameCode).toMatch(/^[A-Z0-9]{6}$/);

    for (let index = 1; index < scenario.players.length; index += 1) {
      const player = scenario.players[index]!;
      const page = pages[index]!;
      activePlayer = player;
      activePage = page;
      await test.step(`join and approve ${player.id} (${player.persona})`, async () => {
        await page.goto('/');
        await page
          .getByRole('link', { name: 'Join a game', exact: true })
          .click();
        for (let digit = 0; digit < gameCode.length; digit += 1) {
          await page
            .getByRole('textbox', {
              name: `Game code character ${digit + 1}`,
            })
            .fill(gameCode[digit]!);
        }
        await page
          .getByRole('button', { name: 'Continue', exact: true })
          .click();
        await page
          .getByRole('textbox', { name: 'Your first name' })
          .fill(player.name);
        await page
          .getByRole('button', { name: 'Continue', exact: true })
          .click();
        await expect(
          page.getByRole('textbox', { name: '4-digit PIN' }),
        ).toBeVisible();
        await page
          .getByRole('textbox', { name: '4-digit PIN' })
          .fill(String(6285 + index).slice(-4));
        await page.getByRole('button', { name: 'Join', exact: true }).click();
        await expect(
          page.getByRole('button', { name: 'Check again', exact: true }),
        ).toBeVisible();

        const approve = organiserPage.getByRole('button', {
          name: 'Approve',
          exact: true,
        });
        await expect(
          organiserPage.getByText(player.name, { exact: true }),
        ).toBeVisible({
          timeout: 20_000,
        });
        await expect(approve).toBeVisible({ timeout: 10_000 });
        await approve.click();
        await expect(approve).toBeHidden({ timeout: 20_000 });
        await waitForApprovedSeat(page);
      });
    }

    await expect(
      organiserPage.getByRole('button', {
        name: 'Start the game',
        exact: true,
      }),
    ).toBeEnabled({ timeout: 20_000 });
    await organiserPage
      .getByRole('button', { name: 'Start the game', exact: true })
      .click();
    await expect(organiserPage).toHaveURL(/\/game\//, { timeout: 30_000 });
    for (let index = 0; index < pages.length; index += 1) {
      activePlayer = scenario.players[index]!;
      activePage = pages[index]!;
      await waitForPhase(pages[index]!, 'DEAL');
    }

    const gamePath = new URL(organiserPage.url()).pathname;
    const gameId = gamePath.split('/').filter(Boolean).at(-1);
    if (!gameId)
      throw new Error('Could not identify the game from its screen.');
    const coordinatorScreen = await contexts[0]!.newPage();
    activePage = coordinatorScreen;
    coordinatorScreen.setDefaultTimeout(20_000);
    coordinatorScreen.setDefaultNavigationTimeout(30_000);
    instrumentPageDiagnostics(
      coordinatorScreen,
      playerDiagnostics.get(organiser.id)!,
    );
    await coordinatorScreen.goto(`/coordinate/${encodeURIComponent(gameId)}`);
    await expect(
      coordinatorScreen.getByRole('button', {
        name: 'Move everyone on',
        exact: true,
      }),
    ).toBeVisible({ timeout: 30_000 });

    for (let step = 0; step < 40; step += 1) {
      activePlayer = organiser;
      activePage = organiserPage;
      const phase = await visiblePhase(organiserPage);
      if (!phase) throw new Error('Organiser game screen disappeared.');
      if (!phaseTrail.includes(phase)) phaseTrail.push(phase);
      const phaseObservedAt = Date.now();
      if (phase === 'FINISHED' || phase === 'ARCHIVED') break;

      if (phase === 'DEAL') {
        for (let index = 0; index < pages.length; index += 1) {
          const page = pages[index]!;
          activePlayer = scenario.players[index]!;
          await approvePrivacy(page);
          rolesByPlayer.set(
            scenario.players[index]!.id,
            await revealRoleAndAcknowledge(page),
          );
        }
        activePlayer = organiser;
        activePage = coordinatorScreen;
        if (await shouldAdvanceAsOrganiser(coordinatorScreen, pages, phase))
          await advanceAsOrganiser(
            coordinatorScreen,
            pages,
            scenario,
            phase,
            (player) => {
              activePlayer = player;
              activePage = pages[scenario.players.indexOf(player)]!;
            },
          );
      } else if (
        phase === 'VOTE' ||
        phase === 'FINAL_BANISH' ||
        phase === 'SHADOW' ||
        phase === 'FINAL_VOTE'
      ) {
        if (phase === 'VOTE') {
          const waitMessage = coordinatorScreen.getByTestId(
            'coordinator-minimum-wait',
          );
          const moveOn = coordinatorScreen.getByTestId(
            'button-coordinator-move-on',
          );
          if (await waitMessage.isVisible())
            await expect(moveOn).toBeDisabled();
          else await expect(moveOn).toBeEnabled();
        }
        if (phase === 'SHADOW') {
          for (let index = 0; index < pages.length; index += 1) {
            activePlayer = scenario.players[index]!;
            const page = pages[index]!;
            if (
              await page
                .getByTestId('player-fate')
                .isVisible()
                .catch(() => false)
            )
              continue;
            await approvePrivacy(page);
          }
        }
        for (let index = 0; index < pages.length; index += 1) {
          const page = pages[index]!;
          const player = scenario.players[index]!;
          activePlayer = player;
          activePage = page;
          if (
            await page
              .getByTestId('player-fate')
              .isVisible()
              .catch(() => false)
          )
            continue;
          if (phase === 'SHADOW') {
            const role = rolesByPlayer.get(player.id);
            if (!role)
              throw new Error(`No role was recorded for ${player.id}.`);
            await expect(
              page.getByText(
                role === 'Faithful'
                  ? 'Who do you think the Traitors will take tonight?'
                  : 'Who will the Traitors take tonight?',
                { exact: true },
              ),
            ).toBeVisible();
            const selfOption = page.getByRole('button', {
              name: player.name,
              exact: true,
            });
            await expect(selfOption).toBeVisible();
            await expect(selfOption).toBeEnabled();
          }
          if (phase === 'FINAL_VOTE') {
            expect(
              await chooseToEndGame(page, testInfo, scenario, player),
              `${player.id} could not submit their endgame choice.`,
            ).toBe(true);
          } else {
            expect(
              await chooseFirstVisiblePlayer(
                page,
                testInfo,
                scenario,
                player,
                phase === 'SHADOW' &&
                  rolesByPlayer.get(player.id) === 'Faithful'
                  ? player.name
                  : undefined,
              ),
              `${player.id} could not submit their choice during ${phase}.`,
            ).toBe(true);
          }
        }
        if (phase === 'VOTE' && Date.now() - phaseObservedAt < 4_000) {
          await expect(
            coordinatorScreen.getByTestId('coordinator-current-step'),
          ).toHaveText('The vote');
          const waitMessage = coordinatorScreen.getByTestId(
            'coordinator-minimum-wait',
          );
          const moveOn = coordinatorScreen.getByTestId(
            'button-coordinator-move-on',
          );
          if (await waitMessage.isVisible())
            await expect(moveOn).toBeDisabled();
          else await expect(moveOn).toBeEnabled();
        }
        activePlayer = organiser;
        activePage = coordinatorScreen;
        if (await shouldAdvanceAsOrganiser(coordinatorScreen, pages, phase))
          await advanceAsOrganiser(
            coordinatorScreen,
            pages,
            scenario,
            phase,
            (player) => {
              activePlayer = player;
              activePage = pages[scenario.players.indexOf(player)]!;
            },
          );
      } else if (phase === 'VERDICT') {
        const verdictResult = organiserPage.getByText(
          /No votes were cast\. Nobody is banished\.|has been banished\. They were (Traitor|Faithful)\./,
        );
        let revealCount = 0;
        const enabledRevealActions: {
          page: Page;
          button: ReturnType<Page['getByRole']>;
        }[] = [];
        while ((await visiblePhase(organiserPage)) === 'VERDICT') {
          if (revealCount >= scenario.playerCount) {
            await expect(verdictResult).toBeVisible({ timeout: 20_000 });
            enabledRevealActions.length = 0;
            for (const page of pages) {
              const button = page.getByRole('button', {
                name: revealVote,
                exact: true,
              });
              if (
                (await button.isVisible().catch(() => false)) &&
                (await button.isEnabled().catch(() => false))
              )
                enabledRevealActions.push({ page, button });
            }
            expect(enabledRevealActions).toHaveLength(0);
            break;
          }
          activePlayer = organiser;
          activePage = organiserPage;
          await expect
            .poll(
              async () => {
                enabledRevealActions.length = 0;
                if ((await visiblePhase(organiserPage)) !== 'VERDICT')
                  return -1;
                for (let index = 0; index < pages.length; index += 1) {
                  const page = pages[index]!;
                  const button = page.getByRole('button', {
                    name: revealVote,
                    exact: true,
                  });
                  if (
                    (await button.isVisible().catch(() => false)) &&
                    (await button.isEnabled().catch(() => false))
                  ) {
                    enabledRevealActions.push({ page, button });
                  }
                }
                if (enabledRevealActions.length === 0)
                  return (await verdictResult.isVisible().catch(() => false))
                    ? -1
                    : 0;
                return enabledRevealActions.length;
              },
              { timeout: 20_000 },
            )
            .not.toBe(0);
          if ((await visiblePhase(organiserPage)) !== 'VERDICT') break;
          if (enabledRevealActions.length === 0) {
            await expect(verdictResult).toBeVisible();
            break;
          }
          expect(enabledRevealActions).toHaveLength(1);
          const speaker = enabledRevealActions[0]!;
          activePlayer =
            scenario.players[pages.indexOf(speaker.page)] ?? organiser;
          activePage = speaker.page;
          await speaker.button.click();
          await expect(speaker.button).toBeHidden();
          revealCount += 1;
        }
        activePlayer = organiser;
        activePage = coordinatorScreen;
        if (await shouldAdvanceAsOrganiser(coordinatorScreen, pages, phase))
          await advanceAsOrganiser(
            coordinatorScreen,
            pages,
            scenario,
            phase,
            (player) => {
              activePlayer = player;
              activePage = pages[scenario.players.indexOf(player)]!;
            },
          );
      } else if (
        phase === 'DEBATE' ||
        phase === 'DAWN' ||
        phase === 'ENDGAME'
      ) {
        activePlayer = organiser;
        activePage = coordinatorScreen;
        await advanceAsOrganiser(
          coordinatorScreen,
          pages,
          scenario,
          phase,
          (player) => {
            activePlayer = player;
            activePage = pages[scenario.players.indexOf(player)]!;
          },
        );
      } else if (phase === 'MISSION') {
        // H1 checks the end-to-end phase watchdog. Mission behaviour is exercised
        // separately in H3, so use the coordinator's explicit "move anyway" flow.
        await advanceAsOrganiser(
          coordinatorScreen,
          pages,
          scenario,
          phase,
          (player) => {
            activePlayer = player;
            activePage = pages[scenario.players.indexOf(player)]!;
          },
          true,
        );
      } else {
        throw new Error(`H1 encountered unsupported phase ${phase}.`);
      }
    }

    await expect(organiserPage.getByTestId('player-game')).toHaveAttribute(
      'data-phase',
      'FINISHED',
      { timeout: 30_000 },
    );
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index]!;
      activePlayer = scenario.players[index]!;
      await expect(page.getByTestId('player-game')).toHaveAttribute(
        'data-phase',
        'FINISHED',
        { timeout: 30_000 },
      );
      await expect(
        page.getByRole('heading', { name: /The (Faithful|Traitors) win\./ }),
      ).toBeVisible();
    }

    const report = {
      stage: 'H1',
      seed: scenario.seed,
      playerCount: scenario.playerCount,
      players: scenario.players.map(
        ({ id, profile, persona, organiser: isOrganiser }) => ({
          id,
          profile,
          persona,
          organiser: isOrganiser,
        }),
      ),
      phases: phaseTrail,
      terminalPhase: 'FINISHED',
      result: 'public result visible on all six player screens',
      replayCommand: scenario.replayCommand,
    };
    await testInfo.attach('virtual-player-h1.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
    await testInfo.attach('virtual-player-h1-summary.md', {
      body: [
        '# Virtual-player H1',
        '',
        `- Seed: ${scenario.seed}`,
        `- Players: ${scenario.playerCount} (desktop and Pixel phone profiles, separate browser contexts)`,
        `- Phases reached: ${phaseTrail.join(', ')}`,
        '- Outcome: one public terminal result was visible on every player screen.',
        `- Replay: \`${scenario.replayCommand}\``,
      ].join('\n'),
      contentType: 'text/markdown',
    });
  } catch (error) {
    const player = activePlayer;
    const pageIndex = scenario.players.findIndex(
      (candidate) => candidate.id === player.id,
    );
    const page = activePage ?? pages[pageIndex] ?? pages[0];
    if (!page) {
      redactCaughtError(error);
      throw new Error(
        `H1 failure for seed ${scenario.seed}; player ${player.id} (${player.profile}, ${player.persona}); replay: ${scenario.replayCommand}`,
        { cause: error },
      );
    }
    const diagnostics = playerDiagnostics.get(player.id) ?? {
      pageErrors: [],
      consoleErrors: [],
      failedResponses: [],
      failedRequests: [],
    };
    const captured = await attachFailureArtifacts({
      testInfo,
      scenario,
      player,
      page,
      contexts,
      activeTraces,
      diagnostics,
      error,
      phaseTrail,
    });
    const video = page.video();
    await page.close().catch(() => undefined);
    if (video) {
      try {
        const videoPath = testInfo.outputPath(
          `h1-${player.id}-failure-video.webm`,
        );
        await video.saveAs(videoPath);
        await testInfo.attach(`h1-${player.id}-failure-video.webm`, {
          path: videoPath,
          contentType: 'video/webm',
        });
      } catch (captureError) {
        await testInfo
          .attach('h1-failure-video-capture.txt', {
            body: scrubDiagnosticText(
              captureError instanceof Error
                ? captureError.message
                : String(captureError),
            ),
            contentType: 'text/plain',
          })
          .catch(() => undefined);
      }
    }
    redactCaughtError(error);
    throw new Error(
      [
        `H1 failure for seed ${scenario.seed}`,
        `Scenario: ${scenario.playerCount} separate browser contexts`,
        `Player: ${player.id} (${player.profile}, ${player.persona})`,
        `Phase: ${captured.phase ?? 'not available'}`,
        `Cause: ${captured.errorMessage}`,
        `Replay: ${scenario.replayCommand}`,
      ].join('\n'),
      { cause: error },
    );
  } finally {
    await Promise.all(
      contexts.map(async (context) => {
        try {
          await stopTrace(context, activeTraces);
        } catch {
          // The original failure, if any, is more useful than cleanup errors.
        }
        try {
          await context.close();
        } catch (error) {
          if (
            error instanceof Error &&
            /(Failed to find context with id|Test ended\.)/.test(error.message)
          )
            return;
          throw error;
        }
      }),
    );
    await rm(videoDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
