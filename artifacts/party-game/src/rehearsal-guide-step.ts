export type RehearsalGuideStepIdentity = {
  phase: string;
  cycle: number;
  deadline: number | null;
  shadowRound: number;
  notesOpen: boolean;
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
