import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';
import {
  EntryExperience,
  type EntryExperienceErrors,
  type EntryExperienceInputs,
} from './EntryExperience';
import { en } from './locale/en-GB';
import { previewShareWarning } from './lobby-code-url';

const shellCSS = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
const entryCSS = readFileSync(
  new URL('./EntryExperience.css', import.meta.url),
  'utf8',
);

const inputs: EntryExperienceInputs = {
  joinCodeEntry: '',
  joinName: '',
  joinPin: '',
  createGameName: '',
  createEndDate: '2026-10-28',
  createPlayerCount: 15,
  createCoCoordinatorCount: 0,
  organiserName: '',
  organiserPin: '',
  rehearsalPlayerCount: 8,
  rehearsalSpeed: 'fast',
  rehearsalName: '',
};

it('keeps the room code and shows the plain preview warning only in the organiser lobby', () => {
  const warning = previewShareWarning('https://private.replit.dev', '');
  expect(warning).not.toBeNull();
  const lobby = renderEntry('lobby', 'day', {}, {}, warning);
  expect(lobby).toContain('data-testid="preview-share-warning"');
  expect(lobby).toContain(warning);
  expect(lobby).not.toContain(en.entry.shareUnavailable);
  expect(lobby).toContain('ABC234');
  expect(renderEntry('join-code', 'day', {}, {}, warning)).not.toContain(
    warning,
  );
  expect(renderEntry('lobby')).not.toContain('preview-share-warning');
});

it('compiles the public environment setting into the browser bundle and validates it in Vite', async () => {
  const { transformWithEsbuild } = await import('vite');
  const source = readFileSync(
    new URL('./lobby-code-url.ts', import.meta.url),
    'utf8',
  );
  const transformed = await transformWithEsbuild(source, 'lobby-code-url.ts', {
    define: { 'import.meta.env.PUBLIC_BASE_URL': '"https://public.example/"' },
  });
  expect(transformed.code).toContain(
    'const configuredPublicBaseUrl = "https://public.example/";',
  );
  const vite = readFileSync(
    new URL('../vite.config.ts', import.meta.url),
    'utf8',
  );
  expect(vite).toContain('validatePublicBaseUrl(process.env.PUBLIC_BASE_URL)');
});

function renderEntry(
  screen: 'join-code' | 'lobby' | 'join-wait' | 'rehearsal-setup',
  gameTheme: 'day' | 'night' = 'day',
  errors: EntryExperienceErrors = {},
  inputOverrides: Partial<EntryExperienceInputs> = {},
  previewWarning?: string | null,
  coordinatorPanel?: ReactNode,
) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <EntryExperience
        copy={{
          ...en.entry,
          brand: 'Oathstone',
          brandGoldSuffix: 'stone',
        }}
        gameTheme={gameTheme}
        screen={screen}
        inputs={{ ...inputs, ...inputOverrides }}
        errors={errors}
        onInputChange={vi.fn()}
        options={{
          tapToReveal: false,
          largeText: false,
          simpleLanguage: false,
        }}
        onOptionChange={vi.fn()}
        busy={{
          join: false,
          create: false,
          approveJoinerIds: [],
          startGame: false,
          rehearsal: false,
          share: false,
        }}
        organiserDisplayName="the organiser"
        defaultGameName="Oathstone game"
        joinCode="ABC234"
        shareUrl=""
        qrCode={null}
        previewWarning={previewWarning}
        coordinatorPanel={coordinatorPanel}
        players={[
          { id: 'seat-ada', name: 'Ada' },
          { id: 'seat-sam', name: 'Sam' },
        ]}
        requiredPlayerCount={6}
        pendingJoiners={[]}
        onJoin={vi.fn()}
        onCheckJoinName={vi.fn().mockResolvedValue('available')}
        onRecover={vi.fn()}
        onCheckJoinStatus={vi.fn()}
        onCreate={vi.fn()}
        onApproveJoiner={vi.fn()}
        onStartGame={vi.fn()}
        onRehearsal={vi.fn()}
        onShare={vi.fn()}
        onClearSensitiveValues={vi.fn()}
      />
    </MemoryRouter>,
  );
}

