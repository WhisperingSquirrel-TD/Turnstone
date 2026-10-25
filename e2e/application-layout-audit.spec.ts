import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createPublicView } from './support/public-view';
import { installLiveSocketViewFixture } from './support/live-socket-view';
import {
  auditApplicationLayout,
  type LayoutFinding,
} from './support/layout-audit';
import type { FullView } from '../lib/shared/src/contracts';

const widths = [320, 360, 390, 430] as const;
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

for (const width of widths)
  for (const palette of ['day', 'night'] as const) {
    test(`full application layout audit ${width} ${palette}`, async ({
      page,
    }, info) => {
      test.setTimeout(120_000);
      await page.setViewportSize({
        width,
        height: width === 320 ? 640 : width === 360 ? 740 : 844,
      });
      await page.emulateMedia({
        reducedMotion: 'reduce',
        colorScheme: palette === 'night' ? 'dark' : 'light',
      });
      await page.clock.install();
      const gameId = 'layout-audit-room';
      let role: 'faithful' | 'traitor' = 'faithful';
      let view = createPublicView(gameId);
      const envelope = () => ({
        serverNow: Date.now(),
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
        coverage.push(name);
        findings.push(...(await auditApplicationLayout(page, name)));
        if (
          process.env.R7_AUDIT_CAPTURE === '1' &&
          info.project.name === 'Pixel' &&
          (!process.env.R7_AUDIT_STATES ||
            process.env.R7_AUDIT_STATES.split(',').includes(name))
        ) {
          await mkdir('docs/screens/round-7-audit', { recursive: true });
          const image = await page.screenshot({
            path: `docs/screens/round-7-audit/${name}-${width}-${palette}.jpg`,
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
      }
      async function go(path: string, heading?: string) {
        await page.goto(path);
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
          await page.clock.fastForward(6_000);
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
      await audit('entry');
      await page.keyboard.press('Tab');
      await audit('entry-keyboard-focus');
      await page.keyboard.press('Tab');
      await page.locator('header details').first().locator('summary').click();
      await audit('entry-menu');
      await page.locator('header details').first().locator('summary').click();
      await go('/join');
      await audit('join-empty');
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
      await go('/play?entry=create');
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
      await go('/play?entry=rehearsal');
      await audit('practice-empty');
      await page.getByTestId('input-rehearsal-name').fill('Morgan');
      await audit('practice-ready');
      view = {
        ...view,
        phase: 'LOBBY',
        seats: createPublicView(gameId).seats.slice(0, 2),
        publicAnnouncement: null,
        winner: null,
      };
      await go(`/coordinate/${gameId}?players=6`);
      await expect(page.getByTestId('text-lobby-code')).toBeVisible();
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
      await audit('lobby-organiser');

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
            await page.clock.fastForward(1_200);
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
      await room('VERDICT', {
        publicAnnouncement: { kind: 'no_votes', cycle: 2 },
      });
      await audit('verdict-no-banishment');
      await room('FINISHED', {
        winner: 'traitor',
        publicAnnouncement: { kind: 'finished', winner: 'traitor' },
      });
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
      await page.clock.fastForward(300);
      await expect(page.locator('main')).toContainText(
        /could|can[’']t|cannot|unavailable|not found|problem|check|error/i,
      );
      await expect(page.locator('body')).not.toContainText(
        'Opening your private screen',
      );
      await audit('game-error');
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
