import { describe, expect, it } from 'vitest';
import {
  isPhaseClipEligible,
  phaseClipMarkerKey,
  phaseClipSources,
  publicPhaseClipFor,
  shouldPrefetchPhaseClips,
} from './phase-clips';

const eligibleInput = {
  gameId: 'game-a',
  phase: 'SHADOW',
  cycle: 2,
  phaseStartedAt: 90_000,
  serverNow: 100_000,
  phaseChangedWhileVisible: false,
  documentVisible: true,
  prefersReducedMotion: false,
  saveData: false,
  effectiveType: '4g',
  clipsOff: false,
  alreadyPlayed: false,
  startup: 'pending' as const,
};

describe('public phase clips', () => {
  it('maps only public nightfall and dawn phases', () => {
    expect(publicPhaseClipFor('SHADOW')).toBe('nightfall');
    expect(publicPhaseClipFor('DAWN')).toBe('dawn');
    for (const phase of [
      'DEAL',
      'VOTE',
      'VERDICT',
      'FINAL_VOTE',
      'FINAL_BANISH',
      'ENDGAME',
      'FINISHED',
    ]) {
      expect(publicPhaseClipFor(phase)).toBeNull();
    }
  });

  it('allows a current public phase and a visible transition even if resync is delayed', () => {
    expect(isPhaseClipEligible(eligibleInput)).toBe(true);
    expect(
      isPhaseClipEligible({
        ...eligibleInput,
        phaseStartedAt: 1,
        serverNow: 100_000,
        phaseChangedWhileVisible: true,
      }),
    ).toBe(true);
  });

  it.each([
    ['reduced motion', { prefersReducedMotion: true }],
    ['data saver', { saveData: true }],
    ['slow-2g', { effectiveType: 'slow-2g' }],
    ['2g', { effectiveType: '2g' }],
    ['3g', { effectiveType: '3g' }],
    ['hidden tab', { documentVisible: false }],
    ['clips disabled in the URL', { clipsOff: true }],
    ['already played for this phase', { alreadyPlayed: true }],
    ['stale phase', { phaseStartedAt: 1, serverNow: 61_002 }],
    ['video error', { startup: 'error' as const }],
    ['video did not start in time', { startup: 'timeout' as const }],
  ])('skips for %s', (_reason, override) => {
    expect(isPhaseClipEligible({ ...eligibleInput, ...override })).toBe(false);
  });

  it('uses a harmless marker scoped to game, cycle and public phase', () => {
    expect(phaseClipMarkerKey('game-a', 2, 'SHADOW')).toBe('game-a:2:SHADOW');
    expect(phaseClipMarkerKey('game-a', 3, 'SHADOW')).not.toBe(
      phaseClipMarkerKey('game-a', 2, 'SHADOW'),
    );
  });

  it('orders sources by browser support and includes the poster', () => {
    expect(phaseClipSources('nightfall', true)).toEqual({
      poster: '/clips/nightfall-poster.webp',
      sources: [
        { src: '/clips/nightfall.webm', type: 'video/webm' },
        { src: '/clips/nightfall.mp4', type: 'video/mp4' },
      ],
    });
    expect(phaseClipSources('dawn', false)).toEqual({
      poster: '/clips/dawn-poster.webp',
      sources: [
        { src: '/clips/dawn.mp4', type: 'video/mp4' },
        { src: '/clips/dawn.webm', type: 'video/webm' },
      ],
    });
  });

  it('prefetches without role-dependent conditions, but respects bandwidth and motion settings', () => {
    const publicConditions = {
      documentVisible: true,
      prefersReducedMotion: false,
      saveData: false,
      effectiveType: '4g',
      clipsOff: false,
    };
    expect(shouldPrefetchPhaseClips(publicConditions)).toBe(true);
    expect(
      shouldPrefetchPhaseClips({ ...publicConditions, saveData: true }),
    ).toBe(false);
    expect(
      shouldPrefetchPhaseClips({
        ...publicConditions,
        prefersReducedMotion: true,
      }),
    ).toBe(false);
  });
});