it('puts invitations before the organiser controls and renders only their single roster', () => {
  const html = renderEntry(
    'lobby',
    'day',
    {},
    {},
    null,
    <section data-testid="coordinator-console">
      <h2>Players</h2>
    </section>,
  );
  expect(html.indexOf('text-lobby-code')).toBeLessThan(
    html.indexOf('coordinator-console'),
  );
  expect(html).not.toContain('list-lobby-players');
});

describe('Stage 2A entry screens', () => {
  it('shows the room code and name together with one explained inline action until complete', () => {
    const html = renderEntry('join-code');

    expect(html).toContain('data-testid="input-join-code-1"');
    expect(html).toContain('data-testid="input-join-code-6"');
    expect(html).toContain('data-testid="input-join-name"');
    expect(html).toContain('class="entry-inline-primary"');
    expect(html).not.toContain('data-testid="entry-action-dock"');
    expect(html).toContain(en.entry.missingNameAndCode);
    expect(html).toContain('data-testid="entry-primary-dock-button"');
    expect(html).toContain('data-testid="game-status-bar"');
    expect(html).toContain('data-testid="game-happening-card"');
  });

  it('docks the single Join action when the code and name are complete', () => {
    const html = renderEntry(
      'join-code',
      'day',
      {},
      {
        joinCodeEntry: 'ABC234',
        joinName: 'Ava',
      },
    );
    expect(html.match(/data-testid="entry-action-dock"/g)).toHaveLength(1);
    expect(html).not.toContain('data-testid="entry-primary-hint"');
  });

  it('renders host roster rows and the player count in the Lobby status bar', () => {
    const html = renderEntry('lobby');

    expect(html).toContain('data-testid="game-status-bar"');
    expect(html).toContain('2 joined');
    expect(html).toContain('data-testid="player-lobby-seat-ada"');
    expect(html).toContain('data-testid="player-lobby-seat-sam"');
    expect(html).toContain('player-tile');
    expect(html).toContain('data-testid="button-start-game"');
    expect(html).toContain('data-testid="entry-action-dock"');
  });

  it('keeps organiser controls off the waiting-player screen', () => {
    const html = renderEntry('join-wait');

    expect(html).toContain('Waiting for the organiser');
    expect(html).not.toContain('button-start-game');
    expect(html).not.toContain('button-approve-');
  });

  it('puts the named rehearsal action in the dock and labels the selected speed', () => {
    const html = renderEntry(
      'rehearsal-setup',
      'day',
      {},
      { rehearsalName: 'Ava' },
    );
    const dockIndex = html.indexOf('data-testid="entry-action-dock"');
    const rehearsalButtonIndex = html.indexOf(
      'data-testid="button-start-rehearsal"',
    );

    expect(dockIndex).toBeGreaterThanOrEqual(0);
    expect(rehearsalButtonIndex).toBeGreaterThan(dockIndex);
    expect(
      html.match(/<button[^>]*data-testid="button-start-rehearsal"/)?.[0],
    ).not.toContain('disabled');
    expect(html).toContain('Selected');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-testid="input-rehearsal-name"');
    expect(html).toContain('data-testid="brand-footer-entry"');
  });

  it('places practice name errors beside the labelled field', () => {
    const html = renderEntry('rehearsal-setup', 'day', {
      rehearsal: 'Enter a name to continue.',
    });
    const nameInputIndex = html.indexOf('data-testid="input-rehearsal-name"');
    const errorIndex = html.indexOf('Enter a name to continue.');
    const formEndIndex = html.indexOf('</form>', nameInputIndex);

    expect(html).toContain('for="entry-rehearsal-name"');
    expect(nameInputIndex).toBeGreaterThanOrEqual(0);
    expect(errorIndex).toBeGreaterThan(nameInputIndex);
    expect(formEndIndex).toBeGreaterThan(errorIndex);
  });

  it('uses the selected public day or night theme on entry screens', () => {
    expect(renderEntry('join-code')).toContain('data-game-theme="day"');
    expect(renderEntry('lobby', 'night')).toContain('data-game-theme="night"');
    expect(shellCSS).toMatch(
      /\.entry-experience \.entry-heading\s*\{[^}]*font-size:\s*30px/s,
    );
    expect(entryCSS).toMatch(
      /\.coordinator-console\[data-phase='LOBBY'\]\s+h2\s*\{[^}]*font-size:\s*22px/s,
    );
  });
});
