import { describe, expect, it, vi } from 'vitest';
import {
  completePhaseClipFade,
  gameStartNavigationState,
  isFreshGameStartNavigation,
  isPhaseClipEligible,
  phaseClipMarkerKey,
  phaseClipSources,
  publicPhaseClipFor,
  publicPhaseClipEventKey,
  shouldShowPhaseClipPoster,
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
  it('identifies the deliberate public verdict reveal as a new event within the same phase', () => {
    expect(
      publicPhaseClipEventKey('game-a', 2, 'VERDICT', null, false),
    ).not.toBe(publicPhaseClipEventKey('game-a', 2, 'VERDICT', null, true));
    expect(publicPhaseClipEventKey('game-a', 2, 'SHADOW')).toBe(
      publicPhaseClipEventKey('game-a', 2, 'SHADOW', null, false),
    );
  });
  it('accepts only a matching fresh PUSH, never reload, history return or another game', () => {
    const state = gameStartNavigationState('game-a');
    expect(isFreshGameStartNavigation('game-a', 'PUSH', state)).toBe(true);
    expect(isFreshGameStartNavigation('game-a', 'POP', state)).toBe(false);
    expect(isFreshGameStartNavigation('game-a', 'REPLACE', state)).toBe(false);
    expect(isFreshGameStartNavigation('game-b', 'PUSH', state)).toBe(false);
    expect(isFreshGameStartNavigation('game-a', 'PUSH', null)).toBe(false);
  });
  it('plays the opening on a fresh start handoff, but not an ordinary initial load', () => {
    const opening = { ...eligibleInput, phase: 'DEAL' };
    expect(isPhaseClipEligible(opening)).toBe(false);
    expect(isPhaseClipEligible({ ...opening, freshGameStart: true })).toBe(
      true,
    );
    expect(
      isPhaseClipEligible({
        ...opening,
        freshGameStart: true,
        serverNow: 151_000,
      }),
    ).toBe(false);
    expect(
      isPhaseClipEligible({
        ...opening,
        freshGameStart: true,
        alreadyPlayed: true,
      }),
    ).toBe(false);
  });

  it('does not let an old fade timeout close a replacement phase clip', () => {
    const closeCurrentAttempt = vi.fn();

    expect(
      completePhaseClipFade(
        'game-a:1:SHADOW',
        'game-a:1:VERDICT',
        closeCurrentAttempt,
      ),
    ).toBe(false);
    expect(closeCurrentAttempt).not.toHaveBeenCalled();

    expect(
      completePhaseClipFade(
        'game-a:1:SHADOW',
        'game-a:1:SHADOW',
        closeCurrentAttempt,
      ),
    ).toBe(true);
    expect(closeCurrentAttempt).toHaveBeenCalledTimes(1);
  });

  it('maps only public events, requiring public verdict and winner data', () => {
    expect(publicPhaseClipFor('DEAL')).toBe('game-start');
    expect(publicPhaseClipFor('SHADOW')).toBe('nightfall');
    expect(publicPhaseClipFor('DAWN')).toBe('dawn');
    expect(publicPhaseClipFor('VERDICT', null, false)).toBeNull();
    expect(publicPhaseClipFor('VERDICT', null, true)).toBe('verdict');
    expect(publicPhaseClipFor('FINISHED')).toBeNull();
    expect(publicPhaseClipFor('FINISHED', 'faithful')).toBe(
      'gameover-faithful',
    );
    expect(publicPhaseClipFor('FINISHED', 'traitor')).toBe('gameover-traitor');
    for (const phase of ['VOTE', 'FINAL_VOTE', 'FINAL_BANISH', 'ENDGAME']) {
      expect(publicPhaseClipFor(phase)).toBeNull();
    }
  });

  it('marks game-start once per game rather than once per cycle', () => {
    expect(phaseClipMarkerKey('game-a', 1, 'DEAL')).toBe(
      phaseClipMarkerKey('game-a', 9, 'DEAL'),
    );
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

  it.each([
    ['reduced motion', { prefersReducedMotion: true }],
    ['save-data', { saveData: true }],
    ['slow-2g', { effectiveType: 'slow-2g' }],
    ['2g', { effectiveType: '2g' }],
    ['3g', { effectiveType: '3g' }],
  ])('uses a poster instead of video for %s', (_reason, override) => {
    expect(
      shouldShowPhaseClipPoster({
        prefersReducedMotion: false,
        saveData: false,
        effectiveType: '4g',
        ...override,
      }),
    ).toBe(true);
  });

  it('does not use poster-only mode on a regular connection', () => {
    expect(
      shouldShowPhaseClipPoster({
        prefersReducedMotion: false,
        saveData: false,
        effectiveType: '4g',
      }),
    ).toBe(false);
  });
});
