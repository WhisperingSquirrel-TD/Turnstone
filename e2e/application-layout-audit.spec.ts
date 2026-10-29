import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type TestInfo } from '@playwright/test';
import { createPublicView } from './support/public-view';
import { installLiveSocketViewFixture } from './support/live-socket-view';
import {
  auditApplicationLayout,
  auditFocusAndBorders,
  type LayoutFinding,
} from './support/layout-audit';
import type { FullView } from '../lib/shared/src/contracts';
import { addDays, ukCalendarDate } from '../lib/shared/src/game-end-date';

const widths = [320, 360, 390, 430] as const;
// D117: real games carry a last day; the Lobby and finale state the deletion day.
const auditEndDate = addDays(ukCalendarDate(Date.now()), 3);
const phases = [
  'LOBBY',
  'DEAL',
  'MISSION',
  'DEBATE',
  'VOTE',
  'VERDICT',
  'SHADOW',
  'DAWN',
  'ENDGAME',
  'FINAL_VOTE',
  'FINAL_BANISH',
  'FINISHED',
] as const;

type AuditDiagnostics = {
  completed: { scene: string; stage: string; durationMs: number }[];
  active: { scene: string; stage: string; startedAtMs: number } | null;
};

const auditDiagnostics = new WeakMap<TestInfo, AuditDiagnostics>();

test.afterEach(async ({ browserName, page }, info) => {
  const diagnostics = auditDiagnostics.get(info);
  auditDiagnostics.delete(info);
  if (info.status === info.expectedStatus) return;
  if (!diagnostics) return;
  // Identify what blocks the next interaction by test IDs and classes only;
  // never log page text, which can include a held role.
  const pageState = await page
    .evaluate(() => {
      const describe = (element: Element | null) =>
        element
          ? [
              element.tagName.toLowerCase(),
              element.getAttribute('data-testid'),
              element.getAttribute('role'),
              element.className && typeof element.className === 'string'
                ? element.className.split(/\s+/).slice(0, 3).join('.')
                : null,
            ]
              .filter(Boolean)
              .join('|')
          : null;
      const topAt = (selector: string) => {
        const target = document.querySelector(selector);
        if (!target) return { selector, present: false };
        const box = target.getBoundingClientRect();
        const hit = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        );
        return {
          selector,
          present: true,
          box: [box.left, box.top, box.width, box.height].map(Math.round),
          hit: describe(hit),
          covered: hit !== null && hit !== target && !target.contains(hit),
        };
      };
      return {
        path: location.pathname,
        // Window focus/visibility events re-arm the DEAL shield; record them.
        windowEvents: (
          (window as unknown as { __auditWindowEvents?: string[] })
            .__auditWindowEvents ?? []
        ).slice(-12),
        phase:
          document
            .querySelector('[data-testid="player-game"]')
            ?.getAttribute('data-phase') ?? null,
        openDialogs: Array.from(
          document.querySelectorAll('dialog[open], [role="dialog"]'),
        ).map(describe),
        activeElement: describe(document.activeElement),
        targets: [
          '[data-testid="game-help-disclosure"] summary',
          '[role="tab"]',
          '[data-testid="button-hold-reveal"]',
        ].map(topAt),
      };
    })
    .catch((error: unknown) => ({ unavailable: String(error) }));
  const completedStageCounts = diagnostics.completed.reduce<
    Record<string, number>
  >((counts, entry) => {
    counts[entry.stage] = (counts[entry.stage] ?? 0) + 1;
    return counts;
  }, {});
  const summary = {
    browser: browserName,
    lastCompleted: diagnostics.completed.at(-1) ?? null,
    active: diagnostics.active
      ? {
          scene: diagnostics.active.scene,
          stage: diagnostics.active.stage,
          elapsedMs: Date.now() - diagnostics.active.startedAtMs,
        }
      : null,
    completedStageCounts,
    pageState,
  };
  console.log(`layout-audit-failure ${JSON.stringify(summary)}`);
  await info.attach('layout-audit-timing.json', {
    contentType: 'application/json',
    body: JSON.stringify(
      {
        completed: diagnostics.completed,
        ...summary,
      },
      null,
      2,
    ),
  });
});

