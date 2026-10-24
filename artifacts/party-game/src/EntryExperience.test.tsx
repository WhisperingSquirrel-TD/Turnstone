import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { EntryExperience, type EntryExperienceInputs } from './EntryExperience';
import { en } from './locale/en-GB';

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
  createPlayerCount: 15,
  createCoCoordinatorCount: 0,
  organiserName: '',
  organiserPin: '',
  rehearsalPlayerCount: 8,
  rehearsalSpeed: 'fast',
  rehearsalName: '',
};

function renderEntry(
  screen: 'join-code' | 'lobby' | 'join-wait',
  gameTheme: 'day' | 'night' = 'day',
) {
  return renderToStaticMarkup(
    <EntryExperience
      copy={{
        ...en.entry,
        brand: 'Oathstone',
        brandGoldSuffix: 'stone',
      }}
      gameTheme={gameTheme}
      screen={screen}
      inputs={inputs}
      onInputChange={vi.fn()}
      options={{ tapToReveal: false, largeText: false, simpleLanguage: false }}
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
    />,
  );
}

describe('Stage 2A entry screens', () => {
  it('shows the room code and name together with one docked primary action', () => {
    const html = renderEntry('join-code');

    expect(html).toContain('data-testid="input-join-code-1"');
    expect(html).toContain('data-testid="input-join-code-6"');
    expect(html).toContain('data-testid="input-join-name"');
    expect(html).toContain('data-testid="entry-action-dock"');
    expect(html).toContain('data-testid="entry-primary-dock-button"');
    expect(html).toContain('data-testid="game-status-bar"');
    expect(html).toContain('data-testid="game-happening-card"');
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
