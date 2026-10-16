export type RehearsalGuideStepIdentity = {
  phase: string;
  cycle: number;
  deadline: number | null;
  revote: boolean;
  shadowRound: number;
  shadowSlot: number;
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
  revote,
  shadowRound,
  shadowSlot,
  notesOpen,
}: RehearsalGuideStepIdentity): string {
  return `${phase}:${cycle}:${deadline ?? 'manual'}:${revote ? 'revote' : 'initial'}:${shadowSlot}:${shadowRound}:${notesOpen ? 'notes' : 'phase'}`;
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
