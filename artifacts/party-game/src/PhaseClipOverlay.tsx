import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  completePhaseClipFade,
  isPhaseClipEligible,
  phaseClipMarkerKey,
  phaseClipSources,
  publicPhaseClipFor,
  publicPhaseClipEventKey,
  shouldPrefetchPhaseClips,
  shouldShowPhaseClipPoster,
  type PhaseClipName,
} from './phase-clips';

type NetworkInformation = {
  saveData?: boolean;
  effectiveType?: string;
};

type ClipProps = {
  enabled: boolean;
  gameId: string;
  phase?: string;
  cycle?: number;
  phaseStartedAt?: number;
  serverNow?: number;
  winner?: string | null;
  publicVerdict?: boolean;
  freshGameStart?: boolean;
};

type Attempt = {
  clip: PhaseClipName;
  key: string;
  supportsVp9: boolean;
  phase: string;
  cycle: number;
  phaseStartedAt: number | undefined;
  serverNow: number | undefined;
  gameId: string;
  winner?: string | null;
  publicVerdict: boolean;
  posterOnly: boolean;
};

const SESSION_MARKER_PREFIX = 'oathstone-phase-clip:';
const START_TIMEOUT_MS = 1_000;
const MAX_PLAYBACK_MS = 3_300;
const FADE_MS = 180;

function browserPreferences() {
  const connection = (
    navigator as Navigator & { connection?: NetworkInformation }
  ).connection;
  return {
    prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)')
      .matches,
    saveData: connection?.saveData === true,
    effectiveType: connection?.effectiveType,
  };
}

function supportsVp9(): boolean {
  return (
    document.createElement('video').canPlayType('video/webm; codecs="vp9"') !==
    ''
  );
}

function clipsDisabledByUrl(): boolean {
  return new URLSearchParams(window.location.search).get('clips') === 'off';
}

function sessionHasPlayed(key: string): boolean {
  try {
    return (
      window.sessionStorage.getItem(`${SESSION_MARKER_PREFIX}${key}`) === '1'
    );
  } catch {
    return false;
  }
}

function rememberPlayed(key: string): void {
  try {
    window.sessionStorage.setItem(`${SESSION_MARKER_PREFIX}${key}`, '1');
  } catch {
    // Playback remains safe when storage is unavailable; in-memory deduplication
    // still prevents a repeat during this page session.
  }
}

function addPrefetchLink(url: string, as: 'video' | 'image'): void {
  if (
    Array.from(document.head.querySelectorAll('link[rel="prefetch"]')).some(
      (link) =>
        (link as HTMLLinkElement).href === new URL(url, location.href).href,
    )
  )
    return;
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.as = as;
  link.href = url;
  document.head.append(link);
}

