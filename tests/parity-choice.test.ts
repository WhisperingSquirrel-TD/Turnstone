import { describe, expect, it } from 'vitest';
import { buildNewGameConfig } from '../artifacts/party-game/src/new-game-config';

// D121: the organiser chooses the parity win at setup; the default stays on.
describe('parity win choice at setup', () => {
  const input = {
    gameName: 'Test',
    playerCount: 15,
    coCoordinatorCount: 0,
    presenterEnabled: false,
  };

  it('keeps the parity win on by default', () => {
    expect(buildNewGameConfig(input).endgame.parity).toBe(true);
  });

  it('switches the parity win off when the organiser chooses', () => {
    expect(
      buildNewGameConfig({ ...input, parityWin: false }).endgame.parity,
    ).toBe(false);
    expect(
      buildNewGameConfig({ ...input, parityWin: true }).endgame.parity,
    ).toBe(true);
  });
});