for (const width of widths)
  for (const palette of ['day', 'night'] as const) {
    test(`full application layout audit ${width} ${palette}`, async ({
      page,
    }, info) => {
      test.setTimeout(120_000);
      const diagnostics: AuditDiagnostics = { completed: [], active: null };
      auditDiagnostics.set(info, diagnostics);
      await page.setViewportSize({
        width,
        height: width === 320 ? 640 : width === 360 ? 740 : 844,
      });
      await page.emulateMedia({
        reducedMotion: 'reduce',
        colorScheme: palette === 'night' ? 'dark' : 'light',
      });
      await page.clock.install();
      await page.addInitScript(() => {
        const events: string[] = [];
        (
          window as unknown as { __auditWindowEvents?: string[] }
        ).__auditWindowEvents = events;
        const started = performance.now();
        for (const type of ['blur', 'focus', 'pagehide', 'pageshow'])
          window.addEventListener(type, () =>
            events.push(`${type}@${Math.round(performance.now() - started)}`),
          );
        document.addEventListener('visibilitychange', () =>
          events.push(
            `visibility:${document.visibilityState}@${Math.round(performance.now() - started)}`,
          ),
        );
      });
      // The fixture server's clock advances with the page clock, as a real
      // server's would; otherwise every view resets the client clock offset.
      let clockAdvanceMs = 0;
      const fastForward = async (ms: number) => {
        clockAdvanceMs += ms;
        await page.clock.fastForward(ms);
      };
      const gameId = 'layout-audit-room';
      let role: 'faithful' | 'traitor' = 'faithful';
      let privateAvailable = true;
      let view = createPublicView(gameId);
      const envelope = () => ({
        serverNow: Date.now() + clockAdvanceMs,
        version: view.version,
        view,
      });
      await installLiveSocketViewFixture(page, envelope);
      await page.route('**/api/csrf', (route) =>
        route.fulfill({ json: { csrfToken: 'test-csrf' } }),
      );
      await page.route('**/api/join/name-check', (route) =>
        route.fulfill({ json: { status: 'available' } }),
      );
      await page.route('**/api/join', (route) =>
        route.fulfill({
          json: { requestId: 'audit-pending', status: 'pending' },
        }),
      );
      await page.route('**/api/join-requests/audit-pending', (route) =>
        route.fulfill({ json: { status: 'pending' } }),
      );
      await page.route(`**/api/games/${gameId}/**`, async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/join-requests'))
          return route.fulfill({ json: { requests: [] } });
        if (path.endsWith('/coordinator/delegates'))
          return route.fulfill({ json: { limit: 1, seatIds: [] } });
        if (path.endsWith('/coordinator/presence'))
          return route.fulfill({ json: { status: 'online' } });
        if (path.endsWith('/invites'))
          return route.fulfill({
            json: {
              gameId,
              shortCode: 'ABC234',
              joinUrl: `https://oathstone.test/join/${gameId}#${'i'.repeat(43)}`,
            },
          });
        if (path.endsWith('/private-view') && !privateAvailable)
          return route.fulfill({ json: envelope() });
        if (path.endsWith('/private-view'))
          return route.fulfill({
            json: {
              ...envelope(),
              view: {
                ...view,
                private: {
                  role,
                  team: [],
                  options: view.seats
                    .filter((s) => s.status === 'alive')
                    .map(({ id, name }) => ({ id, name })),
                  choices: {},
                  choiceSlots: [],
                  chat: [],
                  task: null,
                  minimumDurationMs: 0,
                },
              },
            },
          });
        return route.fulfill({ json: envelope() });
      });
      const findings: LayoutFinding[] = [];
      const coverage: string[] = [];
      async function audit(name: string) {
        if (name.startsWith('shadow') || name.startsWith('night-'))
          await expect(
            page.locator('.game-shell'),
            'owner regression: every night state is dark',
          ).toHaveAttribute('data-game-theme', 'night');
        coverage.push(name);
        diagnostics.active = {
          scene: name,
          stage: 'layout',
          startedAtMs: Date.now(),
        };
        const layoutStartedAt = Date.now();
        findings.push(...(await auditApplicationLayout(page, name)));
        diagnostics.completed.push({
          scene: name,
          stage: 'layout',
          durationMs: Date.now() - layoutStartedAt,
        });
        diagnostics.active = null;
        if (
          process.env.R7_AUDIT_CAPTURE === '1' &&
          info.project.name === 'Pixel' &&
          (!process.env.R7_AUDIT_STATES ||
            process.env.R7_AUDIT_STATES.split(',').includes(name))
        ) {
          const captureDir =
            process.env.R7_AUDIT_DIR ?? 'docs/screens/round-7-audit';
          await mkdir(captureDir, { recursive: true });
          const image = await page.screenshot({
            path: `${captureDir}/${name}-${width}-${palette}.jpg`,
            type: 'jpeg',
            quality: 40,
            fullPage: true,
          });
          if (name === 'lobby-organiser' || name === 'lobby') {
            await writeFile(
              `docs/screens/round-7-audit/${name}-${width}-${palette === 'day' ? 'light' : 'dark'}.jpg`,
              image,
            );
          }
        }
        diagnostics.active = {
          scene: name,
          stage: 'focus-and-borders',
          startedAtMs: Date.now(),
        };
        const focusStartedAt = Date.now();
        findings.push(...(await auditFocusAndBorders(page, name)));
        diagnostics.completed.push({
          scene: name,
          stage: 'focus-and-borders',
          durationMs: Date.now() - focusStartedAt,
        });
        diagnostics.active = null;
      }
      async function go(path: string, heading?: string) {
        await page.goto(path);
        await expect(
          page.locator('.entry-experience'),
          'Wait for the hydrated entry experience, not the SSR first-paint fallback.',
        ).toBeVisible({ timeout: 30_000 });
        await expect(
          page.locator('main h1, [data-testid="player-game"] h1').first(),
        ).toBeVisible();
        if (heading)
          await expect(
            page.getByRole('heading', { name: heading, exact: true }),
          ).toBeVisible();
      }
      async function dismissShield() {
        const shield = page.getByRole('dialog', { name: 'Shield your screen' });
        if (await shield.isVisible()) {
          await fastForward(6_000);
          await shield.getByRole('button', { name: 'I’m shielded' }).click();
        }
      }
      async function room(
        phase: FullView['phase'],
        extra: Partial<FullView> = {},
      ) {
        view = {
          ...createPublicView(gameId),
          phase,
          deadline: null,
          missionsEnabled: false,
          shadowSlot: phase === 'SHADOW' ? 1 : 0,
          canAdvancePhase: phase !== 'LOBBY' && phase !== 'FINISHED',
          seats: [
            'Morgan',
            'Alex',
            'Jamie',
            'Sam',
            'Drew',
            'Blair',
            'Taylor',
            'Robin',
          ].map((name, index) => ({
            id: `seat-${name.toLowerCase()}`,
            name,
            status: index === 1 ? ('banished' as const) : ('alive' as const),
            ...(phase === 'FINISHED'
              ? {
                  role:
                    index === 1 ? ('traitor' as const) : ('faithful' as const),
                }
              : {}),
          })),
          ...(phase === 'VERDICT'
            ? {
                publicAnnouncement: {
                  kind: 'verdict' as const,
                  cycle: 2,
                  seat: {
                    id: 'seat-alex',
                    name: 'Alex',
                    role: 'traitor' as const,
                  },
                },
              }
            : {}),
          ...(phase === 'DAWN'
            ? {
                publicAnnouncement: {
                  kind: 'dawn' as const,
                  cycle: 2,
                  victims: [],
                },
              }
            : {}),
          ...(phase === 'FINISHED'
            ? {
                winner: 'faithful' as const,
                publicAnnouncement: {
                  kind: 'finished' as const,
                  winner: 'faithful' as const,
                },
              }
            : {}),
          ...extra,
        };
        await page.goto(`/game/${gameId}?clips=off`);
        await expect(page.getByTestId('player-game')).toHaveAttribute(
          'data-phase',
          phase,
        );
        await expect(page.locator('.game-connection-state')).toHaveAttribute(
          'aria-label',
          'Connection status: Live',
        );
      }
      // Establish a real UI display preference; forms deliberately retain their paper look.
      await room('DEBATE');
      await page.getByTestId('game-status-menu').locator('summary').click();
      await page
        .getByTestId('game-status-menu')
        .getByRole('button', {
          name: new RegExp(`^${palette === 'night' ? 'Dark' : 'Light'}`),
        })
        .click();
      await page.getByTestId('game-status-menu').locator('summary').click();
      await go('/');
      await expect(page.locator('.entry-welcome .entry-display')).toBeVisible();
      await expect(page.getByTestId('button-create-game')).toBeVisible();
      await audit('entry');
      await page.keyboard.press('Tab');
      await audit('entry-keyboard-focus');
      await page.keyboard.press('Tab');
      await page.locator('header details').first().locator('summary').click();
      await audit('entry-menu');
      await page.locator('header details').first().locator('summary').click();
      // Owner phone test (28 October 2026): Back from Join returns to start.
      await page.getByTestId('button-join-game').click();
      await expect(page.getByTestId('input-join-name')).toBeVisible();
      await page.getByTestId('button-back-top').click();
      await expect(page.getByTestId('button-create-game')).toBeVisible();
      await audit('start-after-join-back');
      await go('/join');
      await expect(page.getByTestId('input-join-name')).toBeVisible();
      await audit('join-empty');
      await page.getByTestId('input-join-code-1').focus();
      await audit('join-code-focus');
      await page.getByTestId('input-join-name').fill('Morgan');
      for (let i = 0; i < 6; i++)
        await page.getByTestId(`input-join-code-${i + 1}`).fill('ABC234'[i]!);
      await audit('join-ready');
      await page.getByTestId('entry-primary-dock-button').click();
      await expect(page.getByTestId('input-join-pin')).toBeVisible();
      await audit('join-pin');
      await page.getByTestId('input-join-pin').fill('1234');
      await audit('join-pin-ready');
      await page.getByTestId('button-submit-join').click();
      await expect(page).toHaveURL(/join-request/);
      await expect(
        page.getByRole('heading', { name: /Waiting/ }),
      ).toBeVisible();
      await audit('join-waiting-approval');
      await go('/?entry=create', 'Name your game');
      await expect(page.getByTestId('input-game-name')).toBeVisible();
      await expect(
        page.getByTestId('button-continue-create-name'),
      ).toBeVisible();
      await audit('create-name');
      await page.getByTestId('button-continue-create-name').click();
      await audit('create-count');
      await page.getByTestId('button-continue-player-count').click();
      await audit('create-checkbox-unchecked');
      await page.getByTestId('toggle-presenter').check();
      await audit('create-checkbox-checked');
      await page.getByTestId('input-organiser-name').fill('Morgan');
      await page.getByTestId('input-organiser-pin').fill('1234');
      await audit('create-complete');
      await go('/?entry=rehearsal', 'Practise alone first');
      await expect(page.getByTestId('input-rehearsal-name')).toBeVisible();
      await audit('practice-empty');
      await page.getByTestId('input-rehearsal-name').fill('Morgan');
      await audit('practice-ready');
      view = {
        ...view,
        phase: 'LOBBY',
        gameEndDate: auditEndDate,
        seats: createPublicView(gameId)
          .seats.filter((seat) => seat.status === 'alive')
          .slice(0, 1),
        publicLog: [],
        publicAnnouncement: null,
        winner: null,
      };
      await go(`/coordinate/${gameId}`);
      await expect(page.getByTestId('text-lobby-code')).toBeVisible();
      await expect(page.getByText('1 joined', { exact: true })).toBeVisible();
      await expect(
        page.getByText('Waiting for 4 more players.', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Your game lobby', exact: true }),
      ).toHaveCount(1);
      await expect(page.getByTestId('coordinator-current-step')).toHaveCount(0);
      await expect(page.getByTestId('coordinator-time-left')).toHaveCount(0);
      await expect(page.getByTestId('coordinator-progress')).toHaveCount(0);
      await expect(page.getByTestId('list-lobby-players')).toHaveCount(0);
      await expect(
        page.getByTestId('coordinator-console').locator('details[open]'),
      ).toHaveCount(0);
      await expect(
        page.getByText(
          'Co-coordinators could not be saved. Check the connection and try again.',
          { exact: true },
        ),
      ).toHaveCount(0);
      const invitationBottom = await page
        .getByTestId('button-share-game')
        .evaluate((el) => el.getBoundingClientRect().bottom);
      const rosterTop = await page
        .getByTestId('coordinator-seats')
        .evaluate((el) => el.getBoundingClientRect().top);
      expect(invitationBottom).toBeLessThan(rosterTop);
      // The invite action must be reachable in less than two main-screen lengths.
      expect(
        await page.getByTestId('button-share-game').evaluate((el) => {
          const main = el.closest('main')!;
          return (
            el.getBoundingClientRect().bottom -
              main.getBoundingClientRect().top <
            main.clientHeight * 2
          );
        }),
      ).toBe(true);
      if (width === 360 || width === 390) {
        const firstView = await page.evaluate(() => {
          const main = document.querySelector('#entry-main')!;
          const viewport = main.getBoundingClientRect();
          return {
            scrollTop: main.scrollTop,
            viewport: { top: viewport.top, bottom: viewport.bottom },
            items: ['text-lobby-code', 'img-lobby-qr', 'button-share-game'].map(
              (id) => {
                const box = document
                  .querySelector(`[data-testid="${id}"]`)!
                  .getBoundingClientRect();
                return {
                  id,
                  top: box.top,
                  bottom: box.bottom,
                  width: box.width,
                  height: box.height,
                };
              },
            ),
          };
        });
        expect(firstView.scrollTop).toBe(0);
        for (const item of firstView.items) {
          expect(item.top, JSON.stringify(firstView)).toBeGreaterThanOrEqual(
            firstView.viewport.top,
          );
          expect(item.bottom, JSON.stringify(firstView)).toBeLessThanOrEqual(
            firstView.viewport.bottom - 8,
          );
        }
        const qr = firstView.items.find((item) => item.id === 'img-lobby-qr')!;
        expect(qr.width).toBeGreaterThanOrEqual(200);
        expect(qr.width).toBeLessThanOrEqual(220);
        expect(qr.height).toBe(qr.width);
      }
      await audit('lobby-organiser');
      await page.getByTestId('button-change-end-date').click();
      await expect(page.getByTestId('button-save-end-date')).toBeVisible();
      await audit('lobby-change-end-date');
      await page.getByTestId('button-cancel-end-date').click();

      for (const phase of phases) {
        await room(phase);
        if (phase === 'DEAL' || phase === 'SHADOW') {
          await audit(`${phase.toLowerCase()}-shield`);
          await dismissShield();
        }
        await audit(phase.toLowerCase());
        if (phase === 'DEAL') {
          const hold = page.getByTestId('button-hold-reveal');
          await expect(hold).toBeVisible();
          {
            const box = await hold.boundingBox();
            await page.mouse.move(
              box!.x + box!.width / 2,
              box!.y + box!.height / 2,
            );
            await page.mouse.down();
            await fastForward(1_200);
            await audit('deal-held');
            await page.mouse.up();
            await audit('deal-released');
          }
        }
        const help = page.getByTestId('game-help-disclosure');
        if (await help.isVisible()) {
          await help.locator('summary').click();
          await audit(`${phase.toLowerCase()}-help`);
          await help.locator('summary').click();
        }
        if (phase === 'DEBATE') {
          await page
            .getByRole('button', { name: 'Notes', exact: true })
            .click();
          await expect(page.getByTestId('private-notes-content')).toBeVisible();
          await audit('notes-sheet');
          await page.getByRole('textbox').fill('Fixture note');
          await audit('notes-sheet-with-draft');
          await page.getByRole('button', { name: 'Done', exact: true }).click();
          privateAvailable = false;
          await page
            .getByTestId('game-status-bar')
            .getByRole('button', { name: 'Notes', exact: true })
            .click();
          await expect(
            page
              .getByTestId('private-screen-recovery')
              .getByRole('button', { name: 'Try again', exact: true }),
          ).toBeEnabled();
          await audit('notes-sheet-recovery');
          await page.getByRole('button', { name: 'Done', exact: true }).click();
          privateAvailable = true;
          await page.getByTestId('game-status-menu').locator('summary').click();
          await audit('game-menu-display');
          await page.getByTestId('game-status-menu').locator('summary').click();
        }
        if (phase === 'VOTE' || phase === 'SHADOW') {
          const target = page.getByRole('button', { name: /Jamie/ }).first();
          if (await target.isVisible()) {
            await target.click();
            await audit(`${phase.toLowerCase()}-selected`);
            await page.getByRole('button', { name: /Review this/ }).click();
            await audit(`${phase.toLowerCase()}-review`);
          }
        }
        await page.getByRole('tab', { name: 'Players', exact: true }).click();
        await audit(`${phase.toLowerCase()}-players`);
        await page.getByRole('tab', { name: 'Game', exact: true }).click();
      }
      await room('VOTE', {
        revote: true,
        voteCandidates: ['seat-jamie', 'seat-sam'],
      });
      await audit('revote');
      await page.getByTestId('game-help-disclosure').locator('summary').click();
      await audit('revote-help');
      // D109 round-table shield: organiser choice, selection and public holder.
      await room('DEBATE', { shieldsPublic: true });
      await expect(page.getByTestId('round-table-shield')).toBeVisible();
      await audit('debate-shield-choice');
      const shieldChoice = page
        .getByTestId('round-table-shield')
        .getByRole('radio', { name: 'Jamie' });
      // Act as the organiser's phone would: no keyboard focus is left over
      // from the audit's focus pass (leaving the skip link once shifted the
      // page by 44px mid-tap; e2e/skip-link-focus.spec.ts now guards that),
      // and scroll the row clear of the fixed organiser bar, which D105
      // permits when it is reachable after scrolling.
      await page.evaluate(() =>
        (document.activeElement as HTMLElement | null)?.blur(),
      );
      await shieldChoice.evaluate((element) =>
        element.scrollIntoView({ block: 'center' }),
      );
      await shieldChoice.check();
      await audit('debate-shield-selected');
      await room('DEBATE', {
        shieldsPublic: true,
        shieldHolderIds: ['seat-jamie'],
      });
      await expect(page.getByTestId('shield-holder')).toBeVisible();
      await audit('debate-shield-holder');
      await room('VERDICT', {
        publicAnnouncement: { kind: 'no_votes', cycle: 2 },
      });
      await audit('verdict-no-banishment');
      // D120: Contenders on a draw and organiser timing notices.
      await room('CONTENDERS', {
        revote: true,
        voteCandidates: ['seat-jamie', 'seat-sam'],
        organiserNotice: { kind: 'added_time', minutes: 15, seq: 40 },
      });
      await expect(page.getByTestId('contenders-list')).toBeVisible();
      await expect(page.getByTestId('organiser-notice')).toHaveText(
        'The organiser has added 15 minutes.',
      );
      await audit('contenders');
      await room('VOTE', {
        revote: true,
        voteCandidates: ['seat-jamie', 'seat-sam'],
        organiserNotice: { kind: 'moved_on', seq: 41 },
      });
      await expect(page.getByTestId('organiser-notice')).toHaveText(
        'The organiser has moved the table on.',
      );
      await audit('revote-after-contenders');
      await room('VERDICT', {
        publicAnnouncement: {
          kind: 'verdict',
          cycle: 2,
          seat: { id: 'seat-jamie', name: 'Jamie', role: 'faithful' },
          chosenAtRandom: true,
        },
        ballots: {
          'seat-morgan': 'seat-jamie',
          'seat-sam': 'seat-jamie',
          'seat-jamie': 'seat-sam',
          'seat-drew': 'seat-sam',
        },
      });
      await expect(page.getByTestId('verdict-random')).toBeVisible();
      await audit('verdict-random');
      await room('FINISHED', {
        winner: 'traitor',
        publicAnnouncement: { kind: 'finished', winner: 'traitor' },
        gameEndDate: auditEndDate,
      });
      await expect(page.getByTestId('end-date-notice')).toBeVisible();
      await audit('finished-other-public-result');
      await room('FINISHED', { rehearsal: true });
      await audit('practice-finale');
      role = 'traitor';
      await room('SHADOW');
      await dismissShield();
      await audit('night-other-private-role');
      await room('SHADOW', { shadowSlot: 2, murderSlots: 2, shadowRound: 1 });
      await dismissShield();
      await audit('night-second-choice');
      await room('DEAL');
      await dismissShield();
      await audit('deal-other-private-role');
      // Real error route, rather than a separate hand-built error mock.
      await page.route('**/api/games/audit-missing/**', (route) =>
        route.fulfill({
          status: 404,
          json: { error: { code: 'NOT_FOUND', message: 'Game not found' } },
        }),
      );
      const missingResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/api/games/audit-missing/view') &&
          response.status() === 404,
      );
      await page.goto('/game/audit-missing?clips=off');
      await missingResponse;
      await fastForward(300);
      await expect(page.locator('main')).toContainText(
        /could|can[’']t|cannot|unavailable|not found|problem|check|error/i,
      );
      await expect(page.locator('body')).not.toContainText(
        'Opening your private screen',
      );
      await audit('game-error');
      await page.route('**/api/games/audit-cleared/**', (route) =>
        route.fulfill({
          status: 410,
          json: { error: 'This game has ended and been cleared.' },
        }),
      );
      await page.goto('/game/audit-cleared?clips=off');
      await expect(page.getByTestId('game-cleared')).toBeVisible();
      await audit('game-cleared');
      await mkdir('generated-artifacts/layout-audit', { recursive: true });
      await writeFile(
        `generated-artifacts/layout-audit/${info.project.name}-${width}-${palette}.json`,
        JSON.stringify(
          { project: info.project.name, width, palette, coverage, findings },
          null,
          2,
        ),
      );
      expect(
        findings,
        `Layout findings are anonymous selectors; inventory: ${coverage.join(', ')}`,
      ).toEqual([]);
    });
  }
