import { describe, expect, it } from 'vitest';
import { buildNewGameConfig } from './new-game-config';

describe('buildNewGameConfig', () => {
  it('keeps the optional presenter disabled by default', () => {
    const config = buildNewGameConfig({
      gameName: 'Friday game',
      playerCount: 8,
      coCoordinatorCount: 0,
      presenterEnabled: false,
    });

    expect(config.presenter.enabled).toBe(false);
  });

  it('enables a presenter only when the organiser opts in', () => {
    const config = buildNewGameConfig({
      gameName: 'Friday game',
      playerCount: 8,
      coCoordinatorCount: 0,
      presenterEnabled: true,
    });

    expect(config.presenter.enabled).toBe(true);
  });

  it('keeps the co-coordinator count in the game configuration', () => {
    const config = buildNewGameConfig({
      gameName: 'Friday game',
      playerCount: 8,
      coCoordinatorCount: 2,
      presenterEnabled: false,
    });

    expect(config.basics.coCoordinators).toBe(2);
  });

  it('defaults in-room games to the speaker-driven voting circle', () => {
    const config = buildNewGameConfig({
      gameName: 'Friday game',
      playerCount: 8,
      coCoordinatorCount: 0,
      presenterEnabled: false,
    });

    expect(config.roundTable.revealStyle).toBe('speaker-circle');
  });

  it('keeps automatic reveal available for video-call and multi-day games', () => {
    const config = buildNewGameConfig({
      gameName: 'Friday game',
      playerCount: 8,
      coCoordinatorCount: 0,
      presenterEnabled: false,
      revealStyle: 'one-by-one',
    });

    expect(config.roundTable.revealStyle).toBe('one-by-one');
  });
});