export function PhaseClipOverlay({
  enabled,
  gameId,
  phase,
  cycle,
  phaseStartedAt,
  serverNow,
  winner,
  publicVerdict = false,
  freshGameStart = false,
}: ClipProps) {
  const [environmentVersion, setEnvironmentVersion] = useState(0);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const activeAttemptKey = useRef<string | null>(null);
  activeAttemptKey.current = attempt?.key ?? null;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayHost = useRef<{ key: string; element: HTMLElement } | null>(
    null,
  );
  const previousPhase = useRef<{ gameId: string; identity: string } | null>(
    null,
  );
  const attemptedKeys = useRef(new Set<string>());
  const pendingKeys = useRef(new Set<string>());
  const startupTimer = useRef<number | null>(null);
  const playbackTimer = useRef<number | null>(null);
  const fadeTimer = useRef<number | null>(null);
  const closeRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const updateEnvironment = () => {
      const preferences = browserPreferences();
      if (
        preferences.prefersReducedMotion ||
        preferences.saveData ||
        ['slow-2g', '2g', '3g'].includes(preferences.effectiveType ?? '') ||
        clipsDisabledByUrl()
      )
        closeRef.current();
      setEnvironmentVersion((value) => value + 1);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (startupTimer.current) window.clearTimeout(startupTimer.current);
        if (playbackTimer.current) window.clearTimeout(playbackTimer.current);
        if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
        setAttempt(null);
        setVisible(false);
        setFading(false);
        pendingKeys.current.clear();
      }
      updateEnvironment();
    };
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', updateEnvironment);
    motion.addEventListener('change', updateEnvironment);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', updateEnvironment);
      motion.removeEventListener('change', updateEnvironment);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const preferences = browserPreferences();
    if (
      !shouldPrefetchPhaseClips({
        documentVisible: document.visibilityState === 'visible',
        ...preferences,
        clipsOff: clipsDisabledByUrl(),
      })
    )
      return;

    let cancelled = false;
    let idleHandle: number | null = null;
    let fallbackTimer: number | null = null;
    const prefetch = async () => {
      const vp9 = supportsVp9();
      const clips = [
        'nightfall',
        'dawn',
        'verdict',
        'gameover-faithful',
        'gameover-traitor',
        'game-start',
      ] as const;
      await Promise.all(
        clips.flatMap((clip) => {
          const files = phaseClipSources(clip, vp9);
          const video = files.sources[0]!;
          return [
            fetch(video.src, {
              method: 'HEAD',
              credentials: 'same-origin',
            }).then((response) => {
              if (response.ok && !cancelled)
                addPrefetchLink(video.src, 'video');
            }),
            fetch(files.poster, {
              method: 'HEAD',
              credentials: 'same-origin',
            }).then((response) => {
              if (response.ok && !cancelled)
                addPrefetchLink(files.poster, 'image');
            }),
          ];
        }),
      );
    };
    const runWhenIdle = () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      void prefetch().catch(() => undefined);
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(runWhenIdle, {
        timeout: 2_000,
      });
    } else {
      fallbackTimer = window.setTimeout(runWhenIdle, 1_000);
    }
    return () => {
      cancelled = true;
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle);
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
    };
  }, [enabled, environmentVersion]);

  useEffect(() => {
    if (!phase || cycle === undefined || !gameId) {
      previousPhase.current = null;
      return;
    }
    const identity = publicPhaseClipEventKey(
      gameId,
      cycle,
      phase,
      winner,
      publicVerdict,
    );
    const previous = previousPhase.current;
    if (
      previous &&
      (previous.gameId !== gameId || previous.identity !== identity) &&
      fadeTimer.current !== null
    ) {
      window.clearTimeout(fadeTimer.current);
      fadeTimer.current = null;
    }
    const phaseChangedWhileVisible =
      enabled &&
      previous?.gameId === gameId &&
      previous.identity !== identity &&
      document.visibilityState === 'visible';
    previousPhase.current = { gameId, identity };
    if (!enabled) {
      setAttempt(null);
      setVisible(false);
      return;
    }

    const clip = publicPhaseClipFor(phase, winner, publicVerdict);
    if (!clip) {
      setAttempt(null);
      setVisible(false);
      return;
    }
    const key = phaseClipMarkerKey(gameId, cycle, phase);
    const preferences = browserPreferences();
    const posterOnly = shouldShowPhaseClipPoster(preferences);
    if (
      attemptedKeys.current.has(key) ||
      pendingKeys.current.has(key) ||
      !isPhaseClipEligible({
        gameId,
        phase,
        winner,
        publicVerdict,
        cycle,
        phaseStartedAt,
        serverNow: serverNow ?? Number.NaN,
        phaseChangedWhileVisible,
        freshGameStart,
        documentVisible: document.visibilityState === 'visible',
        ...preferences,
        ...(posterOnly
          ? {
              prefersReducedMotion: false,
              saveData: false,
              effectiveType: '4g',
            }
          : {}),
        clipsOff: clipsDisabledByUrl(),
        alreadyPlayed: sessionHasPlayed(key),
        startup: 'pending',
      })
    )
      return;

    pendingKeys.current.add(key);
    setVisible(false);
    setFading(false);
    setAttempt({
      clip,
      key,
      supportsVp9: supportsVp9(),
      gameId,
      phase,
      cycle,
      phaseStartedAt,
      serverNow,
      winner,
      publicVerdict,
      posterOnly,
    });
  }, [
    enabled,
    gameId,
    phase,
    cycle,
    phaseStartedAt,
    serverNow,
    winner,
    publicVerdict,
    environmentVersion,
    freshGameStart,
  ]);

  useEffect(() => {
    if (!attempt) return;
    const stillEligible = () =>
      isPhaseClipEligible({
        gameId: attempt.gameId,
        phase: attempt.phase,
        winner: attempt.winner,
        publicVerdict: attempt.publicVerdict,
        cycle: attempt.cycle,
        phaseStartedAt: attempt.phaseStartedAt,
        serverNow: attempt.serverNow ?? Number.NaN,
        phaseChangedWhileVisible: true,
        documentVisible: document.visibilityState === 'visible',
        ...browserPreferences(),
        clipsOff: clipsDisabledByUrl(),
        alreadyPlayed: sessionHasPlayed(attempt.key),
        startup: 'started',
      });

    const close = () => {
      if (activeAttemptKey.current !== attempt.key) return;
      if (playbackTimer.current) window.clearTimeout(playbackTimer.current);
      if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
      setFading(true);
      fadeTimer.current = window.setTimeout(() => {
        completePhaseClipFade(activeAttemptKey.current, attempt.key, () => {
          fadeTimer.current = null;
          setAttempt(null);
          setVisible(false);
          setFading(false);
        });
      }, FADE_MS);
    };
    closeRef.current = close;
    if (attempt.posterOnly) {
      pendingKeys.current.delete(attempt.key);
      attemptedKeys.current.add(attempt.key);
      rememberPlayed(attempt.key);
      setVisible(true);
      playbackTimer.current = window.setTimeout(close, MAX_PLAYBACK_MS);
      return () => {
        if (playbackTimer.current) window.clearTimeout(playbackTimer.current);
      };
    }
    const video = videoRef.current;
    if (!video) return;
    const onPlaying = () => {
      if (activeAttemptKey.current !== attempt.key) return;
      if (!stillEligible()) {
        pendingKeys.current.delete(attempt.key);
        setAttempt(null);
        return;
      }
      if (startupTimer.current) window.clearTimeout(startupTimer.current);
      pendingKeys.current.delete(attempt.key);
      attemptedKeys.current.add(attempt.key);
      rememberPlayed(attempt.key);
      setVisible(true);
      playbackTimer.current = window.setTimeout(close, MAX_PLAYBACK_MS);
    };
    const onFailure = () => {
      if (activeAttemptKey.current !== attempt.key) return;
      if (startupTimer.current) window.clearTimeout(startupTimer.current);
      pendingKeys.current.delete(attempt.key);
      attemptedKeys.current.add(attempt.key);
      setAttempt(null);
      setVisible(false);
    };
    startupTimer.current = window.setTimeout(onFailure, START_TIMEOUT_MS);
    video.addEventListener('playing', onPlaying, { once: true });
    video.addEventListener('error', onFailure, { once: true });
    video.load();
    void video.play().catch(onFailure);
    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onFailure);
      if (startupTimer.current) window.clearTimeout(startupTimer.current);
      if (playbackTimer.current) window.clearTimeout(playbackTimer.current);
    };
  }, [attempt]);

  if (!attempt) {
    overlayHost.current = null;
    return null;
  }
  if (overlayHost.current?.key !== attempt.key) {
    overlayHost.current = {
      key: attempt.key,
      element:
        document.querySelector<HTMLDialogElement>(
          'dialog.privacy-shield[open]',
        ) ?? document.body,
    };
  }
  const files = phaseClipSources(attempt.clip, attempt.supportsVp9);

  return createPortal(
    <div
      aria-hidden="true"
      data-clip-name={attempt.clip}
      data-clip-poster-only={attempt.posterOnly ? 'true' : 'false'}
      data-phase-key={attempt.key}
      data-testid="phase-clip-overlay"
      onClick={() => closeRef.current()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') closeRef.current();
      }}
      role="presentation"
      style={{
        background: '#000',
        inset: 0,
        opacity: visible && !fading ? 1 : 0,
        pointerEvents: visible && !fading ? 'auto' : 'none',
        position: 'fixed',
        transition: browserPreferences().prefersReducedMotion
          ? 'none'
          : `opacity ${FADE_MS}ms ease-out`,
        zIndex: 10000,
      }}
    >
      {attempt.posterOnly ? (
        <img
          alt=""
          src={files.poster}
          style={{
            display: 'block',
            height: '100%',
            objectFit: 'cover',
            width: '100%',
          }}
        />
      ) : (
        <video
          key={attempt.key}
          disablePictureInPicture
          disableRemotePlayback
          muted
          playsInline
          poster={files.poster}
          preload="auto"
          ref={videoRef}
          style={{
            display: 'block',
            height: '100%',
            objectFit: 'cover',
            width: '100%',
          }}
        >
          {files.sources.map((source) => (
            <source key={source.type} src={source.src} type={source.type} />
          ))}
        </video>
      )}
    </div>,
    overlayHost.current.element,
  );
}
