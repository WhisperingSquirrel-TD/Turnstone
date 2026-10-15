export type RehearsalGuideStepIdentity = {
  phase: string;
  cycle: number;
  deadline: number | null;
  shadowRound: number;
  notesOpen: boolean;
};

export type RehearsalGuideVisibility = {
  rehearsal: boolean;
  started: boolean;
  explanationAvailable: boolean;
  stepKey: string;
  dismissedStepKey: string | null;
};

export function rehearsalGuideStepKey({
  phase,
  cycle,
  deadline,
  shadowRound,
  notesOpen,
}: RehearsalGuideStepIdentity): string {
  return `${phase}:${cycle}:${deadline ?? 'manual'}:${shadowRound}:${notesOpen ? 'notes' : 'phase'}`;
}

export function shouldShowRehearsalGuide({
  rehearsal,
  started,
  explanationAvailable,
  stepKey,
  dismissedStepKey,
}: RehearsalGuideVisibility): boolean {
  return (
    rehearsal &&
    (!started || (explanationAvailable && dismissedStepKey !== stepKey))
  );
}
