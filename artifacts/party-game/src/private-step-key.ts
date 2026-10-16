export type PrivateStepKeyInput = {
  phase: string;
  cycle: number;
  deadline: number | null;
  shadowSlot: number;
  shadowRound: number;
  notesOpen: boolean;
};

export function privateStepKeyFor({
  phase,
  cycle,
  deadline,
  shadowSlot,
  notesOpen,
}: PrivateStepKeyInput) {
  const timing =
    phase === 'SHADOW' ? 'continuous-night' : (deadline ?? 'manual');
  return `${phase}:${cycle}:${timing}:${shadowSlot}:${notesOpen ? 'notes' : 'phase'}`;
}

export type ShadowChoiceWindow = {
  gameId: string;
  cycle: number;
  slot: number;
  round: number;
};

export function shouldPreserveShadowChoice(
  previous: ShadowChoiceWindow | null,
  next: ShadowChoiceWindow | null,
) {
  return Boolean(
    previous &&
    next &&
    previous.gameId === next.gameId &&
    previous.cycle === next.cycle &&
    previous.slot === next.slot &&
    previous.round === 1 &&
    next.round === 2,
  );
}
