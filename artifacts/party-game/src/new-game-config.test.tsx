import { describe, expect, it } from 'vitest';
import { buildNewGameConfig } from './new-game-config';

describe('buildNewGameConfig', () => {
  it('keeps the optional presenter disabled by default', () => {
    const config = buildNewGameConfig({
      gameName: 'Friday game',
      playerCount: 8,
      presenterEnabled: false,
    });

    expect(config.presenter.enabled).toBe(false);
  });

  it('enables a presenter only when the organiser opts in', () => {
    const config = buildNewGameConfig({
      gameName: 'Friday game',
      playerCount: 8,
      presenterEnabled: true,
    });

    expect(config.presenter.enabled).toBe(true);
  });
});
