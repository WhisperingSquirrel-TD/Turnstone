import { expect, test, type Page } from '@playwright/test';
import type { FullView } from '../lib/shared/src/contracts';
import { createPublicView } from './support/public-view';
import { installLiveSocketViewFixture } from './support/live-socket-view';

// D109: the round table agrees who holds the shield; the organiser records it.
async function openRoundTable(
  page: Page,
  gameId: string,
  extra: Partial<FullView>,
) {
  let view: FullView = {
    ...createPublicView(gameId),
    phase: 'DEBATE',
    missionsEnabled: false,
    shieldsPublic: true,
    ...extra,
  };
  const commands: Record<string, unknown>[] = [];
  const envelope = () => ({
    serverNow: Date.now(),
    version: view.version,
    view,
  });
  await installLiveSocketViewFixture(page, envelope);
  await page.route('**/api/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'test-csrf' } }),
  );
  // Registered first so the more specific command route below takes priority.
  await page.route(`**/api/games/${gameId}/**`, (route) =>
    route.fulfill({ json: envelope() }),
  );
  await page.route(`**/api/games/${gameId}/commands`, async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    commands.push(body);
    if (body.type === 'AllocatePower')
      view = {
        ...view,
        version: view.version + 1,
        shieldHolderIds: body.holders as string[],
      };
    await route.fulfill({ json: envelope() });
  });
  await page.goto(`/game/${gameId}?clips=off`);
  await expect(page.getByTestId('player-game')).toHaveAttribute(
    'data-phase',
    'DEBATE',
  );
  return commands;
}

test('the organiser records the round table’s shield choice for everyone to see', async ({
  page,
}) => {
  const commands = await openRoundTable(page, 'shield-organiser', {
    canAdvancePhase: true,
  });
  const panel = page.getByTestId('round-table-shield');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('radio', { name: 'Alex' })).toHaveCount(0);
  await panel.getByRole('radio', { name: 'Jamie' }).check();
  await panel.getByRole('button', { name: 'Give the shield to Jamie' }).click();
  await expect
    .poll(() => commands.map((entry) => entry.type))
    .toContain('AllocatePower');
  expect(
    commands.find((entry) => entry.type === 'AllocatePower'),
  ).toMatchObject({
    holders: ['seat-jamie'],
  });
  await expect(page.getByTestId('shield-holder')).toHaveText(
    'Jamie holds the shield until dawn.',
  );
});

test('players see the shield holder but cannot give the shield', async ({
  page,
}) => {
  await openRoundTable(page, 'shield-player', {
    canAdvancePhase: false,
    shieldHolderIds: ['seat-jamie'],
  });
  await expect(page.getByTestId('shield-holder')).toHaveText(
    'Jamie holds the shield until dawn.',
  );
  await expect(page.getByTestId('round-table-shield')).toHaveCount(0);
});

test('games without public shields show no shield controls', async ({
  page,
}) => {
  await openRoundTable(page, 'shield-off', {
    canAdvancePhase: true,
    shieldsPublic: false,
  });
  await expect(page.getByTestId('round-table-shield')).toHaveCount(0);
  await expect(page.getByTestId('shield-holder')).toHaveCount(0);
});
