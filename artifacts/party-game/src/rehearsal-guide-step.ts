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
  dismissedStepKeys: ReadonlySet<string>;
};

export function rehearsalGuideStepKey({
  phase,
  notesOpen,
}: RehearsalGuideStepIdentity): string {
  return notesOpen ? 'NOTES' : phase;
}

export function shouldShowRehearsalGuide({
  rehearsal,
  started,
  explanationAvailable,
  stepKey,
  dismissedStepKeys,
}: RehearsalGuideVisibility): boolean {
  return (
    rehearsal &&
    (!started || (explanationAvailable && !dismissedStepKeys.has(stepKey)))
  );
}
