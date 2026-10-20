export type PhaseClipName = 'nightfall' | 'dawn';

export const PUBLIC_PHASE_CLIPS: Readonly<Record<string, PhaseClipName>> = {
  SHADOW: 'nightfall',
  DAWN: 'dawn',
};

export type ClipStartupState = 'pending' | 'started' | 'error' | 'timeout';

export type PhaseClipEligibilityInput = {
  gameId: string;
  phase: string;
  cycle: number;
  phaseStartedAt: number | null | undefined;
  serverNow: number;
  phaseChangedWhileVisible: boolean;
  documentVisible: boolean;
  prefersReducedMotion: boolean;
  saveData: boolean;
  effectiveType: string | null | undefined;
  clipsOff: boolean;
  alreadyPlayed: boolean;
  startup: ClipStartupState;
};

export type PhaseClipSource = {
  src: string;
  type: 'video/webm' | 'video/mp4';
};

export function publicPhaseClipFor(phase: string): PhaseClipName | null {
  return PUBLIC_PHASE_CLIPS[phase] ?? null;
}

export function phaseClipMarkerKey(
  gameId: string,
  cycle: number,
  phase: string,
): string {
  return `${gameId}:${cycle}:${phase}`;
}

export function phaseClipSources(
  clip: PhaseClipName,
  supportsVp9: boolean,
): { poster: string; sources: PhaseClipSource[] } {
  const webm = { src: `/clips/${clip}.webm`, type: 'video/webm' as const };
  const mp4 = { src: `/clips/${clip}.mp4`, type: 'video/mp4' as const };
  return {
    poster: `/clips/${clip}-poster.webp`,
    sources: supportsVp9 ? [webm, mp4] : [mp4, webm],
  };
}

export function isPhaseClipEligible(input: PhaseClipEligibilityInput): boolean {
  if (!input.gameId || !publicPhaseClipFor(input.phase)) return false;
  if (
    !input.documentVisible ||
    input.prefersReducedMotion ||
    input.saveData ||
    ['slow-2g', '2g', '3g'].includes(input.effectiveType ?? '') ||
    input.clipsOff ||
    input.alreadyPlayed ||
    input.startup === 'error' ||
    input.startup === 'timeout'
  )
    return false;

  const phaseAge = input.serverNow - (input.phaseStartedAt ?? Number.NaN);
  return (
    input.phaseChangedWhileVisible ||
    (Number.isFinite(phaseAge) && phaseAge >= 0 && phaseAge <= 60_000)
  );
}

export function shouldPrefetchPhaseClips(input: {
  documentVisible: boolean;
  prefersReducedMotion: boolean;
  saveData: boolean;
  effectiveType: string | null | undefined;
  clipsOff: boolean;
}): boolean {
  return (
    input.documentVisible &&
    !input.prefersReducedMotion &&
    !input.saveData &&
    !['slow-2g', '2g', '3g'].includes(input.effectiveType ?? '') &&
    !input.clipsOff
  );
}
