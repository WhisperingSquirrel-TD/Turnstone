export type PhaseClipName =
  | 'nightfall'
  | 'dawn'
  | 'verdict'
  | 'gameover-faithful'
  | 'gameover-traitor'
  | 'game-start';

export type ClipStartupState = 'pending' | 'started' | 'error' | 'timeout';

export type PhaseClipEligibilityInput = {
  gameId: string;
  phase: string;
  winner?: string | null;
  publicVerdict?: boolean;
  cycle: number;
  phaseStartedAt: number | null | undefined;
  serverNow: number;
  phaseChangedWhileVisible: boolean;
  freshGameStart?: boolean;
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

export function gameStartNavigationState(gameId: string) {
  return { phaseClipStartGameId: gameId };
}

export function isFreshGameStartNavigation(
  gameId: string,
  navigationType: string,
  state: unknown,
): boolean {
  return (
    navigationType === 'PUSH' &&
    state !== null &&
    typeof state === 'object' &&
    'phaseClipStartGameId' in state &&
    state.phaseClipStartGameId === gameId
  );
}

export function publicPhaseClipFor(
  phase: string,
  winner?: string | null,
  publicVerdict = false,
): PhaseClipName | null {
  if (phase === 'DEAL') return 'game-start';
  if (phase === 'SHADOW') return 'nightfall';
  if (phase === 'DAWN') return 'dawn';
  if (phase === 'VERDICT' && publicVerdict) return 'verdict';
  if (phase === 'FINISHED' && winner === 'faithful') return 'gameover-faithful';
  if (phase === 'FINISHED' && winner === 'traitor') return 'gameover-traitor';
  return null;
}

export function phaseClipMarkerKey(
  gameId: string,
  cycle: number,
  phase: string,
): string {
  if (phase === 'DEAL') return `${gameId}:game-start`;
  return `${gameId}:${cycle}:${phase}`;
}

export function publicPhaseClipEventKey(
  gameId: string,
  cycle: number,
  phase: string,
  winner?: string | null,
  publicVerdict = false,
): string {
  return `${phaseClipMarkerKey(gameId, cycle, phase)}:${
    publicPhaseClipFor(phase, winner, publicVerdict) ?? 'none'
  }`;
}

export function completePhaseClipFade(
  activeAttemptKey: string | null,
  closingAttemptKey: string,
  complete: () => void,
): boolean {
  if (activeAttemptKey !== closingAttemptKey) return false;
  complete();
  return true;
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
  const clip = publicPhaseClipFor(
    input.phase,
    input.winner,
    input.publicVerdict,
  );
  if (!input.gameId || !clip) return false;
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
  if (clip === 'game-start')
    return (
      input.phaseChangedWhileVisible ||
      (input.freshGameStart === true &&
        Number.isFinite(phaseAge) &&
        phaseAge >= 0 &&
        phaseAge <= 60_000)
    );
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

export function shouldShowPhaseClipPoster(input: {
  prefersReducedMotion: boolean;
  saveData: boolean;
  effectiveType: string | null | undefined;
}): boolean {
  return (
    input.prefersReducedMotion ||
    input.saveData ||
    ['slow-2g', '2g', '3g'].includes(input.effectiveType ?? '')
  );
}
