import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  GameBottomBar,
  GameHelpDisclosure,
  GameStatusBar,
  PlayerTile,
  WhatIsHappeningCard,
  gameStatusLabel,
} from './GameChrome';
import { ConversationPromptsCard } from './ConversationPromptsCard';

const themeCSS = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const shellCSS = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

function themeTokens(theme: 'day' | 'night') {
  const block =
    theme === 'day'
      ? themeCSS.match(
          /\.game-shell\[data-game-theme='day'\]\s*\{([^}]+)\}/,
        )?.[1]
      : themeCSS.match(/\.game-shell\s*\{([^}]+)\}/)?.[1];
  if (!block) throw new Error(`Missing ${theme} theme token block`);
  const token = (name: string) => {
    const value = block.match(
      new RegExp(`--game-${name}:\\s*(#[0-9a-fA-F]{6})`),
    )?.[1];
    if (!value) throw new Error(`Missing ${theme} --game-${name}`);
    return value;
  };
  return {
    background: token('bg'),
    surface: token('surface'),
    text: token('text'),
    muted: token('muted'),
    accent: token('accent'),
    onAccent: token('on-accent'),
    alert: token('alert'),
  };
}

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((part) => Number.parseInt(part, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(first: string, second: string) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe('shared game chrome', () => {
  it.each(['day', 'night'] as const)(
    'keeps all theme text and action colours at AA contrast in %s mode',
    (theme) => {
      const tokens = themeTokens(theme);
      for (const foreground of [
        tokens.text,
        tokens.muted,
        tokens.accent,
        tokens.alert,
      ]) {
        expect(contrast(foreground, tokens.background)).toBeGreaterThanOrEqual(
          4.5,
        );
      }
      expect(contrast(tokens.text, tokens.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens.muted, tokens.surface)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrast(tokens.onAccent, tokens.accent)).toBeGreaterThanOrEqual(
        4.5,
      );
    },
  );

  it('labels public phases as day or night without role-specific content', () => {
    expect(gameStatusLabel('DEBATE', 2)).toBe('Day 2 · Talk');
    expect(gameStatusLabel('SHADOW', 2)).toBe('Night 2 · Shadow');
    expect(gameStatusLabel('VOTE', 3)).toBe('Day 3 · Vote');
  });

  it('shows remaining players and a word-labelled connection state', () => {
    const html = renderToStaticMarkup(
      <GameStatusBar
        phase="SHADOW"
        cycle={2}
        remaining={4}
        connectionStatus="reconnecting"
      />,
    );

    expect(html).toContain('data-testid="game-status-bar"');
    expect(html).toContain('Night 2 · Shadow');
    expect(html).toContain('4 left');
    expect(html).toContain('Reconnecting');
    expect(html).not.toContain('Connecting…');
  });

  it('keeps Notes and organiser tools in the compact status row', () => {
    const html = renderToStaticMarkup(
      <GameStatusBar
        phase="DEBATE"
        cycle={1}
        remaining={6}
        connectionStatus="connected"
        onOpenNotes={() => undefined}
        menuContent={
          <>
            <a href="/coordinate/game">Organiser controls</a>
            <details>
              <summary>Display</summary>
              <label>Always dark</label>
            </details>
          </>
        }
      />,
    );

    expect(html).toContain('data-testid="button-open-notes"');
    expect(html).toContain('data-testid="game-status-menu"');
    expect(html).toContain('>Menu</summary>');
    expect(html).toContain('Organiser controls');
    expect(html).toContain('Always dark');
    expect(html).toMatch(
      /data-testid="game-status-bar"[\s\S]*data-testid="button-open-notes"[\s\S]*data-testid="game-status-menu"/,
    );
  });

  it('keeps top-row actions at touch size and status text legible on narrow phones', () => {
    expect(shellCSS).toMatch(
      /\.game-status-notes\s*\{[^}]*min-height:\s*44px/s,
    );
    expect(shellCSS).toMatch(
      /\.game-shell\s+\.game-status-bar\s+\.game-status-notes\s*\{[^}]*font-size:\s*13px/s,
    );
    expect(shellCSS).toMatch(
      /\.game-status-menu\s*>\s*summary\s*\{[^}]*min-height:\s*44px/s,
    );
    expect(shellCSS).toMatch(
      /@media\s*\(max-width:\s*430px\)[\s\S]*?\.game-status-bar\s*\{\s*font-size:\s*13px;/,
    );
  });

  it('labels the shared public explanation and marks repeated choices with an accent class', () => {
    const html = renderToStaticMarkup(
      <WhatIsHappeningCard accent>
        The same public reason for every player.
      </WhatIsHappeningCard>,
    );

    expect(html).toContain('What is happening');
    expect(html).toContain('game-happening-card--accent');
    expect(html).toContain('The same public reason for every player.');
  });

  it('shows selected and out states with words as well as visual markers', () => {
    const selected = renderToStaticMarkup(
      <PlayerTile name="Alex" state="selected" onSelect={() => undefined} />,
    );
    const out = renderToStaticMarkup(<PlayerTile name="Sam" state="out" />);

    expect(selected).toContain('Alex');
    expect(selected).toContain('Selected');
    expect(selected).toContain('aria-pressed="true"');
    expect(selected).toContain('player-tile--selected');
    expect(shellCSS).toMatch(
      /\.player-tile--selected\s*\{[^}]*border:\s*2\.5px solid var\(--game-accent\)/s,
    );
    expect(out).toContain('Sam');
    expect(out).toContain('Out');
  });

  it("keeps the screen-lock notice inside the collapsed What's this disclosure", () => {
    const html = renderToStaticMarkup(
      <GameHelpDisclosure screenLockNotice="Your screen may lock during play. Tap it to keep the game visible.">
        <p>Phase guidance.</p>
      </GameHelpDisclosure>,
    );

    expect(html).toMatch(
      /<details[^>]*data-testid="game-help-disclosure"[^>]*><summary[^>]*>What&#x27;s this\?<\/summary>/,
    );
    expect(html).toContain('data-testid="wake-lock-notice"');
    expect(html).toContain('Phase guidance.');
    expect(html).not.toMatch(/<details[^>]*\sopen(?:=|\s|>)/);
  });

  it('provides only the Game and Players destinations in the bottom bar', () => {
    const html = renderToStaticMarkup(<GameBottomBar active="game" />);

    expect(html).toContain('aria-label="Game navigation"');
    expect(html).toContain('>Game<');
    expect(html).toContain('>Players<');
    expect(html).not.toContain('>Notes<');
  });

  it('limits the conversation prompt card to three body-sized prompts', () => {
    const html = renderToStaticMarkup(
      <ConversationPromptsCard
        title="Conversation prompts"
        prompts={[
          { id: 'one', when: 'always', text: 'First prompt?' },
          { id: 'two', when: 'always', text: 'Second prompt?' },
          { id: 'three', when: 'always', text: 'Third prompt?' },
          { id: 'four', when: 'always', text: 'Fourth prompt?' },
        ]}
      />,
    );

    expect(html.match(/<li\b/g)).toHaveLength(3);
    expect(html).toContain('text-base');
    expect(html).not.toContain('Fourth prompt?');
  });
});
