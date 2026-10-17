import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameThemeForPhase } from './game-theme';

describe('shared game-clock theme', () => {
  it('keeps entry and lobby dark, changes every day step to light and night to dark', () => {
    for (const phase of [undefined, 'DRAFT', 'LOBBY', 'SHADOW']) {
      expect(gameThemeForPhase(phase)).toBe('night');
    }
    for (const phase of [
      'DEAL',
      'MISSION',
      'DEBATE',
      'VOTE',
      'VERDICT',
      'DAWN',
      'ENDGAME',
      'FINAL_VOTE',
      'FINAL_BANISH',
      'FINISHED',
      'ARCHIVED',
    ]) {
      expect(gameThemeForPhase(phase)).toBe('day');
      expect(gameThemeForPhase(phase, true)).toBe('night');
    }
  });

  it('uses the same palette for every role, with AA text on both page and panel surfaces', () => {
    const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
    expect(css).toContain('--game-button-fill:');
    expect(css).toContain(".game-shell[data-game-theme='day']");
    const color = (name: string) => {
      const hex = css.match(
        new RegExp(`--${name}:\\s*#([\\da-f]{6})`, 'i'),
      )?.[1];
      if (!hex) throw Error(`Missing brand colour ${name}`);
      return [0, 2, 4].map((offset) =>
        parseInt(hex.slice(offset, offset + 2), 16),
      );
    };
    const luminance = (rgb: number[]) =>
      rgb
        .map((value) => {
          const channel = value / 255;
          return channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
        })
        .reduce(
          (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!,
          0,
        );
    const check = (foreground: number[], background: number[]) => {
      const a = luminance(foreground),
        b = luminance(background);
      expect(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
    };
    for (const [text, surfaces] of [
      ['candle', ['hearth', 'charcoal']],
      ['ash', ['hearth', 'charcoal']],
      ['charcoal', ['candle', 'ash']],
      ['stone', ['candle', 'ash']],
    ] as const) {
      for (const surface of surfaces) check(color(text), color(surface));
    }
    check(color('hearth'), color('gilt'));
    const dayButton = color('gilt').map(
      (value, index) => value * 0.88 + color('candle')[index]! * 0.12,
    );
    check(color('charcoal'), dayButton);
  });
});
