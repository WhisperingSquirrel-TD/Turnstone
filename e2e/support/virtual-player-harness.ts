import type { Page, TestInfo } from '@playwright/test';

export type VirtualPlayerProfile = 'desktop' | 'pixel';
export type VirtualPlayerPersona = 'diligent';

export interface VirtualPlayer {
  id: string;
  name: string;
  persona: VirtualPlayerPersona;
  profile: VirtualPlayerProfile;
  organiser: boolean;
}

export interface VirtualPlayerScenario {
  seed: string;
  playerCount: number;
  players: VirtualPlayer[];
  replayCommand: string;
}

export type WatchdogObservation = 'waiting' | 'progressed' | 'stalled';

export function observeOrganiserAdvance(
  expectedStep: string,
  currentStep: string | null,
  enabled: boolean,
): 'step-changed' | 'enabled' | 'waiting' {
  if (currentStep === null) return 'waiting';
  if (currentStep !== expectedStep) return 'step-changed';
  return enabled ? 'enabled' : 'waiting';
}

export function playerStepIdentity(
  dataset: Readonly<Record<string, string | undefined>>,
): string | null {
  if (!dataset.phase) return null;
  if (dataset.phase !== 'SHADOW') return JSON.stringify([dataset.phase]);
  if (!dataset.shadowRound || !dataset.shadowSlot) return null;
  return JSON.stringify([
    dataset.phase,
    dataset.shadowRound,
    dataset.shadowSlot,
  ]);
}

export async function readPlayerStepIdentity(
  page: Page,
): Promise<string | null> {
  const dataset = await page.evaluate(() => {
    const game = document.querySelector<HTMLElement>(
      '[data-testid="player-game"]',
    );
    return { ...game?.dataset };
  });
  return playerStepIdentity(dataset);
}

export function createSeededRandom(seed: string | number): () => number {
  let state = 2166136261;
  for (const character of String(seed)) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  if (state === 0) state = 0x6d2b79f5;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function buildVirtualPlayerScenario(
  seed: string | number,
  playerCount: number,
): VirtualPlayerScenario {
  if (!Number.isInteger(playerCount))
    throw new Error('Virtual player count must be a whole number.');
  if (playerCount < 5 || playerCount > 40)
    throw new Error('Virtual player count must be between 5 and 40.');

  const normalizedSeed = String(seed);
  if (!/^[A-Za-z0-9_-]+$/.test(normalizedSeed))
    throw new Error(
      'Virtual player seed may contain letters, numbers, _ and - only.',
    );

  const rehearsalProfile = process.env.REHEARSAL_PROFILE ?? 'Pixel';
  const random = createSeededRandom(normalizedSeed);
  const profiles: VirtualPlayerProfile[] = [
    'desktop',
    'pixel',
    ...Array.from({ length: playerCount - 2 }, () =>
      random() < 0.5 ? 'desktop' : 'pixel',
    ),
  ];
  const players = profiles.map((profile, index) => ({
    id: `virtual-seat-${String(index + 1).padStart(2, '0')}`,
    name: `Virtual Player ${String(index + 1).padStart(2, '0')}`,
    persona: 'diligent' as const,
    profile,
    organiser: index === 0,
  }));

  return {
    seed: normalizedSeed,
    playerCount,
    players,
    replayCommand: `VIRTUAL_PLAYER_SEED=${normalizedSeed} REHEARSAL_PROFILE=${rehearsalProfile} bash scripts/browser-runtime.sh pnpm exec playwright test --config=playwright.rehearsal.config.ts --grep @virtual-player-h1 --timeout=540000`,
  };
}

export function createProgressWatchdog(
  initialFingerprint: string,
  timeoutMs: number,
  startedAt: number,
): { observe(fingerprint: string, now: number): WatchdogObservation } {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error('Progress watchdog timeout must be positive.');

  let lastFingerprint = initialFingerprint;
  let lastProgressAt = startedAt;

  return {
    observe(fingerprint, now) {
      if (fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint;
        lastProgressAt = now;
        return 'progressed';
      }
      return now - lastProgressAt >= timeoutMs ? 'stalled' : 'waiting';
    },
  };
}

export async function playerScreenFingerprint(page: Page): Promise<string> {
  return page.evaluate(() => {
    const game = document.querySelector<HTMLElement>(
      '[data-testid="player-game"]',
    );
    const bodyText = document.body.innerText;
    const source = [
      location.pathname,
      game?.dataset.phase ?? '',
      game?.dataset.version ?? '',
      bodyText,
    ].join('\n');
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  });
}

export async function waitForPlayerScreenChange(
  page: Page,
  testInfo: TestInfo,
  scenario: VirtualPlayerScenario,
  player: VirtualPlayer,
  previousFingerprint: string,
  options: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const pollIntervalMs = options.pollIntervalMs ?? 100;
  const startedAt = Date.now();
  const watchdog = createProgressWatchdog(
    previousFingerprint,
    timeoutMs,
    startedAt,
  );

  while (Date.now() - startedAt < timeoutMs) {
    await page.waitForTimeout(pollIntervalMs);
    const fingerprint = await playerScreenFingerprint(page);
    const observation = watchdog.observe(fingerprint, Date.now());
    if (observation === 'progressed') return fingerprint;
  }

  const [screenshot, dom] = await Promise.all([
    page.screenshot({ timeout: 5_000 }),
    page.content(),
  ]);
  await testInfo.attach(`${player.id}-stalled-screen.png`, {
    body: screenshot,
    contentType: 'image/png',
  });
  await testInfo.attach(`${player.id}-stalled-dom.html`, {
    body: dom,
    contentType: 'text/html',
  });
  throw new Error(
    [
      'Virtual-player progress watchdog timed out.',
      `Seed: ${scenario.seed}`,
      `Scenario: ${scenario.playerCount} players`,
      `Player: ${player.name} (${player.persona}, ${player.profile})`,
      `Replay: ${scenario.replayCommand}`,
    ].join('\n'),
  );
}
