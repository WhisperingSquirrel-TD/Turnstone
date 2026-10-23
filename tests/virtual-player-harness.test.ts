import { describe, expect, it } from 'vitest';
import {
  buildVirtualPlayerScenario,
  createProgressWatchdog,
  createSeededRandom,
  playerStepIdentity,
  observeOrganiserAdvance,
} from '../e2e/support/virtual-player-harness';
import { createTestOnlyRandom } from '../artifacts/api-server/src/test-only-random';

describe('virtual-player harness helpers', () => {
  it('returns to player actions when a pending shadow round or slot changes', () => {
    const expected = playerStepIdentity({
      phase: 'SHADOW',
      shadowRound: '1',
      shadowSlot: '1',
    })!;
    for (const current of [
      { phase: 'SHADOW', shadowRound: '2', shadowSlot: '1' },
      { phase: 'SHADOW', shadowRound: '1', shadowSlot: '2' },
    ]) {
      // The new step has fresh pending actions: its advance control is disabled.
      expect(
        observeOrganiserAdvance(expected, playerStepIdentity(current), false),
      ).toBe('step-changed');
      // A stale enabled control must not advance the new step either.
      expect(
        observeOrganiserAdvance(expected, playerStepIdentity(current), true),
      ).toBe('step-changed');
    }
  });

  it('keeps pending actions blocked within the expected step', () => {
    const expected = playerStepIdentity({
      phase: 'SHADOW',
      shadowRound: '2',
      shadowSlot: '1',
    })!;
    expect(observeOrganiserAdvance(expected, expected, false)).toBe('waiting');
    expect(observeOrganiserAdvance(expected, null, true)).toBe('waiting');
    expect(observeOrganiserAdvance(expected, expected, true)).toBe('enabled');
  });

  it('identifies genuine phase, shadow round and shadow slot transitions', () => {
    const firstWindow = {
      phase: 'SHADOW',
      shadowRound: '1',
      shadowSlot: '1',
      version: '62',
      progressDone: '5',
    };
    const original = playerStepIdentity(firstWindow);
    expect(original).not.toBeNull();
    expect(playerStepIdentity({ ...firstWindow, phase: 'DAWN' })).not.toBe(
      original,
    );
    expect(playerStepIdentity({ ...firstWindow, shadowRound: '2' })).not.toBe(
      original,
    );
    expect(playerStepIdentity({ ...firstWindow, shadowSlot: '2' })).not.toBe(
      original,
    );
    expect(
      playerStepIdentity({
        ...firstWindow,
        version: '68',
        progressDone: '0',
      }),
    ).toBe(original);
    expect(playerStepIdentity({})).toBeNull();
    expect(playerStepIdentity({ phase: 'SHADOW' })).toBeNull();
    expect(
      playerStepIdentity({ phase: 'VOTE', shadowRound: '2', shadowSlot: '2' }),
    ).toBe(playerStepIdentity({ phase: 'VOTE' }));
  });

  it('produces a repeatable seeded random stream', () => {
    const first = createSeededRandom('h1-seed-6001');
    const replay = createSeededRandom('h1-seed-6001');
    const other = createSeededRandom('h1-seed-6002');

    const firstValues = Array.from({ length: 8 }, () => first());
    expect(firstValues).toEqual(Array.from({ length: 8 }, () => replay()));
    expect(firstValues).not.toEqual(Array.from({ length: 8 }, () => other()));
    expect(firstValues.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('keeps the test server engine random stream independently replayable', () => {
    const first = createTestOnlyRandom('h1-seed-6001:engine');
    const replay = createTestOnlyRandom('h1-seed-6001:engine');
    const other = createTestOnlyRandom('h1-seed-6002:engine');

    const firstValues = [first.int(1_000), ...first.bytes(8)];
    const replayValues = [replay.int(1_000), ...replay.bytes(8)];
    const otherValues = [other.int(1_000), ...other.bytes(8)];

    expect(firstValues).toEqual(replayValues);
    expect(firstValues).not.toEqual(otherValues);
    expect(first.int(0)).toBe(0);
  });

  it('builds a replayable six-player scenario with desktop and phone profiles', () => {
    const scenario = buildVirtualPlayerScenario('h1-seed-6001', 6);
    const replay = buildVirtualPlayerScenario('h1-seed-6001', 6);

    expect(scenario).toEqual(replay);
    expect(scenario.players).toHaveLength(6);
    expect(new Set(scenario.players.map((player) => player.id)).size).toBe(6);
    expect(new Set(scenario.players.map((player) => player.name)).size).toBe(6);
    expect(scenario.players.map((player) => player.profile)).toEqual(
      expect.arrayContaining(['desktop', 'pixel']),
    );
    expect(scenario.replayCommand).toBe(
      'VIRTUAL_PLAYER_COUNT=6 VIRTUAL_PLAYER_SEED=h1-seed-6001 VIRTUAL_PLAYER_STAGE=H1 REHEARSAL_PROFILE=Pixel bash scripts/browser-runtime.sh pnpm exec playwright test --config=playwright.rehearsal.config.ts --grep @virtual-player-h1 --timeout=540000',
    );
  });

  it('builds a replayable 12-player H2 scenario and command', () => {
    const scenario = buildVirtualPlayerScenario('h2-seed-1201', 12, 'H2');

    expect(scenario.playerCount).toBe(12);
    expect(scenario.players).toHaveLength(12);
    expect(scenario.replayCommand).toBe(
      'VIRTUAL_PLAYER_COUNT=12 VIRTUAL_PLAYER_SEED=h2-seed-1201 VIRTUAL_PLAYER_STAGE=H2 REHEARSAL_PROFILE=Pixel bash scripts/browser-runtime.sh pnpm exec playwright test --config=playwright.rehearsal.config.ts --grep @virtual-player-h2 --timeout=540000',
    );
  });

  it('rejects player counts outside the real-game range', () => {
    expect(() => buildVirtualPlayerScenario('invalid-low', 4)).toThrow(
      /between 5 and 40/,
    );
    expect(() => buildVirtualPlayerScenario('invalid-high', 41)).toThrow(
      /between 5 and 40/,
    );
    expect(() => buildVirtualPlayerScenario('invalid-fraction', 5.5)).toThrow(
      /whole number/,
    );
  });

  it('resets the watchdog only when the visible screen changes', () => {
    const watchdog = createProgressWatchdog('lobby', 1_000, 100);

    expect(watchdog.observe('lobby', 1_099)).toBe('waiting');
    expect(watchdog.observe('game:DEAL', 1_100)).toBe('progressed');
    expect(watchdog.observe('game:DEAL', 2_099)).toBe('waiting');
    expect(watchdog.observe('game:DEAL', 2_100)).toBe('stalled');
  });
});
